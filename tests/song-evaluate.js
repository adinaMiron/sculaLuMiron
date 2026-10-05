// Song v2 evaluation against independently labeled, unaccompanied WAV takes.
// Usage: node tests/song-evaluate.js path/to/manifest.json
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const os=require('node:os');
const {performance}=require('node:perf_hooks');
require('../js/audio/analysis.js');
require('../js/audio/performance.js');

const P=globalThis.ScuLaPerformance;
const round=n=>Math.round(n*10000)/10000;
function validateNotes(notes,where){
 if(!Array.isArray(notes))throw new Error(`${where}: notes must be an array`);
 let end=0;
 notes.forEach((n,i)=>{
  if(!n || !Number.isInteger(n.midi) || n.midi<0 || n.midi>127 || !Number.isFinite(n.onset) || !Number.isFinite(n.offset) || n.onset<0 || n.offset<=n.onset || (i && n.onset<notes[i-1].onset))throw new Error(`${where}: invalid note ${i}`);
  end=Math.max(end,n.offset);
 });
 return end;
}
function comparable(a,b){
 const overlap=Math.min(a.offset,b.offset)-Math.max(a.onset,b.onset);
 return Math.abs(a.onset-b.onset)<=.25 || overlap>=.25*Math.min(a.offset-a.onset,b.offset-b.onset);
}
// Monotone alignment prevents one detected note from satisfying two references.
// Pitch is deliberately excluded from alignment, so octave errors are counted.
function compare(reference,detected,{pitchTolerance=.5,timingTolerance=.05}={}){
 validateNotes(reference,'reference');validateNotes(detected,'detected');
 const rows=reference.length+1,cols=detected.length+1;
 const dp=Array.from({length:rows},()=>Array(cols).fill(Infinity));
 const back=Array.from({length:rows},()=>Array(cols).fill(null));dp[0][0]=0;
 const put=(i,j,c,step)=>{if(c<dp[i][j]){dp[i][j]=c;back[i][j]=step;}};
 for(let i=0;i<rows;i++)for(let j=0;j<cols;j++){
  const c=dp[i][j];if(!Number.isFinite(c))continue;
  if(i<reference.length)put(i+1,j,c+1,'miss');
  if(j<detected.length)put(i,j+1,c+1,'extra');
  if(i<reference.length && j<detected.length && comparable(reference[i],detected[j])){
   const timing=Math.abs(reference[i].onset-detected[j].onset)+Math.abs(reference[i].offset-detected[j].offset);
   put(i+1,j+1,c+.1+Math.min(1.7,timing),'match');
  }
 }
 const pairs=[];let missed=0,extra=0,i=reference.length,j=detected.length;
 while(i||j){const step=back[i][j];if(step==='match'){pairs.push([--i,--j]);}else if(step==='miss'){i--;missed++;}else if(step==='extra'){j--;extra++;}else throw new Error('alignment failed');}
 pairs.reverse();
 let pitchCorrect=0,noteCorrect=0,octaveErrors=0,onsetError=0,offsetError=0;
 const matches=pairs.map(([ri,di])=>{
  const r=reference[ri],d=detected[di],delta=d.midi-r.midi,oe=Math.abs(d.onset-r.onset),fe=Math.abs(d.offset-r.offset);
  const pitch=Math.abs(delta)<=pitchTolerance,octave=Math.abs(Math.abs(delta)-12)<=pitchTolerance;
  if(pitch)pitchCorrect++;if(octave)octaveErrors++;if(pitch && oe<=timingTolerance && fe<=timingTolerance)noteCorrect++;
  onsetError+=oe;offsetError+=fe;
  return {referenceIndex:ri,detectedIndex:di,pitchDelta:round(delta),onsetErrorSeconds:round(d.onset-r.onset),offsetErrorSeconds:round(d.offset-r.offset)};
 });
 const count=reference.length;
 return {referenceNotes:count,detectedNotes:detected.length,matched:pairs.length,noteCorrect,pitchCorrect,noteAccuracy:count?round(noteCorrect/count):detected.length?0:1,pitchAccuracy:count?round(pitchCorrect/count):detected.length?0:1,octaveErrors,missedNotes:missed,extraNotes:extra,meanAbsoluteOnsetErrorSeconds:pairs.length?round(onsetError/pairs.length):null,meanAbsoluteOffsetErrorSeconds:pairs.length?round(offsetError/pairs.length):null,matches};
}
const sha256=data=>crypto.createHash('sha256').update(data).digest('hex');
const nonempty=value=>typeof value==='string' && value.trim().length>0;
function validateManifest(manifest){
 if(!manifest || ![1,2].includes(manifest.schemaVersion) || !Array.isArray(manifest.recordings) || !manifest.recordings.length)throw new Error('manifest: expected schemaVersion 1 or 2 and nonempty recordings');
 const human=manifest.schemaVersion===2,ids=new Set(),participants=new Map();
 if(human && (!manifest.corpus || !nonempty(manifest.corpus.id) || !nonempty(manifest.corpus.version)))throw new Error('manifest: corpus id/version required');
 for(const entry of manifest.recordings){
  if(!entry || !nonempty(entry.id) || ids.has(entry.id) || !nonempty(entry.wav))throw new Error('manifest: invalid or duplicate id/WAV');
  ids.add(entry.id);validateNotes(entry.notes,entry.id);
  if(!human)continue;
  const fail=message=>{throw new Error(`${entry.id}: ${message}`);};
  if(!['tuning','held-out'].includes(entry.split) || !nonempty(entry.participantId))fail('participantId and tuning/held-out split required');
  if(participants.has(entry.participantId) && participants.get(entry.participantId)!==entry.split)fail('participant appears in both splits');
  participants.set(entry.participantId,entry.split);
  if(!/^[a-f0-9]{64}$/.test(entry.sha256 || ''))fail('lowercase WAV sha256 required');
  if(!entry.consent || entry.consent.evaluation!==true || entry.consent.redistribution!==true || !nonempty(entry.consent.record))fail('evaluation and redistribution consent with record reference required');
  if(!entry.license || !nonempty(entry.license.id) || !nonempty(entry.license.text) || !nonempty(entry.license.attribution))fail('license id, exact text and attribution required');
  const a=entry.annotation;
  if(!a || a.independent!==true || !nonempty(a.annotatorId) || !nonempty(a.reviewerId) || a.annotatorId===a.reviewerId || !nonempty(a.method))fail('independent annotation and separate reviewer required');
  if(!nonempty(entry.microphone) || !nonempty(entry.environment) || !Array.isArray(entry.tags) || !entry.tags.length || !entry.tags.every(nonempty))fail('microphone, environment and condition tags required');
 }
}
function summarize(recordings){
 const result={recordings:recordings.length};
 for(const key of ['referenceNotes','detectedNotes','matched','noteCorrect','pitchCorrect','octaveErrors','missedNotes','extraNotes'])result[key]=recordings.reduce((sum,r)=>sum+r[key],0);
 for(const [metric,key] of [['noteAccuracy','noteCorrect'],['pitchAccuracy','pitchCorrect']])result[metric]=result.referenceNotes?round(result[key]/result.referenceNotes):result.detectedNotes?0:1;
 for(const edge of ['Onset','Offset']){
  const sum=recordings.reduce((total,r)=>total+r.matches.reduce((n,m)=>n+Math.abs(m[edge.toLowerCase()+'ErrorSeconds']),0),0);
  result['meanAbsolute'+edge+'ErrorSeconds']=result.matched?round(sum/result.matched):null;
 }
 result.audioSeconds=round(recordings.reduce((sum,r)=>sum+r.audioSeconds,0));
 result.analysisMilliseconds=round(recordings.reduce((sum,r)=>sum+r.analysisMilliseconds,0));
 result.realtimeFactor=result.audioSeconds?round(result.analysisMilliseconds/1000/result.audioSeconds):null;
 return result;
}
async function evaluate(manifestPath){
 const full=path.resolve(manifestPath),manifestBytes=fs.readFileSync(full),manifest=JSON.parse(manifestBytes.toString('utf8'));
 validateManifest(manifest);
 const human=manifest.schemaVersion===2,results=[],hashSplits=new Map();
 for(const entry of manifest.recordings){
  const last=validateNotes(entry.notes,entry.id);
  const wavPath=path.resolve(path.dirname(full),entry.wav),data=fs.readFileSync(wavPath);
  const digest=sha256(data);
  if(human && digest!==entry.sha256)throw new Error(`${entry.id}: WAV sha256 mismatch`);
  if(human && hashSplits.has(digest) && hashSplits.get(digest)!==entry.split)throw new Error(`${entry.id}: identical WAV appears in both splits`);
  hashSplits.set(digest,entry.split);
  const blob=new Blob([data]),meta=await P.inspectWav(blob);
  if(last>meta.duration+.001)throw new Error(`${entry.id}: label extends beyond WAV`);
  const start=performance.now();
  const p=await P.analyze(blob,entry.id);
  const analysisMilliseconds=round(performance.now()-start);
  results.push({id:entry.id,wav:entry.wav,sha256:digest,labelsSha256:sha256(JSON.stringify(entry.notes)),split:human?entry.split:'unspecified',
   ...(human?{participantId:entry.participantId,tags:entry.tags,microphone:entry.microphone,environment:entry.environment,consent:entry.consent,license:entry.license,annotation:entry.annotation}:{}),
   audioSeconds:meta.duration,analysisMilliseconds,...compare(entry.notes,p.analysis.detectedNotes)});
 }
 const sources={};
 for(const name of ['analysis.js','performance.js'])sources[name]=sha256(fs.readFileSync(path.join(__dirname,'../js/audio',name)));
 sources['song-evaluate.js']=sha256(fs.readFileSync(__filename));
 const bySplit={};
 for(const split of human?['tuning','held-out']:['unspecified']){
  const selected=results.filter(r=>r.split===split);bySplit[split]=selected.length?summarize(selected):null;
 }
 return {schemaVersion:2,manifestSchemaVersion:manifest.schemaVersion,analyzerVersion:P.version,
  evidence:human?'human-consent-declared':'unspecified',...(human?{corpus:manifest.corpus}:{}),
  manifestSha256:sha256(manifestBytes),sources,
  runtime:{node:process.version,platform:process.platform,arch:process.arch,cpu:os.cpus()[0]?.model || 'unknown'},
  metricSettings:{pitchToleranceSemitones:.5,timingToleranceSeconds:.05},
  summary:summarize(results),bySplit,recordings:results};
}
module.exports={compare,evaluate,validateManifest,summarize};
if(require.main===module){
 if(process.argv.length!==3){console.error('Usage: node tests/song-evaluate.js manifest.json');process.exitCode=2;}
 else evaluate(process.argv[2]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
}
