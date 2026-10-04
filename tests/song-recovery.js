// Milestone A: real IndexedDB transactions, page termination and competing tabs.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const server=http.createServer((req,res)=>{
 if(req.url==='/empty'){res.end('<!doctype html><title>Storage fixture</title>');return;}
 const file=path.resolve(root,'.'+req.url.split('?')[0]);
 if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
 fs.readFile(file,(error,data)=>{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.statusCode=error?404:200;res.end(error?'missing':data);});
});
let browser,origin,checks=0;
function pass(label){checks++;console.log('PASS  '+label);}
async function ready(p){await p.waitForFunction(()=>document.querySelector('#recordState')?.textContent==='Ready');}
async function open(context){const p=await context.newPage();p.on('pageerror',e=>{throw e;});await p.goto(origin+'/song.html');await ready(p);return p;}
async function context(options={}){const ctx=await browser.newContext({acceptDownloads:true,...options});await ctx.addInitScript(()=>localStorage.setItem('scula:ui-lang','en'));return ctx;}
async function snapshot(p){return p.evaluate(async()=>{const db=await ScuLaSongStorage.open();try{return await ScuLaSongStorage.snapshot(db);}finally{db.close();}});}
async function checkpointReady(p){const end=Date.now()+15000;while(Date.now()<end){const saved=await snapshot(p);if(saved.captures[0]?.sequence>=1)return;await p.waitForTimeout(100);}throw Error('No durable checkpoint: '+await p.textContent('#status'));}
async function storedAudio(p,id){return p.evaluate(async id=>{const db=await ScuLaSongStorage.open();const blob=await new Promise((resolve,reject)=>{const r=db.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});db.close();return [...new Uint8Array(await blob.arrayBuffer())];},id);}
async function savedWav(p,selector){const event=p.waitForEvent('download');await p.locator(selector).click();const d=await event;await ready(p);return fs.readFileSync(await d.path());}
async function seed(p,channels=2){return p.evaluate(async channels=>{
 const db=await ScuLaSongStorage.open(),saved=await ScuLaSongStorage.snapshot(db),project=saved.projects[0];
 const meta={id:'capture-'+crypto.randomUUID(),projectId:project.id,projectName:project.name,name:'ExactPCM'.repeat(15),createdAt:new Date().toISOString(),purpose:'melody',sampleRate:48000,channels,encoding:'PCM24',backend:'fixture',settings:{},label:'fixture',waveform:[.5],peak:.5};
 const data=[];
 for(let sequence=0;sequence<3;sequence++){
  const pcm=ScuLaPCM.pack24(Array.from({length:channels},(_,c)=>Float32Array.from({length:sequence===2?8:5+sequence},(_,i)=>(sequence+1)*(i%2?-.1:.1)*(c?-.5:1))));
  data.push(...pcm);await ScuLaSongStorage.append(db,saved.writer.owner,meta,sequence,new Blob([pcm]));
 }
 db.close();return {id:meta.id,data,channels};
},channels);}
function wav(bytes,expected,channels){
 assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.readUInt32LE(4),bytes.length-8);
 assert.equal(bytes.readUInt16LE(22),channels);assert.equal(bytes.readUInt32LE(24),48000);assert.equal(bytes.readUInt16LE(34),24);
 assert.equal(bytes.readUInt32LE(40),expected.length);assert.equal(bytes.length,44+expected.length+expected.length%2);
 assert.deepEqual(bytes.subarray(44,44+expected.length),Buffer.from(expected));
}
(async()=>{try{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));origin='http://127.0.0.1:'+server.address().port;
 browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 // Existing v1 database, blocked upgrade and preservation of opaque source bytes.
 {
  const ctx=await context(),old=await ctx.newPage();await old.goto(origin+'/empty');
  await old.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('scula-song',1);r.onupgradeneeded=()=>{r.result.createObjectStore('projects',{keyPath:'id'});r.result.createObjectStore('audio');};r.onsuccess=()=>{window.oldDB=r.result;const tx=oldDB.transaction(['projects','audio'],'readwrite');tx.objectStore('projects').put({schemaVersion:1,id:'legacy',name:'Legacy project',recordings:[],arrangements:[],timeline:[]});tx.objectStore('audio').put(new Blob([new Uint8Array([0,1,254,255])]),'legacy-audio');tx.oncomplete=resolve;};r.onerror=reject;}));
  const p=await ctx.newPage();await p.goto(origin+'/song.html');await p.waitForFunction(()=>/upgrade is blocked/.test(document.querySelector('#status').textContent));
  await p.click('#navLangBtn');assert.match(await p.textContent('#status'),/blocată/);await p.click('#navLangBtn');
  await old.evaluate(()=>oldDB.close());await ready(p);assert.equal((await snapshot(p)).projects[0].name,'Legacy project');assert.deepEqual(await storedAudio(p,'legacy-audio'),[0,1,254,255]);
  pass('v1 upgrades in place; blocked upgrade is visible in RO/EN; original bytes survive');await ctx.close();
 }
 // Deterministic exact bytes, odd padding and ordered checkpoints after page closure.
 for(const channels of [1,2]){
  const ctx=await context({viewport:{width:390,height:844}});let p=await open(ctx);const fixture=await seed(p,channels);await p.close();p=await open(ctx);
  assert.equal(await p.locator('[data-action=journalRecover]').count(),1);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const exported=await savedWav(p,'[data-action=journalExport]');wav(exported,fixture.data,channels);
  await p.evaluate(()=>{navigator.canShare=()=>true;navigator.share=async({files})=>{window.sharedRecovery=[...new Uint8Array(await files[0].arrayBuffer())];};ScuLaFolder.setMode('share');});
  await p.click('[data-action=journalExport]');await ready(p);assert.deepEqual(Buffer.from(await p.evaluate(()=>sharedRecovery)),exported);await p.evaluate(()=>ScuLaFolder.setMode('download'));
  const decoded=await p.evaluate(async bytes=>{const ac=new AudioContext();try{const a=await ac.decodeAudioData(new Uint8Array(bytes).buffer);return {frames:a.length,channels:a.numberOfChannels,first:a.getChannelData(0)[0]};}finally{await ac.close();}},[...exported]);
  assert.equal(decoded.channels,channels);assert.ok(Math.abs(decoded.first-.1)<1e-6);
  await p.click('#navLangBtn');assert.match(await p.textContent('#journalHeading'),/Înregistrări/);assert.match(await p.textContent('[data-action=journalRecover]'),/Recuperează/);await p.click('#navLangBtn');
  await p.click('[data-action=journalRecover]');await ready(p);let saved=await snapshot(p);assert.equal(saved.captures.length,0);assert.equal(saved.projects[0].recordings.length,1);assert.equal(saved.projects[0].recordings[0].source.interrupted,true);assert.equal(saved.projects[0].recordings[0].duration,fixture.data.length/(48000*channels*3));
  assert.deepEqual(Buffer.from(await storedAudio(p,fixture.id)),exported);await p.reload();await ready(p);assert.equal((await snapshot(p)).projects[0].recordings.length,1);assert.equal(await p.locator('[data-action=journalRecover]').count(),0);
  pass(`terminated page: ${channels}-channel exact PCM order, WAV dimensions/padding, decoded samples, recovery once, phone and RO/EN`);await ctx.close();
 }
 // Interrupted real worklet, known durable checkpoint and no unload finalization.
 {
  const ctx=await context();let p=await open(ctx);await p.click('#recordBtn');
  await checkpointReady(p);
  const checkpoint=await p.evaluate(async()=>{const db=await ScuLaSongStorage.open(),s=await ScuLaSongStorage.snapshot(db),r=await ScuLaSongStorage.recover(db,s.captures[0].id);db.close();return {id:r.meta.id,frames:r.meta.frames,bytes:[...new Uint8Array(await r.blob.arrayBuffer())]};});
  await p.close();p=await open(ctx);const bytes=await savedWav(p,'[data-action=journalExport]');assert.deepEqual(bytes,Buffer.from(checkpoint.bytes));assert.equal(bytes.readUInt32LE(40)/(bytes.readUInt16LE(22)*3),checkpoint.frames);
  await p.click('[data-action=journalRecover]');await ready(p);assert.equal((await snapshot(p)).projects[0].recordings.length,1);
  // Normal Stop after a durable checkpoint must atomically remove its journal.
  await p.click('#recordBtn');await checkpointReady(p);
  await p.evaluate(()=>{document.querySelector('#stopBtn').click();document.querySelector('#stopBtn').click();});await ready(p);const saved=await snapshot(p);assert.equal(saved.captures.length,0);assert.equal(saved.projects[0].recordings.length,2);
  pass('real worklet abrupt closure recovers the committed PCM; repeated normal Stop leaves exactly one completed take and no journal');await ctx.close();
 }
 // Atomic partial/checkpoint failures: abort after enqueueing the payload.
 {
  const ctx=await context(),p=await open(ctx);const fixture=await seed(p);
  const result=await p.evaluate(async id=>{
   const db=await ScuLaSongStorage.open(),s=await ScuLaSongStorage.snapshot(db),meta=s.captures[0];
   const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='captures')throw new DOMException('full','QuotaExceededError');return original.apply(this,args);};
   let error;try{await ScuLaSongStorage.append(db,s.writer.owner,meta,3,new Blob([new Uint8Array(6)]));}catch(e){error=e.name;}finally{IDBObjectStore.prototype.put=original;}
   const recovered=await ScuLaSongStorage.recover(db,id);const after=await ScuLaSongStorage.snapshot(db);db.close();return {error,sequence:after.captures[0].sequence,bytes:[...new Uint8Array(await recovered.blob.arrayBuffer())]};
  },fixture.id);
  assert.equal(result.error,'QuotaExceededError');assert.equal(result.sequence,3);wav(Buffer.from(result.bytes),fixture.data,2);
  // Corrupt sequence deliberately: never join audio on either side of the gap.
  await p.evaluate(async id=>{const db=await ScuLaSongStorage.open();await new Promise(resolve=>{const tx=db.transaction('captureChunks','readwrite');tx.objectStore('captureChunks').delete([id,1]);tx.oncomplete=resolve;});db.close();},fixture.id);
  await p.reload();await ready(p);await p.click('[data-action=journalRecover]');await ready(p);assert.match(await p.textContent('#status'),/missing chunk/);assert.equal((await snapshot(p)).projects[0].recordings.length,0);
  p.once('dialog',d=>d.dismiss());await p.click('[data-action=journalDiscard]');await ready(p);assert.equal((await snapshot(p)).captures.length,1);
  p.once('dialog',d=>d.accept());await p.click('[data-action=journalDiscard]');await ready(p);assert.equal((await snapshot(p)).captures.length,0);
  pass('quota abort rolls back chunk and checkpoint together; missing sequence is rejected; discard requires confirmation');await ctx.close();
 }
 // Finalization failure retains both durable journal and local export/retry.
 {
  const ctx=await context();let p=await open(ctx);const fixture=await seed(p);await p.reload();await ready(p);
  await p.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='audio')throw new DOMException('full','QuotaExceededError');return originalPut.apply(this,args);};});
  await p.click('[data-action=journalRecover]');await ready(p);assert.equal((await snapshot(p)).captures.length,1);assert.equal((await snapshot(p)).projects[0].recordings.length,0);assert.equal(await p.locator('.take').count(),1);assert.ok(await p.isVisible('#recovery'));
  wav(await savedWav(p,'.take button[data-read-only-safe]'),fixture.data,2);
  await p.click('[data-action=journalRecover]');await ready(p);assert.equal(await p.locator('.take').count(),1);
  await p.evaluate(()=>{IDBObjectStore.prototype.put=originalPut;});await p.click('#retry');await ready(p);assert.equal((await snapshot(p)).captures.length,0);assert.equal((await snapshot(p)).projects[0].recordings.length,1);
  await p.reload();await ready(p);assert.equal(await p.locator('.take').count(),1);
  pass('failed recovery publication retains journal and exportable take; repeated retry cannot duplicate; successful retry commits once');await ctx.close();
 }
 // Live capture quota failure, failed Stop and retry of retained full WAV.
 {
  const ctx=await context(),p=await open(ctx);
  await p.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='captures'||this.name==='audio')throw new DOMException('full','QuotaExceededError');return originalPut.apply(this,args);};});
  await p.click('#recordBtn');await p.waitForFunction(()=>/checkpoint failed/.test(document.querySelector('#status').textContent),null,{timeout:15000});assert.equal((await snapshot(p)).captures.length,0);
  await p.click('#stopBtn');await ready(p);assert.equal(await p.locator('.take').count(),1);assert.ok(await p.isVisible('#retry'));const bytes=await savedWav(p,'.take button[data-read-only-safe]');assert.ok(bytes.readUInt32LE(40)>48000*3*4);
  await p.evaluate(()=>{IDBObjectStore.prototype.put=originalPut;});await p.click('#retry');await ready(p);const saved=await snapshot(p);assert.equal(saved.projects[0].recordings.length,1);assert.deepEqual(Buffer.from(await storedAudio(p,saved.projects[0].recordings[0].id)),bytes);
  pass('live checkpoint quota failure is visible; failed Stop keeps complete audio exportable and retryable');await ctx.close();
 }
 // No advisory APIs: explicit persisted ownership still fences stale tabs.
 {
  const ctx=await context();await ctx.addInitScript(()=>{Object.defineProperty(navigator,'locks',{value:undefined});window.BroadcastChannel=undefined;});
  const a=await open(ctx),b=await open(ctx);assert.ok(await b.isVisible('#writerPanel'));assert.ok(await b.isDisabled('#renameProject'));assert.ok(!await b.isDisabled('#exportProject'));
  await b.click('#takeover');await ready(b);await b.fill('#projectName','New owner');await b.click('#renameProject');await ready(b);
  // Suppress focus notification to exercise the atomic write fence itself.
  await a.evaluate(()=>{document.querySelector('#projectName').value='Stale local work';document.querySelector('#renameProject').click();});await ready(a);
  assert.equal((await snapshot(a)).projects[0].name,'New owner');assert.match(await a.textContent('#writerStatus'),/Local work has been kept/);assert.equal(await a.textContent('#currentProject'),'Stale local work');
  const download=a.waitForEvent('download');await a.click('#exportProject');const file=await download;assert.equal(JSON.parse(fs.readFileSync(await file.path(),'utf8')).name,'Stale local work');await ready(a);
  a.once('dialog',d=>d.dismiss());await a.click('#takeover');await ready(a);assert.equal(await a.textContent('#currentProject'),'Stale local work');
  a.once('dialog',d=>d.accept());await a.click('#takeover');await ready(a);assert.equal(await a.textContent('#currentProject'),'New owner');
  // Close without relying on async unload release: takeover remains available.
  await a.close();await b.evaluate(()=>window.dispatchEvent(new Event('focus')));await b.waitForFunction(()=>!document.querySelector('#writerPanel').hidden);await b.click('#takeover');await ready(b);await b.fill('#projectName','After close');await b.click('#renameProject');await ready(b);assert.equal((await snapshot(b)).projects[0].name,'After close');
  pass('without Locks/BroadcastChannel: read-only second tab, stale commit rejected, local export retained, confirmed takeover reloads latest, owner closure');await ctx.close();
 }
 // API-enabled ownership notification and closing a writer automatically frees it.
 {
  const ctx=await context(),a=await open(ctx),b=await open(ctx);assert.ok(await b.isDisabled('#recordBtn'));
  await b.click('#takeover');await ready(b);await a.waitForFunction(()=>!document.querySelector('#writerPanel').hidden);assert.ok(await a.isDisabled('#recordBtn'));
  await b.close();await a.reload();await ready(a);assert.ok(!await a.isDisabled('#recordBtn'));
  pass('BroadcastChannel marks the old owner read-only; Web Locks detect closed owner without timers');await ctx.close();
 }
 // A live owner without Web Locks must not be mistaken for a closed owner.
 {
  const ctx=await context(),a=await ctx.newPage();await a.addInitScript(()=>{Object.defineProperty(navigator,'locks',{value:undefined});window.BroadcastChannel=undefined;});
  await a.goto(origin+'/song.html');await ready(a);const before=await snapshot(a),b=await open(ctx);
  assert.ok(await b.isDisabled('#recordBtn'));assert.equal((await snapshot(b)).writer.owner,before.writer.owner);
  pass('a tab with Web Locks never implicitly steals from a live owner lacking that API');await ctx.close();
 }
 // Losing ownership during capture must preserve both committed and local audio.
 {
  const ctx=await context(),a=await open(ctx);await a.click('#recordBtn');await checkpointReady(a);const b=await open(ctx);
  const prefix=await savedWav(b,'[data-action=journalExport]');await b.click('#takeover');await ready(b);await ready(a);
  assert.ok(await a.isVisible('#recovery'));assert.ok(await a.isDisabled('#retry'));
  const full=await savedWav(a,'.take button[data-read-only-safe]');assert.ok(full.readUInt32LE(40)>=prefix.readUInt32LE(40));assert.deepEqual(full.subarray(44,44+prefix.readUInt32LE(40)),prefix.subarray(44,44+prefix.readUInt32LE(40)));
  await b.click('[data-action=journalRecover]');await ready(b);const saved=await snapshot(b);assert.equal(saved.projects[0].recordings.length,1);assert.equal(saved.captures.length,0);
  assert.deepEqual(Buffer.from(await storedAudio(b,saved.projects[0].recordings[0].id)),prefix);
  // Same owner but stale revision is independently rejected, including deletes.
  const rejected=await b.evaluate(async()=>{const db=await ScuLaSongStorage.open(),s=await ScuLaSongStorage.snapshot(db);try{await ScuLaSongStorage.commit(db,s.writer.owner,s.writer.revision-1,[],new Map(),new Set([s.projects[0].recordings[0].id]),new Set());return false;}catch(e){return e.message==='writerConflict';}finally{db.close();}});
  assert.ok(rejected);assert.deepEqual(Buffer.from(await storedAudio(b,saved.projects[0].recordings[0].id)),prefix);
  pass('takeover fences an active recorder; local full WAV stays exportable; new owner recovers only committed prefix; stale revision cannot delete audio');await ctx.close();
 }
 // Back/forward-cache lifecycle releases locks/channels; safe takeover remains usable.
 {
  const ctx=await context(),p=await open(ctx);
  await p.evaluate(()=>{window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));});
  assert.ok(await p.isVisible('#writerPanel'));await p.click('#takeover');await ready(p);
  await p.fill('#projectName','Resumed page');await p.click('#renameProject');await ready(p);assert.equal((await snapshot(p)).projects[0].name,'Resumed page');assert.ok(!await p.isVisible('#recovery'));
  pass('restored page can safely take over and save after closing its prior channel/lock');await ctx.close();
 }
 // A project creation failure must not strand a subsequently committed capture.
 {
  const ctx=await context(),p=await open(ctx);const fixture=await seed(p);
  await p.evaluate(async()=>{const db=await ScuLaSongStorage.open();await new Promise(resolve=>{const tx=db.transaction('projects','readwrite');tx.objectStore('projects').clear();tx.oncomplete=resolve;});db.close();});
  await p.reload();await ready(p);await p.click('[data-action=journalRecover]');await ready(p);
  const saved=await snapshot(p);assert.equal(saved.projects.flatMap(p=>p.recordings).length,1);wav(Buffer.from(await storedAudio(p,fixture.id)),fixture.data,2);
  pass('capture metadata can restore its project identity when that project was never durably created');await ctx.close();
 }
 // A delayed permission response after takeover/page exit cannot restart capture.
 for(const exit of [false,true]){
  const ctx=await context(),p=await open(ctx);
  await p.evaluate(()=>{const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{await new Promise(resolve=>{window.allowMic=resolve;});window.delayedStream=await get(options);return delayedStream;};});
  await p.click('#recordBtn');await p.waitForFunction(()=>!!window.allowMic);
  if(exit)await p.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true})));
  else{const other=await open(ctx);await other.click('#takeover');await ready(other);await p.waitForFunction(()=>!document.querySelector('#writerPanel').hidden);}
  await p.evaluate(()=>allowMic());await ready(p);assert.ok(await p.evaluate(()=>delayedStream.getTracks().every(t=>t.readyState==='ended')));assert.equal((await snapshot(p)).captures.length,0);
  pass('delayed microphone after '+(exit?'page exit':'takeover')+' closes tracks without starting a stale capture');await ctx.close();
 }
 console.log(`All ${checks} recovery/concurrency scenarios passed`);
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}})().catch(e=>{console.error(e);process.exitCode=1;});
