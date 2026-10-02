// Song's WAV path must decode directly into a capped mono result.
const assert=require('assert/strict');
require('../js/audio/analysis.js');require('../js/audio/performance.js');
const P=ScuLaPerformance,A=ScuLaAnalysis;
function chunk(name,payload){const h=Buffer.alloc(8);h.write(name);h.writeUInt32LE(payload.length,4);return Buffer.concat([h,payload,payload.length&1?Buffer.from([0x6b]):Buffer.alloc(0)]);}
function wav({rate=44100,channels=2,bits=24,encoding=1,seconds=.25,extra=true,signal=(t,c)=>.2*Math.sin(2*Math.PI*440*t)*(c? .5:1)}={}){
 const frames=Math.round(rate*seconds),align=channels*bits/8,fmt=Buffer.alloc(16),data=Buffer.alloc(frames*align);
 fmt.writeUInt16LE(encoding,0);fmt.writeUInt16LE(channels,2);fmt.writeUInt32LE(rate,4);fmt.writeUInt32LE(rate*align,8);fmt.writeUInt16LE(align,12);fmt.writeUInt16LE(bits,14);
 for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){
  const v=signal(i/rate,c),at=i*align+c*bits/8;
  if(encoding===3)data.writeFloatLE(v,at);
  else if(bits===16)data.writeInt16LE(Math.max(-32768,Math.min(32767,Math.round(v*32767))),at);
  else if(bits===24)data.writeIntLE(Math.max(-8388608,Math.min(8388607,Math.round(v*8388607))),at,3);
  else data.writeInt32LE(Math.max(-2147483648,Math.min(2147483647,Math.round(v*2147483647))),at);
 }
 const parts=[chunk('data',data),...(extra?[chunk('LIST',Buffer.alloc(1025,7))]:[]),chunk('fmt ',fmt)];
 const body=Buffer.concat(parts),h=Buffer.alloc(12);h.write('RIFF');h.writeUInt32LE(body.length+4,4);h.write('WAVE',8);return Buffer.concat([h,body]);
}
function watched(bytes){const base=new Blob([bytes]),reads=[];return {size:base.size,reads,slice(start,end){reads.push([start,end]);assert.ok(end-start<=65536,'source read exceeded 64 KiB');return base.slice(start,end);},arrayBuffer(){throw Error('whole WAV read');}};}
(async()=>{
 for(const [encoding,bits] of [[1,16],[1,24],[1,32],[3,32]])for(const channels of [1,2])for(const rate of [8000,22050,192000]){
  const bytes=wav({encoding,bits,channels,rate}),blob=watched(bytes);let out;
  try{out=await P.decodeWavMono(blob);}catch(e){e.message=`${encoding}/${bits}/${channels}/${rate}: ${e.message}`;throw e;}
  assert.equal(out.length,Math.round(Math.round(rate*.25)*A.AN_SR/rate));
  const expected=.2*(channels===2?.75:1),at=Math.round(.125*A.AN_SR),actual=out[at];
  assert.ok(Math.abs(actual-expected*Math.sin(2*Math.PI*440*at/A.AN_SR))<.006,`${encoding}/${bits}/${channels}/${rate}: ${actual}`);
  const dataBytes=Math.round(rate*.25)*channels*bits/8,listHeader=20+dataBytes+(dataBytes&1);
  const listPayload=listHeader+8,listEnd=listPayload+1025;
  assert.ok(blob.reads.some(([s,e])=>e-s>16));
  assert.ok(blob.reads.every(([s,e])=>e<=listPayload || s>=listEnd),'unknown chunk payload skipped');
  assert.equal(Buffer.compare(bytes,Buffer.from(await new Blob([bytes]).arrayBuffer())),0);
 }
 console.log('PASS  bounded PCM/float mono/stereo decoding at 8, 22.05 and 192 kHz; samples within 0.006');
 const high=await P.decodeWavMono(watched(wav({rate:192000,channels:1,bits:32,encoding:3,seconds:.2,signal:t=>.5*Math.sin(2*Math.PI*15000*t)})));
 const aliasRms=Math.sqrt(high.reduce((sum,v)=>sum+v*v,0)/high.length);
 assert.ok(aliasRms<.015,`15 kHz alias leaked at ${aliasRms}`);
 const onsetInput=new Float32Array(A.AN_SR);for(let i=0;i<onsetInput.length;i++)onsetInput[i]=Math.sin(2*Math.PI*440*i/A.AN_SR)*(i%6000<2500?.2:.05);
 assert.deepEqual(A.onsetEnvelope(onsetInput),await A.onsetEnvelopeCooperative(onsetInput));
 for(const bad of [Buffer.from('RIFFbad'),(()=>{const b=wav({});b.writeUInt32LE(0xffffffff,16);return b;})(),(()=>{const b=wav({});return b.subarray(0,-1);})()])await assert.rejects(P.decodeWavMono(watched(bad)),/badWav/);
 const long=wav({rate:8000,channels:1,bits:16,seconds:181,signal:()=>0});
 await assert.rejects(P.decodeWavMono(watched(long)),/tooLong/);
 let stop=false;const source=watched(wav({seconds:2}));
 await assert.rejects(P.decodeWavMono(source,{cancelled:()=>stop,progress:p=>{if(p>.07)stop=true;}}),/analysisCancelled|backupCancelled/);
 assert.ok(source.reads.length<30,'cancel stopped source reads');
 const base=wav({}),junk=Buffer.concat(Array.from({length:256},()=>chunk('JUNK',Buffer.from([7]))));
 const manyBytes=Buffer.concat([base.subarray(0,12),junk,base.subarray(12)]);manyBytes.writeUInt32LE(manyBytes.length-8,4);
 const many=watched(manyBytes);stop=false;let scheduled=false;
 await assert.rejects(P.decodeWavMono(many,{cancelled:()=>stop,progress:p=>{if(p>0 && !scheduled){scheduled=true;setTimeout(()=>{stop=true;},0);}}}),/backupCancelled/);
 assert.ok(many.reads.length<260,'tiny chunks yield before audio reads');
 const dataLength=180*192000*2*4,head=Buffer.alloc(44);head.write('RIFF');head.writeUInt32LE(36+dataLength,4);head.write('WAVE',8);head.write('fmt ',12);head.writeUInt32LE(16,16);head.writeUInt16LE(3,20);head.writeUInt16LE(2,22);head.writeUInt32LE(192000,24);head.writeUInt32LE(192000*8,28);head.writeUInt16LE(8,32);head.writeUInt16LE(32,34);head.write('data',36);head.writeUInt32LE(dataLength,40);
 const sparseReads=[],sparse={size:44+dataLength,slice(start,end){sparseReads.push([start,end]);assert.ok(end-start<=65536);const bytes=Buffer.alloc(end-start);if(start<head.length)head.copy(bytes,0,start,Math.min(head.length,end));return {arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.length)};},arrayBuffer(){throw Error('whole source read');}};
 stop=false;await assert.rejects(P.decodeWavMono(sparse,{cancelled:()=>stop,progress:p=>{if(p>.051)stop=true;}}),/analysisCancelled/);
 assert.ok(sparseReads.length<20,`180-second high-rate stereo source stays sliced: ${sparseReads.length} reads`);
 const cpu=new Float32Array(A.AN_SR*5);
 for(const threshold of [.4,.6,.95,1]){
  stop=false;let reached=0;
  await assert.rejects(P.analyzeBuffer(cpu,'source',f=>{reached=Math.max(reached,f);if(f>=threshold)stop=true;},{cancelled:()=>stop}),/analysisCancelled/);
  assert.ok(reached>=threshold);
 }
 // A real timer must run during expression extraction, not just a progress callback.
 const noteInput=new Float32Array(A.AN_SR*2);
 for(let i=0;i<noteInput.length;i++)noteInput[i]=.2*Math.sin(2*Math.PI*440*i/A.AN_SR);
 stop=false;let expressionYield=false;
 await assert.rejects(P.analyzeBuffer(noteInput,'expression',(f)=>{
  if(f>=.97 && !expressionYield){expressionYield=true;setTimeout(()=>{stop=true;},0);}
 },{cancelled:()=>stop}),/analysisCancelled/);
 assert.ok(expressionYield,'note-expression work yields to cancellation');
 console.log('PASS  malformed/truncated and over-limit WAVs; sparse 180-second stereo source; cancellation during source reads, tiny chunks, onset FFT, pitch, evidence, expression and completion');
})().catch(e=>{console.error(e);process.exitCode=1;});
