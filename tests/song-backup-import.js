// Backups through shipped controls: staging, immutable content, persistence and recovery.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),{createHash}=require('crypto');
const root=path.resolve(__dirname,'..');
function wav(bits=24,encoding=1){
 const sr=22050,frames=sr*2+1,align=bits/8,data=frames*align,b=Buffer.alloc(54+data+data%2);
 b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(encoding,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*align,28);b.writeUInt16LE(align,32);b.writeUInt16LE(bits,34);
 b.write('JUNK',36);b.writeUInt32LE(1,40);b[44]=93;b[45]=71;b.write('data',46);b.writeUInt32LE(data,50);
 for(let i=0;i<frames;i++){const t=i/sr,local=t%.5,v=local<.4?.3*Math.sin(2*Math.PI*(t<1?261.6256:329.6276)*t)*Math.min(1,local/.02,(.4-local)/.02):0;if(encoding===3)b.writeFloatLE(v,54+i*align);else b.writeIntLE(Math.round(v*(2**(bits-1)-1)),54+i*align,align);}if(data%2)b[b.length-1]=82;return b;
}
async function ready(p){await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');}
async function stored(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('scula-song',1);r.onsuccess=()=>{const db=r.result,tx=db.transaction(['projects','audio']),a=tx.objectStore('projects').getAll(),b=tx.objectStore('audio').getAllKeys();tx.oncomplete=()=>{db.close();resolve({projects:a.result,audio:b.result});};tx.onerror=reject;};r.onerror=reject;}));}
async function download(p,action){const wait=p.waitForEvent('download');await action();const d=await wait;return {name:d.suggestedFilename(),bytes:fs.readFileSync(await d.path())};}
const jsonFile=v=>({name:'project.json',mimeType:'application/json',buffer:Buffer.from(typeof v==='string'?v:JSON.stringify(v))});
const audioFile=(name,buffer)=>({name,mimeType:'audio/wav',buffer});
async function select(p,v,files){await p.setInputFiles('#backupJson',jsonFile(v));await p.setInputFiles('#backupWavs',files);}
async function validate(p){await p.click('#validateBackup');await ready(p);}
async function restore(p){assert.equal(await p.isEnabled('#restoreBackup'),true,await p.textContent('#backupSummary'));await p.click('#restoreBackup');await ready(p);}
async function manifest(p){return JSON.parse((await download(p,()=>p.click('#exportProject'))).bytes);}
function musical(p){return {recordings:p.recordings.map(r=>({...r,id:null,source:{...r.source,assetId:null,filename:null,relativePath:null},performance:r.performance?{...r.performance,id:null,sourceAssetId:null}:r.performance})),arrangements:(p.arrangements||[]).map(a=>({...a,id:null,sourceRecordingId:null,sourceAssetId:null,sourcePerformanceId:null}))};}
function references(p){const ids=new Set();for(const r of p.recordings){assert.ok(!ids.has(r.id));ids.add(r.id);assert.equal(r.source.assetId,r.id);if(r.performance)assert.equal(r.performance.sourceAssetId,r.id);}for(const a of p.arrangements||[]){const r=p.recordings.find(r=>r.id===a.sourceRecordingId);assert.ok(r);assert.equal(a.sourceAssetId,r.source.assetId);assert.ok(a.sourcePerformanceId);}}
async function begin(browser,{failStorage=false,phone=false}={}){
 const ctx=await browser.newContext({acceptDownloads:true,viewport:phone?{width:390,height:844}:{width:1100,height:1000},isMobile:phone,hasTouch:phone}),p=await ctx.newPage();
 await p.addInitScript(({failStorage})=>{
  localStorage.setItem('scula:ui-lang','en');window.audioSeen=[];window.urlsMade=[];window.urlsRevoked=[];
  const AC=AudioContext;window.AudioContext=class extends AC{constructor(...a){super(...a);audioSeen.push(this);}createBufferSource(){const n=super.createBufferSource(),s=n.stop.bind(n),d=n.disconnect.bind(n);n.stopped=false;n.disconnected=false;n.stop=(...a)=>{n.stopped=true;return s(...a);};n.disconnect=(...a)=>{n.disconnected=true;return d(...a);};(this.nodes||(this.nodes=[])).push(n);return n;}};
  const create=URL.createObjectURL,revoke=URL.revokeObjectURL;URL.createObjectURL=b=>{const u=create(b);urlsMade.push(u);return u;};URL.revokeObjectURL=u=>{urlsRevoked.push(u);return revoke(u);};
  if(failStorage){indexedDB.open=()=>{throw new DOMException('unavailable','SecurityError');};Object.defineProperty(window,'crypto',{value:undefined});}
 },{failStorage});
 const errors=[];p.on('pageerror',e=>errors.push(e.message));await p.goto('file://'+path.join(root,'song.html'));await ready(p);return {ctx,p,errors};
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const {ctx,p,errors}=await begin(browser),master=wav(),sampleWav=wav(32,3);
  await p.setInputFiles('#importWav',audioFile('hum.wav',master));await ready(p);await p.waitForSelector('.take');await p.getByRole('button',{name:'Extract melody',exact:true}).click();await ready(p);
  const edit=p.locator('.note-table tbody tr:first-child input[data-field="midi"]');await edit.fill('74');await edit.press('Tab');await ready(p);await p.getByLabel('Timing used',{exact:true}).selectOption('quantized');await ready(p);
  await p.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(p);
  await edit.fill('72');await edit.press('Tab');await ready(p);await p.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(p);
  // Reanalysis leaves both older snapshots referencing the old performance ID.
  p.once('dialog',d=>d.accept());await p.getByRole('button',{name:'Analyze again',exact:true}).click();await ready(p);
  await edit.fill('70');await edit.press('Tab');await ready(p);
  await p.setInputFiles('#importWav',audioFile('sample.wav',sampleWav));await ready(p);await p.waitForFunction(()=>document.querySelectorAll('.take').length===2);
  const exported=await manifest(p),files=[];
  for(let i=0;i<2;i++){const saved=await download(p,()=>p.locator('.take').nth(i).getByRole('button',{name:'Save WAV',exact:true}).click());assert.equal(saved.name,exported.recordings[i].source.filename);assert.deepEqual(saved.bytes,i?sampleWav:master);assert.deepEqual(exported.recordings[i].source.integrity,{algorithm:'SHA-256',digest:createHash('sha256').update(saved.bytes).digest('hex')});files.push(audioFile(saved.name,saved.bytes));}
  const original=await stored(p);await select(p,exported,files);await validate(p);assert.deepEqual(await stored(p),original);assert.equal(await p.isEnabled('#restoreBackup'),true);await restore(p);
  let imported=await manifest(p);assert.notEqual(imported.id,exported.id);assert.deepEqual(musical(imported),musical(exported));references(imported);
  assert.equal(imported.arrangements[0].sourcePerformanceId,imported.arrangements[1].sourcePerformanceId);assert.notEqual(imported.arrangements[0].sourcePerformanceId,imported.recordings[0].performance.id);
  assert.ok((await download(p,()=>p.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true}).click())).bytes.equals(master));
  await p.reload();await ready(p);assert.deepEqual(musical(await manifest(p)),musical(exported));assert.ok((await download(p,()=>p.locator('.take').nth(1).getByRole('button',{name:'Save WAV',exact:true}).click())).bytes.equals(sampleWav));
  await select(p,exported,files);await validate(p);await restore(p);const twice=await manifest(p),all=await stored(p);references(twice);assert.equal(all.projects.length,3);assert.equal(all.audio.length,6);assert.deepEqual(all.projects.find(x=>x.id===exported.id),original.projects.find(x=>x.id===exported.id));assert.notEqual(twice.recordings[0].id,imported.recordings[0].id);
  console.log('PASS  real export/import/reload/twice: PCM24 and float32 bytes with extra chunks/padding, analysis, edited notes, quantization, versions and historic snapshots preserved; existing projects/audio unchanged');
  // Phase 1/2 compatibility and sample metadata; references can be path-only.
  const old=structuredClone(exported);delete old.arrangements;old.recordings.forEach(r=>delete r.source.integrity);delete old.recordings[0].performance;delete old.recordings[1].performance;old.recordings[1].purpose='sample';old.recordings[1].sample={instrument:'Vioară',note:'La4',midiNote:69,articulation:'pizzicato',dynamic:'pp',notes:'Mostră proprie'};delete old.recordings[1].source.filename;delete old.recordings[0].source.encoding;
  await select(p,old,files);await validate(p);assert.match(await p.textContent('#backupSummary'),/cannot be verified cryptographically/);for(const file of files)assert.ok((await p.textContent('#backupSummary')).includes(file.name));await restore(p);const legacy=await manifest(p);assert.deepEqual(legacy.recordings[1].sample,old.recordings[1].sample);assert.equal(legacy.recordings[1].purpose,'sample');assert.equal(legacy.arrangements,undefined);await p.reload();await ready(p);assert.deepEqual((await manifest(p)).recordings[1].sample,old.recordings[1].sample);
  console.log('PASS  older project without performances/arrangements, sample metadata, path-only references and reload');
  const phase2=structuredClone(exported);delete phase2.arrangements;await select(p,phase2,files);await validate(p);await restore(p);assert.deepEqual(musical(await manifest(p)),musical(phase2));
  const empty={...old,recordings:[]};await select(p,empty,[]);await validate(p);await restore(p);assert.equal(await p.locator('.take').count(),0);
  // Force the allocator to encounter both existing IDs and an orphan audio key.
  await select(p,exported,files);const collision=await p.evaluate(async v=>{const candidates=[v.id,v.recordings[0].id,'orphanAudio'];let n=0;const result=await ScuLaSongBackup.stage(JSON.stringify(v),document.querySelector('#backupWavs').files,{used:ScuLaSongBackup.occupied([v],['orphanAudio']),newId:()=>candidates.length?candidates.shift():'allocated'+(++n)});return {project:result.project,audio:Array.from(result.audio.keys())};},exported);
  references(collision.project);assert.ok(collision.project.id.startsWith('allocated'));assert.deepEqual(collision.audio,collision.project.recordings.map(r=>r.id));assert.ok(collision.project.recordings.every(r=>r.id.startsWith('allocated')));
  console.log('PASS  Phase 2-only and empty backups; allocator skips existing entity IDs and orphan audio keys and remaps all references');
  await p.selectOption('#projects',legacy.id);await ready(p);
  const baseline=await stored(p),active=await p.locator('#projects').inputValue();
  async function reject(v,f=files,pattern=/Inconsistent|Unsupported|Invalid|Missing|Ambiguous/){await select(p,v,f);await validate(p);assert.equal(await p.isEnabled('#restoreBackup'),false);assert.match(await p.textContent('#backupSummary'),pattern);assert.deepEqual(await stored(p),baseline);assert.equal(await p.locator('#projects').inputValue(),active);}
  await reject('{oops',files,/Invalid JSON/);await reject(null);await reject({...exported,schemaVersion:2},files,/Unsupported version/);
  for(const change of [v=>v.recordings[0].performance.analyzerVersion=2,v=>v.arrangements[0].generatorVersion=2,v=>v.recordings[0].id=v.recordings[1].id,v=>v.recordings[0].performance.sourceAssetId='missing',v=>v.recordings[0].performance.notes[0].sourceNoteId='missing',v=>v.arrangements[0].sourceRecordingId='missing',v=>v.arrangements[0].sourceAssetId='missing',v=>v.arrangements[0].sourcePerformanceId=v.recordings[1].id,v=>v.arrangements[1].version=1,v=>v.arrangements[0].performanceSnapshot.notes[0].offset=-1,v=>v.arrangements[0].parts.lead.notes[0].midi=128,v=>v.recordings[0].source.relativePath='../'+v.recordings[0].source.filename,v=>v.recordings[0].source.filename='other.wav',v=>v.recordings[0].source.size++,v=>v.recordings[0].sample={midiNote:128},v=>v.recordings[0].performance.analysis.rawPitchFrames[0].rms=null]){const bad=structuredClone(exported);change(bad);await reject(bad);}
  // Integrity is checked on complete file bytes, including JUNK/padding and payload.
  for(const i of [0,1])for(const at of [44,45,54,files[i].buffer.length-1]){
    const tampered=files.map(f=>({...f,buffer:Buffer.from(f.buffer)}));tampered[i].buffer[at]^=1;
    await reject(exported,tampered,/SHA-256 integrity mismatch/);assert.ok((await p.textContent('#backupSummary')).includes(files[i].name));
  }
  for(const integrity of [null,[],{},'abc',{algorithm:'SHA-256',digest:'a'.repeat(63)},{algorithm:'SHA-256',digest:'a'.repeat(64)+'\n'},{algorithm:'SHA-256',digest:'g'.repeat(64)},{algorithm:'SHA-256',digest:32},{algorithm:'MD5',digest:'a'.repeat(64)},{algorithm:'SHA-256',digest:'a'.repeat(64),version:2}]){
    const bad=structuredClone(exported);bad.recordings[0].source.integrity=integrity;await reject(bad,files,/Invalid SHA-256 digest|Unsupported integrity format/);
  }
  const mixed=structuredClone(exported);delete mixed.recordings[1].source.integrity;
  await select(p,mixed,files);await validate(p);assert.match(await p.textContent('#backupSummary'),/cannot be verified cryptographically/);assert.ok((await p.textContent('#backupSummary')).endsWith(files[1].name));await p.click('#cancelBackup');
  const upper=structuredClone(exported);upper.recordings.forEach(r=>r.source.integrity.digest=r.source.integrity.digest.toUpperCase());await select(p,upper,files);await validate(p);assert.match(await p.textContent('#backupSummary'),/verified with SHA-256/);await p.click('#cancelBackup');
  // Pause sliced reads only: the WAV inspector has completed when cancellation occurs.
  await p.evaluate(()=>{window.hashBuffer=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){if(this.size===65536){window.hashReading=true;await new Promise(r=>setTimeout(r,150));}return hashBuffer.call(this);};});
  await select(p,exported,files);await p.click('#validateBackup');await p.waitForFunction(()=>window.hashReading);assert.match(await p.textContent('#backupSummary'),/SHA-256/);assert.equal(await p.isEnabled('#newProject'),false);await p.click('#cancelBackup');await ready(p);assert.match(await p.textContent('#backupSummary'),/cancelled/);assert.deepEqual(await stored(p),baseline);assert.equal(await p.isEnabled('#restoreBackup'),false);
  await p.evaluate(()=>Blob.prototype.arrayBuffer=hashBuffer);
  // Cancel export during hashing: no partial manifest reaches any save route.
  await p.evaluate(()=>{window.nativeSave=ScuLaFolder.save;window.cancelledSaves=0;ScuLaFolder.save=async()=>{cancelledSaves++;return {};};window.hashReading=false;Blob.prototype.arrayBuffer=async function(){if(this.size===65536){window.hashReading=true;await new Promise(r=>setTimeout(r,150));}return hashBuffer.call(this);};});
  await p.click('#exportProject');await p.waitForFunction(()=>window.hashReading);assert.equal(await p.isEnabled('#cancelBackup'),true);await p.click('#cancelBackup');await ready(p);assert.match(await p.textContent('#backupSummary'),/Export was not saved/);assert.equal(await p.evaluate(()=>cancelledSaves),0);assert.deepEqual(await stored(p),baseline);await p.evaluate(()=>{Blob.prototype.arrayBuffer=hashBuffer;ScuLaFolder.save=nativeSave;});
  console.log('PASS  exact-byte SHA-256 export, unchanged-size/header tampering in both recordings, malformed/unsupported digests, legacy/mixed warnings, uppercase hex, import/export hash cancellation without publication/storage/saves');
  await reject(exported,files.slice(1),/Missing WAVs/);await reject(exported,[files[0],files[0],files[1]],/Ambiguous WAV names/);
  const wrong={...files[0],buffer:Buffer.from('not a WAV')};await reject(exported,[wrong,files[1]],/Invalid or unsupported WAV/);
  const unsupported=Buffer.from(master);unsupported.writeUInt16LE(6,20);await reject(exported,[{...files[0],buffer:unsupported},files[1]],/Invalid or unsupported WAV/);
  const duplicated=Buffer.concat([master.subarray(0,36),master.subarray(12,36),master.subarray(36)]);duplicated.writeUInt32LE(duplicated.length-8,4);await reject(exported,[{...files[0],buffer:duplicated},files[1]],/Invalid or unsupported WAV/);
  const renamed={...files[0],name:'renamed.wav'};await reject(exported,[renamed,files[1]],/Missing WAVs/);
  await select(p,exported,files);await p.evaluate(()=>{window.nativeText=Blob.prototype.text;Blob.prototype.text=()=>Promise.reject(new DOMException('read failed','NotReadableError'));});await validate(p);assert.match(await p.textContent('#backupSummary'),/Cannot read the files/);assert.deepEqual(await stored(p),baseline);await p.evaluate(()=>Blob.prototype.text=nativeText);
  await select(p,exported,files);await validate(p);await p.click('#cancelBackup');assert.equal(await p.isEnabled('#restoreBackup'),false);assert.deepEqual(await stored(p),baseline);
  // Cancel while an asynchronous file read is still pending.
  await p.evaluate(()=>{window.originalArrayBuffer=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){await new Promise(r=>setTimeout(r,400));return originalArrayBuffer.call(this);};});
  await select(p,exported,files);await p.click('#validateBackup');await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Validating backup…');assert.equal(await p.isEnabled('#newProject'),false);await p.click('#cancelBackup');await ready(p);assert.match(await p.textContent('#backupSummary'),/cancelled/);assert.equal(await p.isEnabled('#restoreBackup'),false);assert.deepEqual(await stored(p),baseline);await p.evaluate(()=>Blob.prototype.arrayBuffer=originalArrayBuffer);
  // Page exit cancels the read without recreating audio URLs when it resolves.
  await p.evaluate(()=>{Blob.prototype.arrayBuffer=async function(){await new Promise(r=>setTimeout(r,400));return originalArrayBuffer.call(this);};});await select(p,exported,files);await p.click('#validateBackup');await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Validating backup…');await p.evaluate(()=>{window.urlsAtExit=urlsMade.length;window.dispatchEvent(new PageTransitionEvent('pagehide'));});await ready(p);assert.equal(await p.isEnabled('#restoreBackup'),false);assert.ok(await p.evaluate(()=>urlsMade.length===urlsAtExit));assert.deepEqual(await stored(p),baseline);await p.evaluate(()=>Blob.prototype.arrayBuffer=originalArrayBuffer);
  console.log('PASS  malformed JSON, schema/helper versions, duplicate IDs/versions, relationships, sample/snapshot/analysis structure, missing/ambiguous/renamed files, bad/unsupported WAVs and staged/in-flight cancellation leave workspace/storage unchanged');
  // Quota failure aborts both stores; memory retains all imported files for export/retry.
  await p.evaluate(()=>{window.nativePut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...a){if(this.name==='audio')throw new DOMException('quota','QuotaExceededError');return nativePut.apply(this,a);};});
  await select(p,exported,files);await validate(p);await restore(p);assert.deepEqual(await stored(p),baseline);assert.equal(await p.isVisible('#recovery'),true);const recovery=await manifest(p);assert.deepEqual(musical(recovery),musical(exported));for(let i=0;i<2;i++)assert.deepEqual((await download(p,()=>p.locator('.take').nth(i).getByRole('button',{name:'Save WAV',exact:true}).click())).bytes,files[i].buffer);
  await p.evaluate(()=>IDBObjectStore.prototype.put=nativePut);await p.click('#retry');await ready(p);assert.equal(await p.isVisible('#recovery'),false);assert.equal((await stored(p)).projects.length,baseline.projects.length+1);await p.reload();await ready(p);assert.deepEqual(musical(await manifest(p)),musical(exported));
  console.log('PASS  atomic audio-store failure retains complete imported project/WAVs for export; persistent warning, successful retry and reload');
  // Playback and object URLs from the old workspace are released at staging/publication.
  await p.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(p);await p.waitForFunction(()=>audioSeen.some(c=>c.nodes?.length&&c.state==='running'));
  const beforeUrls=await p.locator('.take audio').evaluateAll(list=>list.map(a=>a.src));await select(p,exported,files);await validate(p);await p.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));assert.ok(await p.evaluate(()=>audioSeen.flatMap(c=>c.nodes||[]).every(n=>n.stopped&&n.disconnected)));assert.ok(await p.evaluate(list=>list.every(u=>urlsRevoked.includes(u)),beforeUrls));
  await restore(p);const audio=p.locator('.take audio').first();await audio.evaluate(a=>a.play());await select(p,exported,files);await validate(p);assert.ok(await p.locator('.take audio').evaluateAll(list=>list.every(a=>a.paused)));await p.click('#cancelBackup');
  await p.getByRole('button',{name:'Play melody',exact:true}).click();await ready(p);await select(p,exported,files);await validate(p);await p.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));await p.click('#cancelBackup');
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS  import closes melody/arrangement contexts, stops/disconnects nodes, pauses source playback and revokes prior object URLs');
  const phone=await begin(browser,{failStorage:true,phone:true}),q=phone.p;assert.equal(await q.isVisible('#recovery'),true);await select(q,exported,files);await validate(q);assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await q.getByRole('button',{name:'Import separate project',exact:true}).count(),1);
  await q.click('#navLangBtn');await q.waitForFunction(()=>document.documentElement.lang==='ro');assert.equal(await q.getByRole('button',{name:'Importă proiect separat',exact:true}).count(),1);assert.match(await q.textContent('#backupSummary'),/Copie verificată/);await q.click('#navLangBtn');await ready(q);
  // Phone progress remains visible and re-translates; cancellation stops sliced hashing.
  await q.evaluate(()=>{window.phoneBuffer=Blob.prototype.arrayBuffer;Blob.prototype.arrayBuffer=async function(){if(this.size===65536){window.phoneHashReading=true;await new Promise(r=>setTimeout(r,200));}return phoneBuffer.call(this);};});
  await q.click('#validateBackup');await q.waitForFunction(()=>window.phoneHashReading);assert.match(await q.textContent('#backupSummary'),/SHA-256/);assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await q.click('#navLangBtn');assert.match(await q.textContent('#recordState'),/Se verifică copia/);await q.click('#cancelBackup');await q.waitForFunction(()=>document.querySelector('#recordState').textContent==='Pregătit');assert.match(await q.textContent('#backupSummary'),/Import anulat/);assert.equal(await q.locator('.take').count(),0);await q.evaluate(()=>Blob.prototype.arrayBuffer=phoneBuffer);await q.click('#navLangBtn');
  const changed=files.map(f=>({...f,buffer:Buffer.from(f.buffer)}));changed[1].buffer[54]^=1;await select(q,exported,changed);await validate(q);assert.match(await q.textContent('#backupSummary'),/SHA-256 integrity mismatch/);await q.click('#navLangBtn');assert.match(await q.textContent('#backupSummary'),/Integritatea SHA-256 nu corespunde/);assert.ok((await q.textContent('#backupSummary')).includes(files[1].name));assert.ok(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await q.click('#navLangBtn');await select(q,old,files);await validate(q);await q.click('#navLangBtn');assert.match(await q.textContent('#backupSummary'),/nu poate fi verificată criptografic/);await q.click('#navLangBtn');
  await select(q,exported,files);await validate(q);await restore(q);assert.equal(await q.isVisible('#recovery'),true);assert.deepEqual(musical(await manifest(q)),musical(exported));assert.deepEqual((await download(q,()=>q.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true}).click())).bytes,master);
  // All export routes keep using the shared saver, even with storage unavailable.
  await q.evaluate(()=>{window.saves=[];ScuLaFolder.save=async(name,blob,options)=>{saves.push({name,size:blob.size,options});return {message:'saved'};};});await q.click('#exportProject');await ready(q);await q.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true}).click();await ready(q);assert.ok(await q.evaluate(()=>saves.length===2&&saves.every(s=>s.options.directories.length)));
  assert.deepEqual(phone.errors,[]);await phone.ctx.close();console.log('PASS  RO/EN controls/preview, touch phone progress/cancellation, file:// without Web Crypto or IndexedDB, in-memory JSON/WAV exports through ScuLaFolder.save');
  console.log('all song backup import checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
