// Shipped ZIP controls: portable audio/music/packs, staged publication and failures.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),packDir=path.join(root,'assets/song-packs/salamander-compact-v1');
const ready=p=>p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
async function save(p,selector){const [d]=await Promise.all([p.waitForEvent('download'),p.locator(selector).click()]);await ready(p);return fs.readFileSync(await d.path());}
async function storage(p){return p.evaluate(async()=>{const db=await ScuLaSongStorage.open();try{const s=await ScuLaSongStorage.snapshot(db);return s.projects;}finally{db.close();}});}
async function select(p,bytes){await p.setInputFiles('#backupArchive',{name:'backup.zip',mimeType:'application/zip',buffer:bytes});await p.click('#validateBackup');await ready(p);}
function wav(){const b=Buffer.alloc(44+22050*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(22050,24);b.writeUInt32LE(44100,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=0;i<22050;i++)b.writeInt16LE(Math.round(8000*Math.sin(2*Math.PI*261.6256*i/22050)),44+i*2);return b;}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const context=await browser.newContext({acceptDownloads:true}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>localStorage.setItem('scula:ui-lang','en'));await p.goto('file://'+path.join(root,'song.html'));await ready(p);
  const audio=wav();await p.setInputFiles('#importWav',{name:'voice.wav',mimeType:'audio/wav',buffer:audio});await ready(p);
  for(const name of ['Extract melody','Create arrangement version','Compose a new copy']){await p.getByRole('button',{name,exact:true}).click();await ready(p);}
  await p.getByLabel('Meter',{exact:true}).selectOption('3/4');await ready(p);await p.click('#addSongSection');await ready(p);
  const before=await storage(p),manifest=JSON.parse(await save(p,'#exportProject')),zip=await save(p,'#exportArchive');
  await select(p,zip);assert.equal(await p.isEnabled('#restoreBackup'),true,await p.textContent('#backupSummary'));assert.deepEqual(await storage(p),before);
  await p.click('#restoreBackup');await ready(p);const after=await storage(p);assert.equal(after.length,2);assert.deepEqual(after.find(v=>v.id===before[0].id),before[0]);
  const restored=after.find(v=>v.id!==before[0].id);assert.deepEqual(restored.arrangements.map(a=>[a.composition,a.parts,a.chords,a.performanceSnapshot]),before[0].arrangements.map(a=>[a.composition,a.parts,a.chords,a.performanceSnapshot]));
  assert.notEqual(restored.recordings[0].id,before[0].recordings[0].id);assert.equal(restored.timeline[0].arrangementId,restored.arrangements[1].id);
  await p.reload();await ready(p);assert.deepEqual(await save(p,'.take > .row > button:first-child'),audio);
  // Valid ZIP CRC but stale WAV SHA-256 must still fail before publication.
  await p.setInputFiles('#backupArchive',{name:'backup.zip',mimeType:'application/zip',buffer:zip});
  const tampered=await p.evaluate(async()=>{const Z=ScuLaSongArchive,map=await Z.open(document.querySelector('#backupArchive').files[0]),entries=[];for(const [path,blob] of map){if(path.endsWith('.wav')){const bytes=new Uint8Array(await blob.arrayBuffer());bytes[bytes.length-1]^=1;entries.push({path,blob:new Blob([bytes])});}else entries.push({path,blob});}const source=await Z.write(entries),out=[];for await(const b of source.stream())out.push(...b);return out;});
  await select(p,Buffer.from(tampered));assert.equal(await p.isEnabled('#restoreBackup'),false);assert.match(await p.textContent('#backupSummary'),/SHA-256 integrity mismatch/);assert.deepEqual(await storage(p),after);
  // Undeclared entries and absent source paths are rejected even with valid CRCs.
  for(const mode of ['extra','missing','path','digest']){
    await p.setInputFiles('#backupArchive',{name:'backup.zip',mimeType:'application/zip',buffer:zip});
    const bad=await p.evaluate(async mode=>{const Z=ScuLaSongArchive,map=await Z.open(document.querySelector('#backupArchive').files[0]);if(mode==='extra')map.set('extra.txt',new Blob(['extra']));if(mode==='missing')map.delete(Array.from(map.keys()).find(k=>k.endsWith('.wav')));if(mode==='path'||mode==='digest'){const v=JSON.parse(await map.get('project.json').text());if(mode==='path')v.recordings[0].source.relativePath='wrong/'+v.recordings[0].source.filename;else delete v.recordings[0].source.integrity;map.set('project.json',new Blob([JSON.stringify(v)]));}const source=await Z.write(Array.from(map,([path,blob])=>({path,blob}))),out=[];for await(const b of source.stream())for(const x of b)out.push(x);return out;},mode);
    await select(p,Buffer.from(bad));assert.equal(await p.isEnabled('#restoreBackup'),false);assert.deepEqual(await storage(p),after);
  }
  // Existing loose JSON/WAV selection remains usable and clears the ZIP choice.
  await p.setInputFiles('#backupJson',{name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(manifest))});await p.setInputFiles('#backupWavs',{name:manifest.recordings[0].source.filename,mimeType:'audio/wav',buffer:audio});assert.equal(await p.locator('#backupArchive').inputValue(),'');await p.click('#validateBackup');await ready(p);assert.equal(await p.isEnabled('#restoreBackup'),true);await p.click('#cancelBackup');
  // Cancel while archive validation is reading; no writes or import readiness.
  await p.evaluate(()=>{window.nativeRead=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){window.reading=true;await new Promise(r=>setTimeout(r,25));return nativeRead.call(this);};});
  await p.setInputFiles('#backupArchive',{name:'backup.zip',mimeType:'application/zip',buffer:zip});await p.click('#validateBackup');await p.waitForFunction(()=>window.reading);await p.click('#cancelBackup');await ready(p);assert.equal(await p.isEnabled('#restoreBackup'),false);assert.deepEqual(await storage(p),after);await p.evaluate(()=>Blob.prototype.arrayBuffer=nativeRead);
  // Atomic project/audio failure retains complete data for retry and export.
  await select(p,zip);await p.evaluate(()=>{window.nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='audio')throw new DOMException('full','QuotaExceededError');return nativePut.apply(this,args);};});await p.click('#restoreBackup');await ready(p);assert.deepEqual(await storage(p),after);assert.equal(await p.isVisible('#recovery'),true);assert.deepEqual(await save(p,'.take > .row > button:first-child'),audio);await p.evaluate(()=>IDBObjectStore.prototype.put=nativePut);await p.click('#retry');await ready(p);assert.equal((await storage(p)).length,3);
  console.log('PASS archive UI: exact source bytes, composition/sections, staged remapping/reload, SHA-256 after CRC, exact paths, legacy files, cancel, quota rollback and retry');
  // Include the licensed pack and reinstall on a fresh device/cache.
  const pack=JSON.parse(fs.readFileSync(path.join(packDir,'manifest.json')));await p.setInputFiles('#packManifest',path.join(packDir,'manifest.json'));await p.setInputFiles('#packAssets',pack.samples.map(s=>path.join(packDir,s.file)));await p.click('#importPack');await ready(p);
  const packValue=await p.evaluate(()=>'pack:'+ScuLaSongPackCatalog.sha256);await p.locator('.arrangement select').filter({has:p.locator('option[data-pack]')}).first().selectOption(packValue);await ready(p);
  const packed=await save(p,'#exportArchive');await p.click('#removePack');await ready(p);assert.equal(await p.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
  await p.click('#exportArchive');await ready(p);assert.match(await p.textContent('#backupSummary'),/Install the instrument pack/);
  await select(p,packed);assert.equal(await p.isEnabled('#restoreBackup'),true,await p.textContent('#backupSummary'));assert.equal(await p.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
  const beforePackRestore=await storage(p);
  await p.evaluate(()=>{window.nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='packs')throw new DOMException('full','QuotaExceededError');return nativePut.apply(this,args);};});
  await p.click('#restoreBackup');await ready(p);
  assert.deepEqual(await storage(p),beforePackRestore);assert.equal(await p.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);assert.equal(await p.isEnabled('#restoreBackup'),true);assert.match(await p.textContent('#backupSummary'),/storage/i);
  await p.evaluate(()=>IDBObjectStore.prototype.put=nativePut);
  await p.click('#restoreBackup');await ready(p);assert.equal(await p.evaluate(async()=>!!await ScuLaSongPacks.stored()),true);assert.ok((await storage(p)).some(v=>v.arrangements.some(a=>a.parts.lead.samplePack)));
  // Folder snapshots exercise the real shared saver, including permission failure.
  let downloads=0;p.on('download',()=>downloads++);await p.click('#mirrorArchive');await ready(p);assert.match(await p.textContent('#backupSummary'),/Choose a folder/);assert.equal(downloads,0);
  await p.evaluate(()=>{
    window.folderWrites=[];window.folderClosed=0;window.folderAborted=0;window.folderDenied=false;window.folderFail=false;window.folderSlow=false;window.folderOpened=0;window.folderActive=0;window.folderMax=0;window.folderNames=[];
    const existing=new Set();
    function dir(name,base=''){return {name,queryPermission:async()=>folderDenied?'denied':'granted',requestPermission:async()=>folderDenied?'denied':'granted',getDirectoryHandle:async n=>dir(n,base+'/'+n),getFileHandle:async(n,opts)=>{
      if(!opts){if(existing.has(base+'/'+n))return {};throw new DOMException('missing','NotFoundError');}
      existing.add(base+'/'+n);folderNames.push(base+'/'+n);return {createWritable:async()=>{folderOpened++;return {write:async bytes=>{folderMax=Math.max(folderMax,++folderActive);await new Promise(r=>setTimeout(r,folderSlow?50:1));folderActive--;if(folderFail)throw new DOMException('full','QuotaExceededError');folderWrites.push(Array.from(bytes));},close:async()=>folderClosed++,abort:async()=>folderAborted++};}};
    }};}window.showDirectoryPicker=async()=>dir('Root');
  });
  await p.click('#navFolderBtn');await p.waitForFunction(()=>ScuLaFolder.mode()==='folder');
  await p.click('#mirrorArchive');await ready(p);
  const folder=await p.evaluate(async()=>{const bytes=new Blob(folderWrites.map(b=>new Uint8Array(b)));return {valid:(await ScuLaSongArchive.open(bytes)).has('project.json'),closed:folderClosed,max:folderMax,sizes:folderWrites.map(b=>b.length),names:folderNames};});assert.ok(folder.valid);assert.equal(folder.closed,1);assert.equal(folder.max,1);assert.ok(folder.sizes.every(n=>n<=65536));assert.match(folder.names[0],/\/mirrors\/.*-backup.zip$/);
  await p.click('#mirrorArchive');await ready(p);assert.ok(await p.evaluate(()=>folderNames[1].endsWith('-backup-1.zip')));assert.equal(downloads,0);
  await p.evaluate(()=>folderDenied=true);await p.click('#mirrorArchive');await ready(p);assert.match(await p.textContent('#backupSummary'),/Choose a folder/);assert.equal(await p.evaluate(()=>folderClosed),2);assert.equal(downloads,0);
  await p.evaluate(()=>{folderDenied=false;folderFail=true;});await p.click('#mirrorArchive');await ready(p);assert.equal(await p.evaluate(()=>folderAborted),1);assert.equal(await p.evaluate(()=>folderClosed),2);assert.equal(downloads,0);
  await p.evaluate(()=>{folderFail=false;folderSlow=true;});await p.click('#mirrorArchive');await p.waitForFunction(()=>folderOpened===4);await p.click('#cancelBackup');await ready(p);assert.equal(await p.evaluate(()=>folderAborted),2);assert.equal(await p.evaluate(()=>folderClosed),2);assert.equal(downloads,0);
  console.log('PASS folder snapshots: bounded backpressure, new filenames, denied permission, quota failure and streaming cancellation without download fallback');
  assert.deepEqual(errors,[]);await context.close();
  const phone=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),q=await phone.newPage();await q.addInitScript(()=>{localStorage.setItem('scula:ui-lang','en');indexedDB.open=()=>{throw Error('unavailable');};});await q.goto('file://'+path.join(root,'song.html'));await ready(q);
  await select(q,zip);assert.equal(await q.isEnabled('#restoreBackup'),true);await q.click('#navLangBtn');assert.match(await q.textContent('#backupSummary'),/Copie verificată/);assert.match(await q.textContent('#exportArchive'),/Salvează/);assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await q.click('#navLangBtn');await q.click('#restoreBackup');await ready(q);assert.equal(await q.isVisible('#recovery'),true);assert.deepEqual(await save(q,'.take > .row > button:first-child'),audio);assert.ok((await save(q,'#exportArchive')).length>audio.length);await phone.close();
  console.log('PASS archive packs: offline licensed assets and installation only on restore; RO/EN phone layout and ZIP/source export without IndexedDB');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
