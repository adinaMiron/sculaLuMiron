// Real browser streaming/save failure and long-preview checks, with no giant PCM fixture.
const assert=require('assert/strict'),path=require('path'),{chromium}=require('playwright');
const {fixture}=require('./song-bounded-render');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const context=await browser.newContext({acceptDownloads:true}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('scula:ui-lang','en'));
  await p.goto('file://'+path.resolve(__dirname,'../song.html'));await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
  const refused=await p.evaluate(async()=>{let reads=0;try{await ScuLaFolder.save('oversized.wav',{size:32*1048576+1,type:'audio/wav',stream:async function*(){reads++;yield new Uint8Array(1);}});}catch(e){return {message:e.message,reads};}});assert.deepEqual(refused,{message:'exportLimit',reads:0});
  // Exercise the shared folder stream path, not a replacement ScuLaFolder.save.
  await p.evaluate(()=>{
   window.writes=[];window.streamClosed=0;window.aborted=0;window.pendingWrites=0;window.maxWrites=0;window.failWrite=false;
   function directory(name){return {name,queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getDirectoryHandle:async n=>directory(n),getFileHandle:async(n,opts)=>{if(!opts)throw new DOMException('missing','NotFoundError');return {createWritable:async()=>({write:async b=>{maxWrites=Math.max(maxWrites,++pendingWrites);await new Promise(r=>setTimeout(r,2));pendingWrites--;if(failWrite)throw new DOMException('full','QuotaExceededError');writes.push(Array.from(b));},close:async()=>{streamClosed++;},abort:async()=>{aborted++;}})};}};}
   window.showDirectoryPicker=async()=>directory('Root');
  });
  await p.click('#navFolderBtn');await p.waitForFunction(()=>ScuLaFolder.mode()==='folder');
  const result=await p.evaluate(async()=>{
   const source={size:12,type:'audio/wav',stream:async function*(){for(let i=0;i<3;i++)yield new Uint8Array(4).fill(i);}};
   const saved=await ScuLaFolder.save('stream.wav',source,{directories:['project','exports']});
   failWrite=true;let failure;try{await ScuLaFolder.save('fail.wav',source);}catch(e){failure=e.name;}failWrite=false;
   let cancel=false;const canceled={...source,check(){if(cancel)throw Error('cancelled');},stream:async function*(){yield new Uint8Array(12);cancel=true;}};
   let cancellation;try{await ScuLaFolder.save('cancel.wav',canceled);}catch(e){cancellation=e.message;}
   let invalidReads=0;try{await ScuLaFolder.save('invalid.wav',{...source,stream:async function*(){invalidReads++;}},{directories:['..']});}catch(_){}
   return {via:saved.via,path:saved.path,writes:writes.slice(0,3),closed:streamClosed,aborted,maxWrites,failure,cancellation,invalidReads};
  });
  assert.equal(result.via,'folder');assert.equal(result.path,'Root/Song Creation/project/exports/stream.wav');assert.deepEqual(result.writes,[[0,0,0,0],[1,1,1,1],[2,2,2,2]]);assert.equal(result.closed,1);assert.equal(result.aborted,2);assert.equal(result.maxWrites,1);assert.equal(result.failure,'QuotaExceededError');assert.equal(result.cancellation,'cancelled');assert.equal(result.invalidReads,0);
  console.log('PASS ScuLaFolder backpressure, paths, quota/abort, final cancellation, invalid paths and oversized fallback before rendering');
  const a=fixture();a.duration=40;a.parts.lead.instrument='organ';a.parts.lead.notes[0].dur=39;
  // Seed the already-created project, retaining its storage shape and identity.
  await p.evaluate(async a=>{const db=await new Promise((res,rej)=>{const q=indexedDB.open('scula-song');q.onsuccess=()=>res(q.result);q.onerror=()=>rej(q.error);});const tx=db.transaction('projects','readwrite'),store=tx.objectStore('projects'),q=store.getAll();q.onsuccess=()=>{const project=q.result[0];project.arrangements=[a];project.timeline=[{id:'stream-section',name:'Long section',arrangementId:a.id,repeats:2}];store.put(project);};await new Promise((res,rej)=>{tx.oncomplete=res;tx.onabort=()=>rej(tx.error);});db.close();},a);
  await p.reload();await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
  await p.evaluate(()=>{
   window.audioBuffers=[];window.audioNodes=[];window.audioStarts=[];
   const create=AudioContext.prototype.createBuffer,start=AudioBufferSourceNode.prototype.start;
   AudioContext.prototype.createBuffer=function(...args){audioBuffers.push(args[1]);return create.apply(this,args);};
   AudioBufferSourceNode.prototype.start=function(...args){audioNodes.push(this);audioStarts.push({when:args[0],length:this.buffer.length});return start.apply(this,args);};
  });
  await p.click('#playSong');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('live peak control'));
  await p.waitForFunction(()=>Number(document.querySelector('#songSeek').value)>.15);
  const bounded=await p.evaluate(()=>({sizes:audioBuffers.slice(),starts:audioStarts.slice()}));assert.ok(bounded.sizes.length>1);assert.ok(bounded.sizes.every(n=>n<=4096));
  for(let i=1;i<bounded.starts.length;i++)assert.ok(Math.abs(bounded.starts[i].when-bounded.starts[i-1].when-bounded.starts[i-1].length/44100)<1e-9);
  await p.locator('#songSeek').evaluate(el=>{el.value='41';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.waitForFunction(()=>Number(document.querySelector('#songSeek').value)>=41&&document.querySelector('#status').textContent.includes('live peak control'));
  await p.click('#stopSong');await p.waitForFunction(()=>Number(document.querySelector('#songSeek').value)===0);
  assert.ok(await p.evaluate(()=>audioNodes.every(n=>n.buffer===null)));
  await p.locator('#songLoopMode').selectOption('custom');await p.locator('#songLoopStartField').fill('0.2');await p.locator('#songLoopStartField').press('Tab');await p.locator('#songLoopEndField').fill('0.7');await p.locator('#songLoopEndField').press('Tab');
  await p.evaluate(()=>{audioStarts=[];});await p.click('#playSong');await p.waitForFunction(()=>audioStarts.length>18);
  const loopStarts=await p.evaluate(()=>audioStarts.slice());for(let i=1;i<loopStarts.length;i++)assert.ok(Math.abs(loopStarts[i].when-loopStarts[i-1].when-loopStarts[i-1].length/44100)<1e-9,'loops must schedule continuously');
  await p.click('#stopSong');
  console.log('PASS shipped long-song preview uses <=4096-frame buffers; continuous scheduling, seek, loop and Stop release nodes');
  // A long seek must be interruptible while replaying earlier reverb/voice state.
  await p.locator('#songLoopMode').selectOption('off');await p.locator('#songSeek').evaluate(el=>{el.value='38';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.click('#playSong');await p.click('#stopSong');await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
  assert.ok(await p.evaluate(()=>audioNodes.every(n=>n.buffer===null)));
  // Sparse metadata exercises download refusal in the real handler, without rendering 20 minutes.
  await p.evaluate(async()=>{await ScuLaFolder.forget();await ScuLaFolder.setMode('download');});
  await p.getByLabel('Repeats 1').fill('16');await p.getByLabel('Repeats 1').press('Tab');await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
  await p.click('#saveSongWav');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('32 MiB'));assert.match(await p.textContent('#status'),/writable folder/);
  await p.setViewportSize({width:390,height:844});await p.click('#navLangBtn');await p.click('#saveSongWav');await p.waitForFunction(()=>document.querySelector('#status').textContent.includes('32 MiB'));assert.match(await p.textContent('#status'),/dosar/);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);
  console.log('PASS cancellation during long seek and real oversized WAV handler keeps the workspace usable');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
