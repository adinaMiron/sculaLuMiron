// Exact byte hashing against published SHA-256 vectors and Node's independent implementation.
const assert=require('assert/strict'),{createHash}=require('crypto');
require('../js/audio/integrity.js');
const sha=blob=>ScuLaIntegrity.sha256(blob);
const reference=b=>createHash('sha256').update(b).digest('hex');
(async()=>{
  for(const [text,digest] of [
    ['', 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'],
    ['abc','ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'],
    ['abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq','248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1'],
    ['a'.repeat(1000000),'cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0']
  ])assert.equal(await sha(new Blob([text])),digest);
  for(const size of [1,55,56,63,64,65,119,120,127,128,65535,65536,65537,131071,131072,131073]){
    const b=Buffer.alloc(size);for(let i=0;i<size;i++)b[i]=(i*73+19)%256;
    assert.equal(await sha(new Blob([b])),reference(b),'padding/chunk boundary '+size);
  }
  global.window=globalThis;require('../js/audio/pcm.js');
  const wav=Buffer.from(await ScuLaPCM.wav([new Uint8Array([1,2,3])],3,8000,1).arrayBuffer());
  const extra=Buffer.concat([wav.subarray(0,36),Buffer.from([74,85,78,75,1,0,0,0,93,71]),wav.subarray(36)]);extra.writeUInt32LE(extra.length-8,4);
  assert.equal(await sha(new Blob([extra])),reference(extra));
  for(const at of [44,45,extra.length-1]){const changed=Buffer.from(extra);changed[at]^=1;assert.notEqual(await sha(new Blob([changed])),reference(extra),'chunk/padding byte '+at);}
  let cancel=false,ticked=false,reads=0;
  const b=new Blob([Buffer.alloc(1048576)]),slice=b.slice.bind(b);
  b.slice=(...args)=>{reads++;return slice(...args);};
  await assert.rejects(ScuLaIntegrity.sha256(b,{cancelled:()=>cancel,progress:done=>{if(done)setTimeout(()=>{ticked=true;cancel=true;},0);}}),e=>e.code==='backupCancelled');
  assert.equal(ticked,true);assert.equal(reads,1,'yields before reading the next chunk');
  await assert.rejects(ScuLaIntegrity.sha256(b,{cancelled:()=>true}),e=>e.code==='backupCancelled');
  console.log('PASS  SHA-256 known vectors, million-byte input, all padding/read boundaries, exact RIFF/chunk/padding bytes, responsive cancellation');
})().catch(e=>{console.error(e);process.exitCode=1;});
