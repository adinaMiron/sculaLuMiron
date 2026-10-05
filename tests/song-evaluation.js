const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const {compare,evaluate,validateManifest,summarize}=require('./song-evaluate.js');
const A=globalThis.ScuLaAnalysis,P=globalThis.ScuLaPerformance,SR=A.AN_SR;

function render(notes,{breath=0,vibrato=0,slide=0}={}){
 const length=Math.ceil((Math.max(...notes.map(n=>n.offset))+.2)*SR),x=new Float32Array(length);
 let seed=1387;const noise=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2147483648-1;};
 for(const n of notes){let phase=0;const start=Math.round(n.onset*SR),end=Math.round(n.offset*SR);
  for(let j=start;j<end;j++){
   const t=(j-start)/SR,d=(end-j)/SR,edge=Math.min(1,t/.018,d/.03);
   const gl=slide?slide*Math.max(0,1-Math.abs(t/(n.offset-n.onset)-.5)*2):0;
   const m=n.midi+gl+vibrato/100*Math.sin(2*Math.PI*5.3*t);
   phase+=2*Math.PI*440*2**((m-69)/12)/SR;
   x[j]+=n.amplitude*edge*(Math.sin(phase)+.24*Math.sin(2*phase)+.08*Math.sin(3*phase)+breath*noise());
  }
 }
 return x;
}
function wav(x){
 const out=Buffer.alloc(44+x.length*2),v=new DataView(out.buffer,out.byteOffset,out.byteLength);
 out.write('RIFF',0);v.setUint32(4,out.length-8,true);out.write('WAVEfmt ',8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,SR,true);v.setUint32(28,SR*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);out.write('data',36);v.setUint32(40,x.length*2,true);
 x.forEach((s,i)=>v.setInt16(44+2*i,Math.round(Math.max(-1,Math.min(1,s))*32767),true));return out;
}
const cases=[
 {id:'breathy',notes:[{midi:60,onset:.12,offset:.58,amplitude:.14},{midi:62,onset:.73,offset:1.2,amplitude:.14},{midi:64,onset:1.35,offset:1.82,amplitude:.14}],options:{breath:.65}},
 {id:'slide',notes:[{midi:60,onset:.12,offset:.8,amplitude:.18},{midi:64,onset:.95,offset:1.62,amplitude:.18}],options:{slide:1.5}},
 {id:'vibrato',notes:[{midi:67,onset:.12,offset:1.05,amplitude:.18},{midi:69,onset:1.2,offset:2.1,amplitude:.18}],options:{vibrato:42}},
 {id:'quiet_phrase',notes:[{midi:60,onset:.12,offset:.58,amplitude:.28},{midi:62,onset:.73,offset:1.19,amplitude:.28},{midi:64,onset:1.42,offset:1.9,amplitude:.008},{midi:65,onset:2.05,offset:2.53,amplitude:.008}],options:{}},
 {id:'repeated',notes:[{midi:60,onset:.12,offset:.58,amplitude:.18},{midi:60,onset:.6,offset:1.06,amplitude:.18},{midi:60,onset:1.08,offset:1.54,amplitude:.18}],options:{}},
 {id:'separate_turn',notes:[{midi:60,onset:.12,offset:.48,amplitude:.18},{midi:61,onset:.63,offset:.99,amplitude:.18},{midi:60,onset:1.14,offset:1.5,amplitude:.18}],options:{}}
];

(async()=>{
 const sample=compare([{midi:60,onset:.1,offset:.5},{midi:62,onset:.6,offset:1}], [{midi:72,onset:.11,offset:.51},{midi:65,onset:1.4,offset:1.8}]);
 assert.equal(sample.octaveErrors,1);assert.equal(sample.missedNotes,1);assert.equal(sample.extraNotes,1);assert.equal(sample.noteAccuracy,0);
 const late=compare([{midi:60,onset:.1,offset:.5}],[{midi:60,onset:.16,offset:.56}]);
 assert.equal(late.pitchAccuracy,1);assert.equal(late.noteAccuracy,0);
 assert.equal(late.meanAbsoluteOnsetErrorSeconds,.06);assert.equal(late.meanAbsoluteOffsetErrorSeconds,.06);
 assert.equal(compare([],[]).noteAccuracy,1);assert.equal(compare([],[{midi:60,onset:.1,offset:.5}]).extraNotes,1);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'song-evaluation-'));
 try{
  const manifest={schemaVersion:1,recordings:cases.map(c=>({id:c.id,wav:c.id+'.wav',notes:c.notes.map(({midi,onset,offset})=>({midi,onset,offset}))}))};
  for(const c of cases)fs.writeFileSync(path.join(dir,c.id+'.wav'),wav(render(c.notes,c.options)));
  const file=path.join(dir,'manifest.json');fs.writeFileSync(file,JSON.stringify(manifest));
  const result=await evaluate(file);
  assert.equal(result.schemaVersion,2);assert.equal(result.manifestSchemaVersion,1);
  assert.equal(result.evidence,'unspecified');assert.equal(result.summary.referenceNotes,17);
  assert.equal(result.summary.noteCorrect,17);assert.equal(result.summary.noteAccuracy,1);
  assert.deepEqual(result.bySplit.unspecified,result.summary);
  assert.equal(result.analyzerVersion,2);assert.equal(result.runtime.node,process.version);
  assert.match(result.sources['performance.js'],/^[a-f0-9]{64}$/);
  assert.match(result.sources['song-evaluate.js'],/^[a-f0-9]{64}$/);
  assert.deepEqual(result.metricSettings,{pitchToleranceSemitones:.5,timingToleranceSeconds:.05});
  for(const r of result.recordings){
   assert.ok(Number.isFinite(r.analysisMilliseconds) && r.analysisMilliseconds>=0);
   assert.ok(r.audioSeconds>0);assert.match(r.sha256,/^[a-f0-9]{64}$/);assert.match(r.labelsSha256,/^[a-f0-9]{64}$/);
   assert.equal(r.noteAccuracy,1,`${r.id}: ${JSON.stringify(r)}`);
   assert.equal(r.pitchAccuracy,1,r.id);assert.equal(r.octaveErrors,0,r.id);
   assert.equal(r.missedNotes,0,r.id);assert.equal(r.extraNotes,0,r.id);
   assert.ok(r.meanAbsoluteOnsetErrorSeconds<.05,r.id);
   assert.ok(r.meanAbsoluteOffsetErrorSeconds<.05,r.id);
   console.log(`PASS  ${r.id}: ${r.referenceNotes} notes; onset ${r.meanAbsoluteOnsetErrorSeconds}s, offset ${r.meanAbsoluteOffsetErrorSeconds}s`);
  }
  // Generated audio exercises the human-manifest contract only. These dummy
  // declarations are test fixtures, never human accuracy or actual consent.
  const human={schemaVersion:2,corpus:{id:'generated-contract-test',version:'1'},recordings:manifest.recordings.slice(0,2).map((r,i)=>({...r,
   participantId:'fixture-'+i,split:i?'held-out':'tuning',sha256:result.recordings[i].sha256,
   consent:{evaluation:true,redistribution:true,record:'test-only-not-real-consent'},
   license:{id:'test-only',text:'Generated test fixture; no human recording.',attribution:'test generator'},
   annotation:{independent:true,annotatorId:'test-labeler',reviewerId:'test-reviewer',method:'generated labels for contract testing only'},
   microphone:'synthetic',environment:'synthetic',tags:[cases[i].id]}))};
  const humanFile=path.join(dir,'human-contract.json');
  fs.writeFileSync(humanFile,JSON.stringify(human));
  const before=human.recordings.map(r=>fs.readFileSync(path.join(dir,r.wav)));
  const checked=await evaluate(humanFile);
  assert.equal(checked.evidence,'human-consent-declared');assert.equal(checked.bySplit.tuning.referenceNotes,3);
  assert.equal(checked.bySplit['held-out'].referenceNotes,2);assert.equal(checked.summary.referenceNotes,5);
  assert.deepEqual(checked.recordings[0].annotation,human.recordings[0].annotation);
  assert.deepEqual(checked.recordings[0].consent,human.recordings[0].consent);
  assert.deepEqual(checked.corpus,human.corpus);
  assert.equal(checked.manifestSha256,crypto.createHash('sha256').update(fs.readFileSync(humanFile)).digest('hex'));
  for(let i=0;i<before.length;i++)assert.deepEqual(fs.readFileSync(path.join(dir,human.recordings[i].wav)),before[i]);
  const reject=(mutate,pattern)=>{const m=structuredClone(human);mutate(m);assert.throws(()=>validateManifest(m),pattern);};
  reject(m=>{m.recordings[1].id=m.recordings[0].id;},/duplicate/);
  reject(m=>{m.recordings[1].participantId=m.recordings[0].participantId;},/both splits/);
  reject(m=>{m.recordings[0].split='test';},/split/);
  reject(m=>{delete m.recordings[0].consent;},/consent/);
  reject(m=>{m.recordings[0].consent.redistribution=false;},/consent/);
  reject(m=>{m.recordings[0].annotation.independent=false;},/independent/);
  reject(m=>{m.recordings[0].annotation.reviewerId=m.recordings[0].annotation.annotatorId;},/reviewer/);
  reject(m=>{m.recordings[0].license.text='';},/license/);
  reject(m=>{m.recordings[0].tags=[];},/tags/);
  reject(m=>{m.recordings[0].sha256='wrong';},/sha256/);
  reject(m=>{m.recordings[0].notes[0].offset=-1;},/invalid note/);
  const rejectFile=async(m,pattern)=>{fs.writeFileSync(humanFile,JSON.stringify(m));await assert.rejects(evaluate(humanFile),pattern);};
  const tampered=structuredClone(human);tampered.recordings[0].sha256='0'.repeat(64);
  await rejectFile(tampered,/sha256 mismatch/);
  const duplicate=structuredClone(human);duplicate.recordings[1].wav=duplicate.recordings[0].wav;duplicate.recordings[1].sha256=duplicate.recordings[0].sha256;
  await rejectFile(duplicate,/identical WAV/);
  const tooLong=structuredClone(human);tooLong.recordings[0].notes.at(-1).offset=100;
  await rejectFile(tooLong,/beyond WAV/);
  const onlyTuning=structuredClone(human);onlyTuning.recordings=onlyTuning.recordings.slice(0,1);
  fs.writeFileSync(humanFile,JSON.stringify(onlyTuning));
  assert.equal((await evaluate(humanFile)).bySplit['held-out'],null);
  const cli=spawnSync(process.execPath,[path.join(__dirname,'song-evaluate.js'),humanFile],{encoding:'utf8'});
  assert.equal(cli.status,0,cli.stderr);assert.equal(JSON.parse(cli.stdout).summary.referenceNotes,3);
  fs.writeFileSync(humanFile,JSON.stringify(tampered));
  const failedCli=spawnSync(process.execPath,[path.join(__dirname,'song-evaluate.js'),humanFile],{encoding:'utf8'});
  assert.equal(failedCli.status,1);assert.equal(failedCli.stdout,'');assert.match(failedCli.stderr,/sha256 mismatch/);
  // Counts are weighted by notes/pairs, never an average of recording scores.
  const ref=[{midi:60,onset:0,offset:1},{midi:62,onset:2,offset:3},{midi:64,onset:4,offset:5}];
  const aggregate=summarize([
   {...compare(ref,ref),audioSeconds:6,analysisMilliseconds:100},
   {...compare([ref[0]],[{midi:72,onset:.1,offset:1.1}]),audioSeconds:2,analysisMilliseconds:100}
  ]);
  assert.equal(aggregate.noteAccuracy,.75);assert.equal(aggregate.pitchAccuracy,.75);
  assert.equal(aggregate.octaveErrors,1);assert.equal(aggregate.meanAbsoluteOnsetErrorSeconds,.025);
  assert.equal(aggregate.realtimeFactor,.025);
  const silent=summarize([{...compare([],[]),audioSeconds:1,analysisMilliseconds:1}]);
  assert.equal(silent.noteAccuracy,1);assert.equal(silent.meanAbsoluteOnsetErrorSeconds,null);
  console.log('PASS  legacy/human manifest contracts, provenance, split isolation, hashes, summaries and CLI');
  const quiet=await P.analyzeBuffer(render(cases[3].notes,cases[3].options),'quiet');
  assert.ok(quiet.analysis.detectedNotes[2].dynamics.rms<quiet.analysis.detectedNotes[0].dynamics.rms*.05);
  const slide=await P.analyzeBuffer(render(cases[1].notes,cases[1].options),'slide');
  assert.ok(slide.analysis.rawPitchFrames.some(f=>f.midi>61.3 && f.midi<61.6));
  assert.equal(slide.analysis.rawPitchFrames.length,slide.analysis.interpretedPitchFrames.length);
  console.log('all Song evaluation regressions passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
