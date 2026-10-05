// Actual curated PCM, manifest integrity, atomic offline installation and UI.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),crypto=require('crypto');
const {chromium}=require('playwright'),{parseMidi}=require('./song-arrangement-generation');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'assets/song-packs/salamander-compact-v1');
const manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
const digest=b=>crypto.createHash('sha256').update(b).digest('hex');
for(const s of manifest.samples){const b=fs.readFileSync(path.join(dir,s.file));assert.equal(b.length,s.bytes);assert.equal(digest(b),s.sha256);}
assert.equal(manifest.license.text,fs.readFileSync(path.join(dir,'LICENSE.txt'),'utf8'));
const files=manifest.samples.map(s=>path.join(dir,s.file));
const ready=p=>p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
 const context=await browser.newContext({acceptDownloads:true,viewport:{width:390,height:844}}),page=await context.newPage(),errors=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 await page.addInitScript(()=>{localStorage.setItem('scula:ui-lang','en');const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.played=this.buffer;return start.apply(this,args);};});
 await page.goto('file://'+path.join(root,'song.html'));await ready(page);
 assert.ok(!requests.some(u=>u.endsWith('.wav')),'no automatic sample download');
 assert.equal(await page.evaluate(()=>ScuLaSongPackCatalog.sha256),digest(JSON.stringify(manifest)));
 await page.setInputFiles('#packManifest',path.join(dir,'manifest.json'));await page.setInputFiles('#packAssets',files);
 // Hash failure must not publish any partial assets.
 const bad=fs.readFileSync(files[0]);bad[200]^=1;
 await page.setInputFiles('#packAssets',[{name:manifest.samples[0].file,mimeType:'audio/wav',buffer:bad},...files.slice(1).map(f=>({name:path.basename(f),mimeType:'audio/wav',buffer:fs.readFileSync(f)}))]);
 await page.click('#importPack');await ready(page);assert.match(await page.textContent('#packStatus'),/validation failed/);assert.equal(await page.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
 await page.setInputFiles('#packAssets',files);await page.click('#importPack');await ready(page);assert.match(await page.textContent('#packStatus'),/installed for offline/);
 const checks=await page.evaluate(async()=>{
  const Packs=ScuLaSongPacks,A=ScuLaArrangement,R=ScuLaSongRenderer,C=ScuLaSongPackCatalog;
  const stored=await Packs.stored(),samples=await Packs.decode(Packs.reference()),bytes=samples.reduce((v,s)=>v+s.channels[0].byteLength,0);
  const controller=new AbortController();let cancelled=false;
  try{await Packs.verify(stored.manifest,stored.assets,{signal:controller.signal,progress:()=>controller.abort()});}catch(e){cancelled=e.message==='cancelled';}
  const a={id:'test',rendererVersion:2,tempoBpm:120,timingMode:'original',key:{tonic:0,mode:'major'},duration:2,parts:{lead:{instrument:'piano',samplePack:Packs.reference(),performanceVersion:1,pianoPedal:'off',enabled:true,volume:1,notes:[{start:0,dur:.25,midi:60,cents:39,vel:.8}]},chords:{instrument:'strings',enabled:false,volume:0,notes:[]},bass:{instrument:'bass',enabled:false,volume:0,notes:[]},drums:{instrument:'standard',enabled:false,volume:0,notes:[]}}};
  const before=JSON.stringify(a),opts={sampleRate:22050,yieldUI:()=>Promise.resolve(),samples:{[Symbol.for('ScuLaSongPacks')]:{['pack:'+C.sha256]:samples},['pack:'+C.sha256]:[]}};
  const one=await R.arrangement(a,opts).collect(),two=await R.arrangement(a,{...opts,blockFrames:512}).collect();
  const equal=one.L.every((v,i)=>v===two.L[i]);
  const sourceSame=before===JSON.stringify(a),pitch=A.performanceNotes(a.parts.lead,a)[0].cents;
  const energy=(x,from,to)=>x.slice(from*22050,to*22050).reduce((v,s)=>v+s*s,0);
  a.parts.lead.pianoPedal='bar';const pedal=await R.arrangement(a,opts).collect();
  const pedalDuration=A.performanceNotes(a.parts.lead,a)[0].dur;
  const midi=Array.from(new Uint8Array(await A.midi(a).arrayBuffer()));
  const song={arrangements:[a],timeline:[{id:'section',name:'Piano',arrangementId:a.id,repeats:2}]};
  const loopMidi=Array.from(new Uint8Array(await ScuLaSongTimeline.midi(song,{start:.5,end:2.5}).arrayBuffer()));
  const songMidi=Array.from(new Uint8Array(await ScuLaSongTimeline.midi(song).arrayBuffer()));
  let fallbacks=0;const synth=await R.arrangement(a,{sampleRate:22050,yieldUI:()=>Promise.resolve(),fallback:()=>fallbacks++}).collect();
  const different=pedal.L.some((v,i)=>Math.abs(v-synth.L[i])>.001);
  a.parts.lead.notes[0].midi=90;const unmapped=await R.arrangement(a,{...opts,fallback:()=>fallbacks++}).collect();
  return {midi,loopMidi,songMidi,bytes,cancelled,equal,sourceSame,pitch,pedalDuration,offEnergy:energy(one.L,.6,1),pedalEnergy:energy(pedal.L,.6,1),different,fallbacks,finite:unmapped.L.every(Number.isFinite),storedHash:stored.sha256,low:A.mapSample(samples,44,80)===null,high:A.mapSample(samples,88,80)===null};
 });
 assert.equal(parseMidi(Buffer.from(checks.midi))[1].off[0].tick,1920);
 assert.deepEqual(parseMidi(Buffer.from(checks.songMidi))[1].off.map(n=>n.tick),[1920,3840]);
 assert.deepEqual(parseMidi(Buffer.from(checks.loopMidi))[1].off.map(n=>n.tick),[1440,1920]);
 assert.equal(checks.bytes,7*6*22050*4);assert.ok(checks.cancelled&&checks.equal&&checks.sourceSame&&checks.different&&checks.finite&&checks.low&&checks.high,JSON.stringify(checks));assert.equal(checks.pitch,0);assert.equal(checks.pedalDuration,2);assert.ok(checks.pedalEnergy>checks.offEnergy*5);assert.ok(checks.fallbacks>0);
 await page.click('#auditionPack');await page.waitForFunction(()=>window.played);assert.match(await page.textContent('#status'),/Playing arrangement/);await page.click('#stopPackAudition');
 await page.reload();await ready(page);await page.waitForFunction(()=>document.querySelector('#packStatus').textContent.includes('installed for offline'));
 await page.click('#auditionPack');await page.waitForFunction(()=>window.played);await page.click('#stopPackAudition');
 // Import a real WAV as a source; arrange it, persist a pinned pack reference.
 const source=fs.readFileSync(files[2]);await page.setInputFiles('#importWav',{name:'piano-source.wav',mimeType:'audio/wav',buffer:source});await ready(page);
 await page.getByRole('button',{name:'Extract melody',exact:true}).click();await ready(page);
 await page.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(page);
 await page.getByLabel('Lead Sample set',{exact:true}).selectOption('pack:'+checks.storedHash);await ready(page);
 await page.getByLabel('Lead Piano pedal',{exact:true}).selectOption('bar');await ready(page);
 const download=async button=>{const event=page.waitForEvent('download');await button.click();return fs.readFileSync(await (await event).path());};
 const backup=JSON.parse(await download(page.locator('#exportProject')));await ready(page);
 assert.equal(backup.instrumentPacks[0].license.text,manifest.license.text);assert.equal(backup.arrangements[0].parts.lead.samplePack.sha256,checks.storedHash);assert.equal(backup.arrangements[0].rendererVersion,2);assert.equal(backup.arrangements[0].parts.lead.pianoPedal,'bar');
 assert.deepEqual(await download(page.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true})),source);await ready(page);
 await page.evaluate(()=>{window.packSaves=[];window.realFolderSave=ScuLaFolder.save;ScuLaFolder.save=async(name,blob,options)=>{packSaves.push({name,size:blob.size,digest:await ScuLaIntegrity.sha256(blob),options});return {saved:true};};});
 await page.click('#exportPack');await ready(page);const transferred=await page.evaluate(()=>{ScuLaFolder.save=window.realFolderSave;return packSaves;});
 assert.equal(transferred.length,9);for(const sample of manifest.samples)assert.equal(transferred.find(f=>f.name===sample.file).digest,sample.sha256);assert.ok(transferred.every(f=>f.options.directories[0]==='song-packs'));
 await page.click('#removePack');await page.waitForFunction(()=>document.querySelector('#packStatus').textContent.includes('not installed'));
 await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#packFallback').textContent.includes('use synthesis'));await page.getByRole('button',{name:'Stop arrangement',exact:true}).first().click();
 // Backup validation accepts pack references without installing assets.
 await page.setInputFiles('#backupJson',{name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});
 await page.setInputFiles('#backupWavs',{name:backup.recordings[0].source.filename,mimeType:'audio/wav',buffer:source});await page.click('#validateBackup');await ready(page);assert.equal(await page.locator('#restoreBackup').isEnabled(),true,await page.textContent('#backupSummary'));
 await page.click('#restoreBackup');await ready(page);await page.reload();await ready(page);assert.equal(await page.getByLabel('Lead Piano pedal',{exact:true}).inputValue(),'bar');
 await page.evaluate(()=>window.dispatchEvent(new CustomEvent('scula-ui-lang',{detail:'ro'})));assert.match(await page.textContent('#packHeading'),/Pian opțional/);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'phone width');
 assert.deepEqual(errors,[]);
 console.log('PASS pack hashes/license, no auto download, corrupt rejection, cancellation, atomic offline import/reload, deterministic blocks, piano decay/pedal/pitch, fallback, immutable source, backup restore and RO/EN phone UI');
 // Browser fetch path, response-size cap, cancellation and failed atomic commit.
 const net=await browser.newContext(),web=await net.newPage();let mode='oversized',wavRequests=0;
 await web.addInitScript(()=>localStorage.setItem('scula:ui-lang','en'));
 await web.route('http://song.test/**',async route=>{
  const relative=new URL(route.request().url()).pathname.slice(1)||'song.html';
  const asset=relative.endsWith('.wav');if(asset)wavRequests++;
  if(asset&&mode==='slow')await new Promise(r=>setTimeout(r,300));
  const body=fs.readFileSync(path.join(root,relative));
  await route.fulfill({status:200,headers:{'Content-Type':relative.endsWith('.html')?'text/html':relative.endsWith('.js')?'application/javascript':'audio/wav','Content-Length':String(asset&&mode==='oversized'?body.length+1:body.length)},body}).catch(()=>{});
 });
 await web.goto('http://song.test/song.html');await ready(web);assert.equal(wavRequests,0);
 await web.click('#downloadPack');await ready(web);assert.match(await web.textContent('#packStatus'),/validation failed/);assert.equal(await web.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
 mode='slow';await web.click('#downloadPack');await web.click('#cancelPack');await ready(web);assert.match(await web.textContent('#packStatus'),/cancelled/);assert.equal(await web.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
 mode='ok';await web.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='packs')throw new DOMException('full','QuotaExceededError');return window.originalPut.apply(this,args);};});
 await web.click('#downloadPack');await ready(web);assert.match(await web.textContent('#packStatus'),/storage failed/);assert.equal(await web.evaluate(async()=>!!await ScuLaSongPacks.stored()),false);
 await web.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});await web.click('#downloadPack');await ready(web);assert.match(await web.textContent('#packStatus'),/installed for offline/);
 const beforeRequests=wavRequests;await web.reload();await ready(web);await web.click('#auditionPack');await web.waitForFunction(()=>document.querySelector('#status').textContent.includes('Playing arrangement'));assert.equal(wavRequests,beforeRequests,'installed playback is offline');
 await web.click('#stopPackAudition');
 assert.equal(await web.evaluate(async()=>{try{await ScuLaSongPacks.decode(ScuLaSongPacks.reference(),{remainingBytes:1024});return false;}catch(e){return e.message==='sampleBudget';}}),true,'reject decoded budget before allocating');
 await net.close();console.log('PASS bounded download, cancel, quota rollback/retry, offline playback and decoded allocation preflight');

 await context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
