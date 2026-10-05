// ZIP interoperability, bounded work and hostile archive validation.
const assert=require('assert/strict'),fs=require('fs'),os=require('os'),path=require('path'),vm=require('vm'),{spawnSync}=require('child_process');
const c=vm.createContext({Blob,TextEncoder,TextDecoder,setTimeout});
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/audio/song-archive.js'),'utf8'),c);
const Z=c.ScuLaSongArchive;
async function collect(source){const parts=[];for await(const p of source.stream()){assert.ok(p.length<=65536);parts.push(Buffer.from(p));}const bytes=Buffer.concat(parts);assert.equal(bytes.length,source.size);return bytes;}
async function checks(){
 const reads=[],payload=Buffer.alloc(200001,93),original=Blob.prototype.arrayBuffer;
 Blob.prototype.arrayBuffer=function(){reads.push(this.size);assert.ok(this.size<=65536);return original.call(this);};
 let zip;
 try{zip=await collect(await Z.write([{path:'project.json',blob:new Blob(['{}'])},{path:'recordings/voce-ț.wav',blob:new Blob([payload])}]))}finally{Blob.prototype.arrayBuffer=original;}
 assert.ok(reads.includes(65536));
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'song-zip-')),file=path.join(dir,'backup.zip');fs.writeFileSync(file,zip);
 const py=spawnSync('python3',['-c','import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.namelist()==["project.json","recordings/voce-ț.wav"]; assert z.read("recordings/voce-ț.wav")==bytes([93])*200001',file],{encoding:'utf8'});assert.equal(py.status,0,py.stderr);
 for(const name of ['../x','/root','a/../x','a\\x','C:x','a//x','a/./x','x\0','con.wav','x.','e\u0301'])await assert.rejects(Z.write([{path:name,blob:new Blob()}]),/archiveInvalid/);
 await assert.rejects(Z.write([{path:'x',blob:new Blob()},{path:'X',blob:new Blob()}]),/archiveInvalid/);
 await assert.rejects(Z.write(Array.from({length:257},(_,i)=>({path:String(i),blob:new Blob()}))),/archiveLimit/);
 const huge=new Blob();Object.defineProperty(huge,'size',{value:Z.limits.bytes});await assert.rejects(Z.write([{path:'x',blob:huge}]),/archiveLimit/);
 let cancelled=false;await assert.rejects(Z.write([{path:'x',blob:new Blob([payload])}],{cancelled:()=>cancelled,progress:()=>cancelled=true}),/backupCancelled/);
 cancelled=false;const source=await Z.write([{path:'x',blob:new Blob([payload])}],{cancelled:()=>cancelled});const stream=source.stream();await stream.next();cancelled=true;await assert.rejects(stream.next(),/backupCancelled/);
 console.log('PASS ZIP writer: Python interoperability, exact Unicode bytes, bounded reads/stream chunks, limits, paths and cancellation');
 const unpacked=await Z.open(new Blob([zip]));assert.equal(await unpacked.get('project.json').text(),'{}');assert.deepEqual(Buffer.from(await unpacked.get('recordings/voce-ț.wav').arrayBuffer()),payload);
 const cd=zip.readUInt32LE(zip.length-6),second=cd+46+12;
 for(const mutate of [
  b=>b.writeUInt16LE(257,b.length-12),b=>b.writeUInt16LE(1,b.length-18),b=>b.writeUInt16LE(1,b.length-2),b=>b.writeUInt32LE(0xffffffff,b.length-6),
  b=>b.writeUInt16LE(8,cd+10),b=>b.writeUInt16LE(1,cd+8),b=>b.writeUInt16LE(8,cd+8),b=>b.writeUInt16LE(45,cd+6),b=>b.writeUInt16LE(1,cd+30),
  b=>b.writeUInt32LE(0xa1ff0000,cd+38),b=>b.writeUInt32LE(0,second+42),b=>b.writeUInt32LE(0xffffffff,cd+24),b=>b.writeUInt16LE(5000,cd+28),
  b=>b.writeUInt32LE(0,14),b=>b.writeUInt16LE(1,28),b=>b[30]^=1,b=>b[42]^=1,b=>b.write('..',30),b=>b.writeUInt32LE(0,cd),
 ]){const bad=Buffer.from(zip);mutate(bad);await assert.rejects(Z.open(new Blob([bad])),/archiveInvalid|archiveLimit/);}
 for(const bad of [zip.subarray(0,-1),Buffer.concat([zip,Buffer.from([0])]),zip.subarray(0,21)])await assert.rejects(Z.open(new Blob([bad])),/archiveInvalid/);
 const enormous=new Blob();Object.defineProperty(enormous,'size',{value:Z.limits.bytes+1});await assert.rejects(Z.open(enormous),/archiveLimit/);
 cancelled=false;await assert.rejects(Z.open(new Blob([zip]),{cancelled:()=>cancelled,progress:()=>cancelled=true}),/backupCancelled/);
 Blob.prototype.arrayBuffer=function(){assert.ok(this.size<=65536);return original.call(this);};
 try{await Z.open(new Blob([zip]));}finally{Blob.prototype.arrayBuffer=original;}
 // A valid CRC cannot make traversal/duplicate/case-colliding paths acceptable.
 const two=await collect(await Z.write([{path:'aa/x',blob:new Blob()},{path:'bb/x',blob:new Blob()}]));
 for(const replacement of ['../x','aa/x','AA/x','/b/x']){const bad=Buffer.from(two);bad.write(replacement,34+30);bad.write(replacement,68+50+46);await assert.rejects(Z.open(new Blob([bad])),/archiveInvalid/);}
 const largeJson=new Blob([Buffer.alloc(Z.limits.jsonBytes+1)]);await assert.rejects(Z.write([{path:'project.json',blob:largeJson}]),/archiveLimit/);
 const tooMuchJson=await collect(await Z.write([{path:'another.json',blob:largeJson}]));tooMuchJson.write('project.json',30);tooMuchJson.write('project.json',tooMuchJson.readUInt32LE(tooMuchJson.length-6)+46);await assert.rejects(Z.open(new Blob([tooMuchJson])),/archiveLimit/);
 console.log('PASS ZIP reader: exact slices, bounded reads, CRC, malformed headers, count/byte/JSON limits, unsupported features, duplicate/traversal paths and cancellation');
}
checks().catch(e=>{console.error(e);process.exitCode=1;});
