// RIFF traversal must read headers only, even when a source WAV is very large.
const assert=require('assert/strict');
require('../js/audio/analysis.js');require('../js/audio/performance.js');
const inspect=ScuLaPerformance.inspectWav;
function fmt({encoding=1,channels=1,rate=22050,bits=24,alignment=channels*bits/8,byteRate=rate*alignment}={}){
  const b=Buffer.alloc(16);b.writeUInt16LE(encoding,0);b.writeUInt16LE(channels,2);b.writeUInt32LE(rate,4);b.writeUInt32LE(byteRate,8);b.writeUInt16LE(alignment,12);b.writeUInt16LE(bits,14);return b;
}
function chunk(name,payload,pad=0x71){const h=Buffer.alloc(8);h.write(name,0,4,'ascii');h.writeUInt32LE(payload.length,4);return Buffer.concat([h,payload,payload.length&1?Buffer.from([pad]):Buffer.alloc(0)]);}
function wav(parts){const body=Buffer.concat(parts),h=Buffer.alloc(12);h.write('RIFF');h.writeUInt32LE(body.length+4,4);h.write('WAVE',8);return Buffer.concat([h,body]);}
function invalid(bytes){return assert.rejects(inspect(new Blob([bytes])),/badWav/);}
(async()=>{
  const data=Buffer.alloc(12),unknown=chunk('JUNK',Buffer.from([1,2,3]));
  const source=wav([chunk('data',data),unknown,chunk('fmt ',fmt())]);
  const meta=await inspect(new Blob([source]));
  assert.equal(meta.duration,4/22050);assert.equal(meta.bitDepth,24);
  for(const [encoding,bits] of [[1,16],[1,24],[1,32],[3,32]])for(const channels of [1,2]){
    const alignment=channels*bits/8,bytes=wav([chunk('LIST',Buffer.from([7])),chunk('fmt ',fmt({encoding,channels,bits})),chunk('data',Buffer.alloc(alignment*3))]);
    const m=await inspect(new Blob([bytes]));assert.equal(m.duration,3/22050);assert.equal(m.channelCount,channels);
  }
  const altered=(at,fn)=>{const b=Buffer.from(source);fn(b,at);return b;};
  await invalid(altered(4,(b,o)=>b.writeUInt32LE(b.readUInt32LE(o)-1,o)));
  await invalid(altered(4,(b,o)=>b.writeUInt32LE(b.readUInt32LE(o)+1,o)));
  await invalid(source.subarray(0,source.length-1));
  await invalid(Buffer.concat([source,Buffer.from([0])]));
  await invalid(wav([chunk('fmt ',fmt()),chunk('fmt ',fmt()),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt()),chunk('data',data),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt()),chunk('data',Buffer.alloc(0))]));
  await invalid(wav([chunk('fmt ',fmt()),chunk('data',Buffer.alloc(1))]));
  await invalid(wav([chunk('fmt ',fmt({alignment:1})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt({byteRate:1})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt({channels:3})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt({bits:20})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt({rate:7999,byteRate:7999*3})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt({rate:192001,byteRate:192001*3})),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',Buffer.alloc(15)),chunk('data',data)]));
  await invalid(wav([chunk('fmt ',fmt()),chunk('data',data),chunk('JUNK',Buffer.from([7])).subarray(0,-1)]));
  const oversized=wav([chunk('fmt ',fmt()),chunk('data',data)]);oversized.writeUInt32LE(0xffffffff,40);await invalid(oversized);
  const partial=Buffer.concat([source,Buffer.alloc(4)]);partial.writeUInt32LE(partial.length-8,4);await invalid(partial);
  console.log('PASS  nonstandard chunk order, unknown chunks/odd padding, PCM/float dimensions and malformed RIFF/chunk boundaries');

  // A sparse stand-in for a 128 MiB WAV. It allocates only the requested
  // slices and fails if inspection touches the data chunk or reads too much.
  const payloadSize=128*1024*1024-2,head=Buffer.alloc(12),format=chunk('fmt ',fmt()),junkHead=Buffer.alloc(8),dataHead=Buffer.alloc(8);
  head.write('RIFF');head.writeUInt32LE(4+format.length+8+payloadSize+8+3+1,4);head.write('WAVE',8);
  dataHead.write('data');dataHead.writeUInt32LE(payloadSize,4);junkHead.write('JUNK');junkHead.writeUInt32LE(3,4);
  const pieces=[[0,head],[12,format],[12+format.length,dataHead],[12+format.length+8+payloadSize,junkHead]];
  const size=8+head.readUInt32LE(4),reads=[];
  const sparse={size,slice(start,end){reads.push([start,end]);assert.ok(end-start<=16,'bounded header/format read');assert.ok(end<=12+format.length+8 || start>=12+format.length+8+payloadSize,'payload skipped');return {arrayBuffer:async()=>{const out=Buffer.alloc(end-start);for(const [at,bytes] of pieces){const from=Math.max(start,at),to=Math.min(end,at+bytes.length);if(to>from)bytes.copy(out,from-start,from-at,to-at);}return out.buffer.slice(out.byteOffset,out.byteOffset+out.length);}};}};
  const updates=[];const large=await inspect(sparse,{progress:(done,total)=>updates.push([done,total])});
  assert.equal(large.duration,payloadSize/(22050*3));assert.equal(reads.length,5);assert.equal(updates.at(-1)[0],size);
  console.log('PASS  sparse 128 MiB WAV: five reads of at most 16 bytes, no payload reads');

  const many=wav([chunk('fmt ',fmt()),...Array.from({length:256},()=>chunk('JUNK',Buffer.from([1]))),chunk('data',data)]);
  let cancel=false,seen=0,readCount=0;const manyBlob=new Blob([many]),slice=manyBlob.slice.bind(manyBlob);
  manyBlob.slice=(...args)=>{readCount++;return slice(...args);};
  await assert.rejects(inspect(manyBlob,{cancelled:()=>cancel,progress:done=>{if(done && !seen++){setTimeout(()=>{cancel=true;},0);}}}),e=>e.code==='backupCancelled');
  assert.ok(readCount<260,'tiny-chunk traversal yields for cancellation');
  let pending=false;const waiting={size:source.length,slice(){return {arrayBuffer:async()=>{pending=true;await new Promise(r=>setTimeout(r,10));return source.subarray(0,12).buffer.slice(source.byteOffset,source.byteOffset+12);}};}};
  cancel=false;const promise=inspect(waiting,{cancelled:()=>cancel});while(!pending)await new Promise(r=>setTimeout(r,0));cancel=true;
  await assert.rejects(promise,e=>e.code==='backupCancelled');
  console.log('PASS  cancellation during a pending read and during many tiny chunks');
})().catch(e=>{console.error(e);process.exitCode=1;});
