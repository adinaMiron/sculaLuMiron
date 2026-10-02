// Song v2 evaluation against independently labeled, unaccompanied WAV takes.
// Usage: node tests/song-evaluate.js path/to/manifest.json
const fs=require('node:fs');
const path=require('node:path');
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
 return {referenceNotes:count,detectedNotes:detected.length,matched:pairs.length,noteAccuracy:count?round(noteCorrect/count):detected.length?0:1,pitchAccuracy:count?round(pitchCorrect/count):detected.length?0:1,octaveErrors,missedNotes:missed,extraNotes:extra,meanAbsoluteOnsetErrorSeconds:pairs.length?round(onsetError/pairs.length):null,meanAbsoluteOffsetErrorSeconds:pairs.length?round(offsetError/pairs.length):null,matches};
}
async function evaluate(manifestPath){
 const full=path.resolve(manifestPath),manifest=JSON.parse(fs.readFileSync(full,'utf8'));
 if(!manifest || manifest.schemaVersion!==1 || !Array.isArray(manifest.recordings) || !manifest.recordings.length)throw new Error('manifest: expected schemaVersion 1 and nonempty recordings');
 const ids=new Set(),results=[];
 for(const entry of manifest.recordings){
  if(!entry || typeof entry.id!=='string' || !entry.id || ids.has(entry.id) || typeof entry.wav!=='string' || !entry.wav)throw new Error('manifest: invalid or duplicate id/WAV');
  ids.add(entry.id);const last=validateNotes(entry.notes,entry.id);
  const wavPath=path.resolve(path.dirname(full),entry.wav),data=fs.readFileSync(wavPath);
  const blob=new Blob([data]),meta=await P.inspectWav(blob);
  if(last>meta.duration+.001)throw new Error(`${entry.id}: label extends beyond WAV`);
  const p=await P.analyze(blob,entry.id);
  results.push({id:entry.id,wav:entry.wav,...compare(entry.notes,p.analysis.detectedNotes)});
 }
 return {schemaVersion:1,analyzerVersion:P.version,recordings:results};
}
module.exports={compare,evaluate};
if(require.main===module){
 if(process.argv.length!==3){console.error('Usage: node tests/song-evaluate.js manifest.json');process.exitCode=2;}
 else evaluate(process.argv[2]).then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e);process.exitCode=1;});
}
