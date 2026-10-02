// Accuracy fixtures run before Voice and Song share the versioned analyzer.
const assert=require('assert/strict');
require('../js/audio/analysis.js');require('../js/audio/performance.js');
const A=globalThis.ScuLaAnalysis,P=globalThis.ScuLaPerformance,SR=A.AN_SR;
function phrase(notes,{beat=.6,cents=0,vibrato=0,amplitude=.2,legato=false}={}){
 const x=new Float32Array(Math.ceil((notes.length*beat+.4)*SR));
 notes.forEach((m,i)=>{let phase=0;const start=.1+i*beat,len=beat*(legato?1:.82);
  for(let j=0;j<len*SR;j++){const t=j/SR,f=440*2**((m-69+(cents+vibrato*Math.sin(2*Math.PI*5*t))/100)/12);phase+=2*Math.PI*f/SR;const env=Math.min(1,t/.02,(len-t)/.04);x[Math.round(start*SR)+j]=amplitude*env*(Math.sin(phase)+.3*Math.sin(2*phase)+.1*Math.sin(3*phase));}
 });return x;
}
(async()=>{
 const seq=[60,62,64,65,67,65,64,62,60,64,67,64],master=phrase(seq),bytes=Buffer.from(master.buffer).toString('hex');
 const p=await P.analyzeBuffer(master,'master');
 assert.deepEqual(p.notes.map(n=>n.midi),seq);assert.equal(p.sourceAssetId,'master');assert.equal(p.schemaVersion,1);assert.equal(p.analyzerVersion,2);
 assert.equal(p.analysis.interpretedPitchFrames.length,p.analysis.rawPitchFrames.length);
 assert.ok(Math.abs(p.tempoBpm-100)<3);assert.equal(p.analysis.key.tonic,0);assert.equal(p.analysis.key.mode,'major');
 p.notes.forEach((n,i)=>{assert.ok(Math.abs(n.onset-(.1+i*.6))<.065,`onset ${i}: ${n.onset}`);assert.ok(Math.abs(n.offset-(.1+i*.6+.492))<.07);});
 assert.equal(Buffer.from(master.buffer).toString('hex'),bytes);assert.ok(p.analysis.rawPitchFrames.some(f=>f.hz && f.confidence>.95));assert.ok(p.analysis.rawPitchFrames.some(f=>f.hz===null));
 const evidence=JSON.stringify(p.analysis),original=JSON.stringify(p.notes);P.quantize(p);p.notes[0].midi=72;p.notes[0].onset+=.1;assert.equal(JSON.stringify(p.analysis),evidence);assert.equal(p.analysis.detectedNotes[0].midi,60);assert.notEqual(JSON.stringify(p.notes),original);
 console.log('PASS  known phrase: pitch, onset/offset, tempo, key, silence and immutable evidence');
 const held=await P.analyzeBuffer(phrase([69],{beat:1.5,cents:23,vibrato:30}),'vibrato');
 assert.equal(held.notes.length,1);assert.equal(held.notes[0].midi,69);assert.ok(Math.abs(held.notes[0].cents-23)<10);assert.ok(held.analysis.detectedNotes[0].vibrato.depthCents>10);assert.ok(Math.abs(held.analysis.detectedNotes[0].vibrato.rateHz-5)<1);
 assert.ok(held.analysis.detectedNotes[0].attackSeconds>=0 && held.analysis.detectedNotes[0].releaseSeconds>=0);
 console.log('PASS  detuning and vibrato preserved without fragmenting a held note');
 const repeated=await P.analyzeBuffer(phrase([60,60,60]),'repeat');assert.deepEqual(repeated.notes.map(n=>n.midi),[60,60,60]);
 repeated.notes.forEach((n,i)=>{assert.ok(Math.abs(n.onset-(.1+i*.6))<.07,JSON.stringify(repeated.notes));assert.ok(Math.abs(n.offset-(.1+i*.6+.492))<.08,JSON.stringify(repeated.notes));});
 const octaveFrames=[60,60,60,72,60,60,60].map((m,i)=>({time:i*.023,midi:m,confidence:.9}));
 const interpreted=P.interpretPitch(octaveFrames);
 assert.deepEqual(interpreted.map(f=>f.midi),[60,60,60,60,60,60,60]);assert.equal(octaveFrames[3].midi,72);
 const slide=phrase([60],{beat:1.35});
 for(let i=Math.floor(.42*SR);i<Math.floor(.53*SR);i++){
  const t=(i/SR-.42)/.11, f=440*2**((60+1.1*Math.sin(Math.PI*t)-69)/12);
  slide[i]=.2*Math.sin(2*Math.PI*f*i/SR);
 }
 const slipped=await P.analyzeBuffer(slide,'slide');
 assert.deepEqual(slipped.notes.map(n=>n.midi),[60]);
 const breathy=phrase([60,62,64],{beat:.55,amplitude:.11});
 for(let i=0;i<breathy.length;i++)if(breathy[i]){const t=i/SR;breathy[i]+=.005*Math.sin(2*Math.PI*3197*t)+.003*Math.sin(2*Math.PI*4729*t);}
 const airy=await P.analyzeBuffer(breathy,'breathy');
 assert.deepEqual(airy.notes.map(n=>n.midi),[60,62,64]);
 airy.notes.forEach((n,i)=>{assert.ok(Math.abs(n.onset-(.1+i*.55))<.08);assert.ok(Math.abs(n.offset-(.1+i*.55+.451))<.09);});
 const soft=await P.analyzeBuffer(phrase([64],{amplitude:.05}),'soft'),loud=await P.analyzeBuffer(phrase([64],{amplitude:.3}),'loud');assert.deepEqual(soft.notes.map(n=>n.midi),[64]);assert.ok(Math.abs(soft.notes[0].onset-.1)<.07 && Math.abs(soft.notes[0].offset-.592)<.08);assert.ok(loud.analysis.detectedNotes[0].dynamics.rms>soft.analysis.detectedNotes[0].dynamics.rms*5);
 const empty=await P.analyzeBuffer(new Float32Array(SR),'silence');assert.equal(empty.notes.length,0);assert.ok(empty.analysis.rawPitchFrames.every(f=>f.hz===null));
 const short=await P.analyzeBuffer(new Float32Array(100),'short');assert.equal(short.notes.length,0);
 const connected=await P.analyzeBuffer(phrase([60,62,64],{legato:true}),'legato');assert.ok(connected.analysis.detectedNotes.some(n=>n.legato));
 console.log('PASS  repeated notes, measured dynamics, legato, short input and silence');
 await assert.rejects(()=>P.analyzeBuffer(new Float32Array((P.MAX_SECONDS+1)*SR),'long'),/tooLong/);
 for(const [encoding,bits] of [[1,16],[1,24],[1,32],[3,32]]){
  const align=bits/8,length=align*4,data=new Uint8Array(44+length),v=new DataView(data.buffer),tag=(o,s)=>{for(let i=0;i<s.length;i++)data[o+i]=s.charCodeAt(i);};
  tag(0,'RIFF');v.setUint32(4,data.length-8,true);tag(8,'WAVE');tag(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,encoding,true);v.setUint16(22,1,true);v.setUint32(24,SR,true);v.setUint32(28,SR*align,true);v.setUint16(32,align,true);v.setUint16(34,bits,true);tag(36,'data');v.setUint32(40,length,true);
  const meta=await P.inspectWav(new Blob([data]));assert.equal(meta.bitDepth,bits);assert.equal(meta.encoding,encoding);assert.equal(meta.duration,4/SR);
  v.setUint32(28,1,true);await assert.rejects(()=>P.inspectWav(new Blob([data])),/badWav/);
 }
 await assert.rejects(()=>P.inspectWav(new Blob(['RIFFbroken'])),/badWav/);
 console.log('PASS  supported PCM/float WAV headers and malformed dimensions');
 console.log('all song analysis checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
