/* Song store-only ZIP. Header layout/CRC polynomial adapted from transfer.html
   zipStore; unlike that collector, payload reads/writes stay at 64 KiB.
   Deliberately no compression, descriptors, encryption, multi-disk or ZIP64. */
(function(root){
'use strict';
const limits=Object.freeze({bytes:512*1048576,entries:256,jsonBytes:16*1048576,chunkBytes:65536,pathBytes:512});
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const fail=(code='archiveInvalid')=>{const e=new Error(code);e.code=code;throw e;};
const check=ok=>{if(!ok)fail();};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const cancel=options=>{if(options.cancelled?.())fail('backupCancelled');};
const table=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
function path(name){
  check(typeof name==='string' && encoder.encode(name).length<=limits.pathBytes && name===name.normalize('NFC'));
  check(!/[\\\x00-\x1f\x7f<>:"|?*]/.test(name));
  check(name.split('/').every(p=>p && p!=='.' && p!=='..' && !/[. ]$/.test(p) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p)));
  return name;
}
async function read(blob,start,length,options){
  cancel(options);check(Number.isSafeInteger(start) && start>=0 && length>=0 && length<=limits.chunkBytes && start+length<=blob.size);
  const bytes=new Uint8Array(await blob.slice(start,start+length).arrayBuffer());cancel(options);check(bytes.length===length);return bytes;
}
async function crc32(blob,options={},name=''){
  let c=0xffffffff;
  for(let offset=0;offset<blob.size;offset+=limits.chunkBytes){
    const bytes=await read(blob,offset,Math.min(limits.chunkBytes,blob.size-offset),options);
    for(const b of bytes)c=table[(c^b)&255]^(c>>>8);
    options.progress?.({name,done:offset+bytes.length,total:blob.size,phase:'archive'});await tick();cancel(options);
  }
  cancel(options);return (c^0xffffffff)>>>0;
}
function entriesCheck(entries){
  if(!Array.isArray(entries)||!entries.length||entries.length>limits.entries)fail('archiveLimit');
  const names=new Set();let size=22;
  for(const e of entries){path(e.path);const key=e.path.toLowerCase();check(!names.has(key));names.add(key);
    check(e.blob instanceof Blob);size+=76+2*encoder.encode(e.path).length+e.blob.size;
    if(e.path==='project.json' && e.blob.size>limits.jsonBytes)fail('archiveLimit');
    if(size>limits.bytes)fail('archiveLimit');
  }
  return size;
}
async function write(entries,options={}){
  const size=entriesCheck(entries),parts=[],central=[];let offset=0,centralSize=0;
  for(const e of entries){
    cancel(options);const name=encoder.encode(e.path),crc=await crc32(e.blob,options,e.path);
    const local=new Uint8Array(30+name.length),v=new DataView(local.buffer);
    v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);
    v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,e.blob.size,true);v.setUint32(22,e.blob.size,true);v.setUint16(26,name.length,true);local.set(name,30);
    const header=new Uint8Array(46+name.length),w=new DataView(header.buffer);
    w.setUint32(0,0x02014b50,true);w.setUint16(4,20,true);w.setUint16(6,20,true);w.setUint16(8,0x800,true);
    w.setUint16(14,33,true);w.setUint32(16,crc,true);w.setUint32(20,e.blob.size,true);w.setUint32(24,e.blob.size,true);w.setUint16(28,name.length,true);w.setUint32(42,offset,true);header.set(name,46);
    parts.push({local,blob:e.blob});central.push(header);offset+=local.length+e.blob.size;centralSize+=header.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);
  return {size,type:'application/zip',check:()=>cancel(options),async *stream(){
    for(const p of parts){cancel(options);yield p.local;
      for(let start=0;start<p.blob.size;start+=limits.chunkBytes){yield await read(p.blob,start,Math.min(limits.chunkBytes,p.blob.size-start),options);await tick();}
    }
    for(const header of central){cancel(options);yield header;}cancel(options);yield end;cancel(options);
  }};
}
async function open(blob,options={}){
  cancel(options);check(blob instanceof Blob && blob.size>=22);
  if(blob.size>limits.bytes)fail('archiveLimit');
  const end=await read(blob,blob.size-22,22,options),e=new DataView(end.buffer);
  check(e.getUint32(0,true)===0x06054b50 && e.getUint16(4,true)===0 && e.getUint16(6,true)===0 && e.getUint16(20,true)===0);
  const count=e.getUint16(10,true),length=e.getUint32(12,true),start=e.getUint32(16,true);
  if(count>limits.entries)fail('archiveLimit');
  check(count>0 && count===e.getUint16(8,true) && start+length===blob.size-22 && length<=count*(46+limits.pathBytes));
  const entries=new Map(),names=new Set();let pos=start,offset=0;
  // Fully inspect both directory and local headers before touching payloads.
  for(let i=0;i<count;i++){
    check(pos+46<=start+length);const bytes=await read(blob,pos,46,options),v=new DataView(bytes.buffer);
    check(v.getUint32(0,true)===0x02014b50 && v.getUint16(4,true)===20 && v.getUint16(6,true)===20 && v.getUint16(8,true)===0x800 && v.getUint16(10,true)===0);
    const crc=v.getUint32(16,true),size=v.getUint32(20,true),n=v.getUint16(28,true);
    check(size===v.getUint32(24,true) && n>0 && n<=limits.pathBytes && pos+46+n<=start+length);
    check(v.getUint16(30,true)===0 && v.getUint16(32,true)===0 && v.getUint16(34,true)===0 && v.getUint16(36,true)===0 && v.getUint32(38,true)===0 && v.getUint32(42,true)===offset);
    const rawName=await read(blob,pos+46,n,options);let name;try{name=decoder.decode(rawName);}catch(_){fail();}path(name);
    check(!names.has(name.toLowerCase()));names.add(name.toLowerCase());
    check(offset+30+n+size<=start);const local=await read(blob,offset,30,options),l=new DataView(local.buffer);
    check(l.getUint32(0,true)===0x04034b50 && l.getUint16(4,true)===20 && l.getUint16(6,true)===0x800 && l.getUint16(8,true)===0 && l.getUint16(10,true)===v.getUint16(12,true) && l.getUint16(12,true)===v.getUint16(14,true));
    check(l.getUint32(14,true)===crc && l.getUint32(18,true)===size && l.getUint32(22,true)===size && l.getUint16(26,true)===n && l.getUint16(28,true)===0);
    const localName=await read(blob,offset+30,n,options);check(localName.every((b,j)=>b===rawName[j]));
    entries.set(name,{blob:blob.slice(offset+30+n,offset+30+n+size),crc});offset+=30+n+size;pos+=46+n;
  }
  check(pos===start+length && offset===start);
  const result=new Map();
  for(const [name,entry] of entries){
    if(name==='project.json' && entry.blob.size>limits.jsonBytes)fail('archiveLimit');
    check(await crc32(entry.blob,options,name)===entry.crc);result.set(name,entry.blob);
  }
  cancel(options);return result;
}
async function stage(blob,options={}){
  const entries=await open(blob,options),json=entries.get('project.json');check(!!json);
  const text=await json.text();cancel(options);let project;
  try{project=JSON.parse(text);}catch(_){fail('backupJson');}
  root.ScuLaSongBackup.validate(project);
  const expected=new Set(['project.json']),files=[];
  for(const r of project.recordings){
    const name=r.source.relativePath;path(name);check(!!r.source.integrity && name!=='project.json' && !expected.has(name));expected.add(name);
    const audio=entries.get(name);check(!!audio);
    // Staging matches exact basenames, after this layer checks exact paths.
    files.push(new File([audio],name.split('/').pop(),{type:'audio/wav'}));
  }
  const refs=(project.arrangements||[]).flatMap(a=>Object.values(a.parts).filter(p=>p.samplePack).map(p=>p.samplePack));
  let pack=null;
  if(refs.length){
    check(refs.every(root.ScuLaSongPacks.validReference));
    const catalog=root.ScuLaSongPackCatalog.manifest,names=['pack/manifest.json','pack/LICENSE.txt',...catalog.samples.map(s=>'pack/'+s.file)];
    names.forEach(name=>{check(entries.has(name));expected.add(name);});
    check(entries.get(names[0]).size<=65536 && entries.get(names[1]).size<=65536);
    let manifest;try{manifest=JSON.parse(await entries.get(names[0]).text());}catch(_){fail();}
    check(await entries.get(names[1]).text()===catalog.license.text);
    const assets=catalog.samples.map(s=>entries.get('pack/'+s.file));
    await root.ScuLaSongPacks.verify(manifest,assets,{signal:{get aborted(){return !!options.cancelled?.();}}});
    pack={manifest:entries.get(names[0]),files:assets.map((b,i)=>new File([b],catalog.samples[i].file,{type:'audio/wav'}))};
  }
  check(entries.size===expected.size && Array.from(entries.keys()).every(name=>expected.has(name)));cancel(options);
  const staged=await root.ScuLaSongBackup.stage(text,files,options);cancel(options);return {...staged,pack};
}
root.ScuLaSongArchive=Object.freeze({limits,write,open,stage});
})(typeof window==='undefined'?globalThis:window);
