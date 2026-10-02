const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {compare,evaluate}=require('./song-evaluate.js');
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
  for(const r of result.recordings){
   assert.equal(r.noteAccuracy,1,`${r.id}: ${JSON.stringify(r)}`);
   assert.equal(r.pitchAccuracy,1,r.id);assert.equal(r.octaveErrors,0,r.id);
   assert.equal(r.missedNotes,0,r.id);assert.equal(r.extraNotes,0,r.id);
   assert.ok(r.meanAbsoluteOnsetErrorSeconds<.05,r.id);
   assert.ok(r.meanAbsoluteOffsetErrorSeconds<.05,r.id);
   console.log(`PASS  ${r.id}: ${r.referenceNotes} notes; onset ${r.meanAbsoluteOnsetErrorSeconds}s, offset ${r.meanAbsoluteOffsetErrorSeconds}s`);
  }
  const quiet=await P.analyzeBuffer(render(cases[3].notes,cases[3].options),'quiet');
  assert.ok(quiet.analysis.detectedNotes[2].dynamics.rms<quiet.analysis.detectedNotes[0].dynamics.rms*.05);
  const slide=await P.analyzeBuffer(render(cases[1].notes,cases[1].options),'slide');
  assert.ok(slide.analysis.rawPitchFrames.some(f=>f.midi>61.3 && f.midi<61.6));
  assert.equal(slide.analysis.rawPitchFrames.length,slide.analysis.interpretedPitchFrames.length);
  console.log('all Song evaluation regressions passed');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
