/* Song-only persistence. Transactions fence every writer, including captures.
   No timer grants ownership. Web Locks are a convenience; IDB is authoritative. */
(function(){
  'use strict';
  const stores=['projects','audio','workspace','captures','captureChunks'];
  const conflict=()=>new Error('writerConflict');
  function open(blocked=()=>{}){return new Promise((resolve,reject)=>{
    const request=indexedDB.open('scula-song',2);
    request.onupgradeneeded=()=>{
      const db=request.result;
      for(const name of stores)if(!db.objectStoreNames.contains(name))
        db.createObjectStore(name,name==='projects'||name==='captures'?{keyPath:'id'}:undefined);
    };
    request.onblocked=blocked;
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>resolve(request.result);
  });}
  function transaction(db,names,mode,work){return new Promise((resolve,reject)=>{
    const tx=db.transaction(names,mode);let result,error;
    const fail=e=>{error=e;tx.abort();};
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(error||tx.error||new Error('storageError'));
    tx.onerror=()=>{};
    try{work(tx,value=>{result=value;},fail);}catch(e){fail(e);}
  });}
  function checked(tx,owner,revision,work,fail){
    const request=tx.objectStore('workspace').get('writer');
    request.onsuccess=()=>{
      const value=request.result||{owner:null,revision:0};
      if(value.owner!==owner || revision!==undefined && value.revision!==revision){fail(conflict());return;}
      try{work(value);}catch(e){fail(e);}
    };
  }
  function claim(db,owner,force=false,expectedOwner,locked=false){return transaction(db,['workspace'],'readwrite',(tx,done,fail)=>{
    const store=tx.objectStore('workspace'),request=store.get('writer');
    request.onsuccess=()=>{try{const value=request.result||{owner:null,revision:0};
      if(!value.owner || value.owner===owner || force && (expectedOwner===undefined || value.owner===expectedOwner)){value.owner=owner;value.locked=locked;store.put(value,'writer');}
      done(value.owner===owner);
    }catch(e){fail(e);}};
  });}
  function release(db,owner){return transaction(db,['workspace'],'readwrite',(tx,done,fail)=>{
    const store=tx.objectStore('workspace'),request=store.get('writer');
    request.onsuccess=()=>{try{if(request.result?.owner===owner)store.put({...request.result,owner:null},'writer');}catch(e){fail(e);}};
  });}
  function snapshot(db){return transaction(db,['projects','workspace','captures'],'readonly',(tx,done)=>{
    const value={projects:[],captures:[],writer:{owner:null,revision:0}};
    for(const name of ['projects','captures','workspace']){
      const request=name==='workspace'?tx.objectStore(name).get('writer'):tx.objectStore(name).getAll();
      request.onsuccess=()=>{value[name==='workspace'?'writer':name]=request.result||value.writer;};
    }
    done(value);
  });}
  const range=id=>IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER]);
  function removeCapture(tx,id){tx.objectStore('captures').delete(id);tx.objectStore('captureChunks').delete(range(id));}
  function commit(db,owner,revision,projects,audio,deleted,finished){
    return transaction(db,stores,'readwrite',(tx,done,fail)=>checked(tx,owner,revision,value=>{
      for(const p of projects)tx.objectStore('projects').put(p);
      audio.forEach((blob,key)=>tx.objectStore('audio').put(blob,key));
      deleted.forEach(key=>tx.objectStore('audio').delete(key));
      finished.forEach(key=>removeCapture(tx,key));
      value.revision++;tx.objectStore('workspace').put(value,'writer');done(value.revision);
    },fail));
  }
  function append(db,owner,metadata,sequence,blob){
    return transaction(db,['workspace','captures','captureChunks'],'readwrite',(tx,done,fail)=>checked(tx,owner,undefined,()=>{
      const store=tx.objectStore('captures'),request=store.get(metadata.id);
      request.onsuccess=()=>{try{
        const previous=request.result,bytes=previous?.bytes||0;
        if(!Number.isInteger(sequence) || sequence<0 || metadata.encoding!=='PCM24' || ![1,2].includes(metadata.channels) ||
           !Number.isInteger(metadata.sampleRate) || metadata.sampleRate<8000 || metadata.sampleRate>192000 ||
           (previous?.sequence||0)!==sequence || !blob.size || bytes+blob.size>0xffffffff-37 || blob.size%(metadata.channels*3) ||
           previous && (previous.sampleRate!==metadata.sampleRate || previous.channels!==metadata.channels || previous.projectId!==metadata.projectId))throw new Error('journalInvalid');
        const next={...metadata,sequence:sequence+1,bytes:bytes+blob.size,frames:(bytes+blob.size)/(metadata.channels*3)};
        tx.objectStore('captureChunks').add({sequence,frames:blob.size/(metadata.channels*3),blob},[metadata.id,sequence]);
        store.put(next);done(next);
      }catch(e){fail(e);}};
    },fail));
  }
  // Read a single consistent checkpoint, inspecting Blob dimensions without
  // copying the entire payload into an ArrayBuffer or decoding/resampling it.
  function recover(db,id){return transaction(db,['captures','captureChunks'],'readonly',(tx,done,fail)=>{
    const request=tx.objectStore('captures').get(id);
    request.onsuccess=()=>{
      const meta=request.result;if(!meta){fail(new Error('journalMissing'));return;}
      if(meta.encoding!=='PCM24' || ![1,2].includes(meta.channels) || !Number.isInteger(meta.sampleRate) || meta.sampleRate<8000 || meta.sampleRate>192000 ||
         !Number.isSafeInteger(meta.sequence) || meta.sequence<1 || !Number.isSafeInteger(meta.frames) || meta.frames<1 ||
         !Number.isSafeInteger(meta.bytes) || meta.bytes>0xffffffff-37){fail(new Error('journalInvalid'));return;}
      const parts=[];let bytes=0,sequence=0;
      const cursor=tx.objectStore('captureChunks').openCursor(range(id));
      cursor.onsuccess=()=>{try{
        const item=cursor.result;
        if(item){const chunk=item.value;
          if(item.key[1]!==sequence || chunk.sequence!==sequence || !Number.isSafeInteger(chunk.frames) || !(chunk.blob instanceof Blob) || !chunk.blob.size || chunk.blob.size!==chunk.frames*meta.channels*3)throw new Error('journalInvalid');
          parts.push(chunk.blob);bytes+=chunk.blob.size;sequence++;item.continue();return;
        }
        if(sequence!==meta.sequence || !sequence || bytes!==meta.bytes || meta.frames*meta.channels*3!==bytes)throw new Error('journalInvalid');
        done({meta,blob:ScuLaPCM.wav(parts,bytes,meta.sampleRate,meta.channels)});
      }catch(e){fail(e);}};
    };
  });}
  function discard(db,owner,id){return transaction(db,['workspace','captures','captureChunks'],'readwrite',(tx,done,fail)=>checked(tx,owner,undefined,()=>removeCapture(tx,id),fail));}
  window.ScuLaSongStorage=Object.freeze({open,claim,release,snapshot,commit,append,recover,discard});
})();
