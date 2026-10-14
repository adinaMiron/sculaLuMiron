/* Optional, immutable sample packs, separate from source/project storage.
   v1 imports only the pinned native piano map. No SFZ or executable manifests. */
(function(root){
'use strict';
const C=root.ScuLaSongPackCatalog,MAX_BYTES=2*1048576;
const reference=()=>({id:C.manifest.id,version:C.manifest.version,sha256:C.sha256});
const validReference=r=>!!r&&r.id===C.manifest.id&&r.version===C.manifest.version&&r.sha256===C.sha256&&Object.keys(r).length===3;
const check=signal=>{if(signal?.aborted)throw Error('cancelled');};
function open(){return new Promise((resolve,reject)=>{const r=indexedDB.open('scula-song-packs',1);r.onupgradeneeded=()=>r.result.createObjectStore('packs',{keyPath:'sha256'});r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('packStorage'));r.onsuccess=()=>{r.result.onversionchange=()=>r.result.close();resolve(r.result);};});}
async function stored(){const db=await open();try{return await new Promise((resolve,reject)=>{const tx=db.transaction('packs'),r=tx.objectStore('packs').get(C.sha256);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}finally{db.close();}}
async function publish(record,signal){check(signal);const db=await open();try{await new Promise((resolve,reject)=>{check(signal);const tx=db.transaction('packs','readwrite'),abort=()=>{try{tx.abort();}catch(_){}};signal?.addEventListener('abort',abort,{once:true});tx.objectStore('packs').put(record);tx.oncomplete=()=>{signal?.removeEventListener('abort',abort);resolve();};tx.onabort=tx.onerror=()=>{signal?.removeEventListener('abort',abort);reject(Error(signal?.aborted?'cancelled':'packStorage'));};});}catch(e){throw Error(signal?.aborted||e.message==='cancelled'?'cancelled':'packStorage');}finally{db.close();}}
async function verify(manifest,assets,{signal,progress=()=>{}}={}){
 check(signal);
 if(JSON.stringify(manifest)!==JSON.stringify(C.manifest))throw Error('packInvalid');
 if(!Array.isArray(assets)||assets.length!==manifest.samples.length)throw Error('packInvalid');
 let total=0;
 for(let i=0;i<assets.length;i++){
  const blob=assets[i],s=manifest.samples[i];check(signal);
  if(!(blob instanceof Blob)||blob.size!==s.bytes||(total+=blob.size)>MAX_BYTES)throw Error('packInvalid');
  if(await root.ScuLaIntegrity.sha256(blob,{cancelled:()=>!!signal?.aborted})!==s.sha256)throw Error('packInvalid');
  const info=await root.ScuLaPerformance.inspectWav(blob,{cancelled:()=>!!signal?.aborted});
  if(info.encoding!==1||info.bitDepth!==16||info.channelCount!==1||info.sampleRate!==22050||info.duration>6.001)throw Error('packInvalid');
  progress((i+1)/assets.length);
 }
 check(signal);return {sha256:C.sha256,manifest,assets};
}
async function installFiles(manifestFile,files,options={}){
 if(!manifestFile||manifestFile.size>65536)throw Error('packInvalid');
 let manifest;try{manifest=JSON.parse(await manifestFile.text());}catch(_){throw Error('packInvalid');}
 const list=Array.from(files);if(list.length!==C.manifest.samples.length)throw Error('packInvalid');
 const assets=C.manifest.samples.map(s=>{const matches=list.filter(f=>f.name===s.file);if(matches.length!==1)throw Error('packInvalid');return matches[0];});
 const record=await verify(manifest,assets,options);await publish(record,options.signal);return reference();
}
async function boundedFetch(url,size,signal){
 const response=await fetch(url,{signal});if(!response.ok||!response.body)throw Error('packDownload');
 const declared=response.headers.get('Content-Length');if(declared!==null&&Number(declared)!==size){await response.body.cancel();throw Error('packInvalid');}
 const reader=response.body.getReader(),chunks=[];let bytes=0;
 try{while(true){check(signal);const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>size)throw Error('packInvalid');chunks.push(value);}if(bytes!==size)throw Error('packInvalid');return new Blob(chunks,{type:'audio/wav'});}finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
}
async function download(options={}){
 const assets=[];let bytes=0;
 for(const s of C.manifest.samples){check(options.signal);if((bytes+=s.bytes)>MAX_BYTES)throw Error('packInvalid');assets.push(await boundedFetch(s.url,s.bytes,options.signal));options.progress?.(assets.length/C.manifest.samples.length*.7);}
 const record=await verify(C.manifest,assets,{...options,progress:v=>options.progress?.(.7+v*.3)});await publish(record,options.signal);return reference();
}
async function remove(){const db=await open();try{await new Promise((resolve,reject)=>{const tx=db.transaction('packs','readwrite');tx.objectStore('packs').delete(C.sha256);tx.oncomplete=resolve;tx.onabort=tx.onerror=()=>reject(Error('packStorage'));});}finally{db.close();}}
async function decode(ref,{cancelled=()=>false,remainingBytes=16*1048576}={}){
 if(!validReference(ref))return [];
 const record=await stored();if(!record)return [];
 if(7*6*22050*4>remainingBytes)throw Error('sampleBudget');
 // Recheck stored bytes: storage or an older client must never change the pinned sound.
 await verify(record.manifest,record.assets,{signal:{get aborted(){return cancelled();}}});
 const result=[];
 for(let i=0;i<record.assets.length;i++){
  if(cancelled())throw Error('cancelled');
  const blob=record.assets[i],info=await root.ScuLaPerformance.inspectWav(blob,{cancelled});
  const buffer=await blob.arrayBuffer(),data=new DataView(buffer),frames=Math.round(info.duration*info.sampleRate),channel=new Float32Array(frames);
  for(let j=0;j<frames;j++)channel[j]=data.getInt16(info.dataOffset+j*2,true)/32768;
  const s=C.manifest.samples[i];result.push({midiNote:s.midiNote,dynamic:s.dynamic,playback:s.playback,sampleRate:22050,channels:[channel],minMidi:C.manifest.mapping.minMidi,maxMidi:C.manifest.mapping.maxMidi,maxShift:C.manifest.mapping.maxShift,piano:true});
 }
 return result;
}
root.ScuLaSongPacks=Object.freeze({version:1,reference,validReference,stored,verify,installFiles,download,remove,decode,limits:Object.freeze({encodedBytes:MAX_BYTES,decodedBytes:7*6*22050*4})});
})(typeof window==='undefined'?globalThis:window);
