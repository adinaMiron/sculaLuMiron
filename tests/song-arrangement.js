// Phase 3 through Song's shipped file:// controls and actual Web Audio nodes.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),{parseMidi}=require('./song-arrangement-generation');
const root=path.resolve(__dirname,'..');
function masterWav(){const sr=22050,frames=sr*3,b=Buffer.alloc(54+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('JUNK',36);b.writeUInt32LE(1,40);b[44]=97;b.write('data',46);b.writeUInt32LE(frames*2,50);for(let i=0;i<frames;i++){const t=i/sr-.1,index=Math.floor(t/.5),local=t-index*.5;if(index<0||index>=4||local>.4)continue;const f=440*2**(([60,64,67,72][index]-69)/12),env=Math.min(1,local/.02,(.4-local)/.04);b.writeInt16LE(Math.round(.3*env*Math.sin(2*Math.PI*f*local)*32767),54+i*2);}return b;}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');}
async function stored(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const request=indexedDB.open('scula-song');request.onsuccess=()=>{const db=request.result,r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>{db.close();resolve(r.result[0]);};r.onerror=reject;};request.onerror=reject;}));}
async function download(page,action){const pending=page.waitForEvent('download');await action();const d=await pending;return {bytes:fs.readFileSync(await d.path()),name:d.suggestedFilename()};}
async function change(page,label,value){const el=page.getByLabel(label,{exact:true});if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption(String(value));else{await el.fill(String(value));await el.press('Tab');}await ready(page);}
async function begin(page,{failStorage=false}={}){
 await page.addInitScript(({failStorage})=>{
  localStorage.setItem('scula:ui-lang','en');window.audioSeen=[];
  const Native=window.AudioContext;
  window.AudioContext=class extends Native{
   constructor(...args){super(...args);window.audioSeen.push(this);}
   createBufferSource(){const node=super.createBufferSource(),stop=node.stop.bind(node),disconnect=node.disconnect.bind(node);node.__stopped=false;node.__disconnected=false;node.stop=(...args)=>{node.__stopped=true;return stop(...args);};node.disconnect=(...args)=>{node.__disconnected=true;return disconnect(...args);};(this.__nodes||(this.__nodes=[])).push(node);return node;}
  };
  if(failStorage)indexedDB.open=()=>{throw new DOMException('storage unavailable','SecurityError');};
 },{failStorage});
 await page.goto('file://'+path.join(root,'song.html'));await ready(page);
 const master=masterWav();await page.setInputFiles('#importWav',{name:'phrase.wav',mimeType:'audio/wav',buffer:master});await ready(page);await page.waitForSelector('.take');
 await page.getByRole('button',{name:'Extract melody',exact:true}).click();await ready(page);await page.waitForSelector('.performance');return master;
}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1100,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));const master=await begin(page);
  // Edit a note first: the arrangement must use the edited melody, not detector output.
  const note=page.locator('.note-table tbody tr:first-child input[data-field="midi"]');await note.fill('74');await note.press('Tab');await ready(page);
  await change(page,'Timing used','quantized');let project=await stored(page),performance=JSON.stringify(project.recordings[0].performance),source=JSON.stringify(project.recordings[0].source);
  await page.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(page);project=await stored(page);let a=project.arrangements[0],p=project.recordings[0].performance;
  assert.equal(a.sourcePerformanceId,p.id);assert.equal(a.sourceRecordingId,project.recordings[0].id);assert.equal(a.sourceAssetId,p.sourceAssetId);assert.equal(a.parts.lead.notes[0].midi,74);assert.equal(a.parts.lead.notes[0].start,p.notes[0].quantizedTiming.onset);assert.equal(a.version,1);assert.equal(await page.locator('.arrangement-parts fieldset').count(),4);
  assert.ok(await page.locator('.arrangement-roll').evaluate(canvas=>{const ctx=canvas.getContext('2d'),d=ctx.getImageData(0,0,canvas.width,canvas.height).data;let notes=0;for(let i=0;i<d.length;i+=4)if(d[i]===193&&d[i+1]===187&&d[i+2]===69)notes++;return notes>50;}));
  await change(page,'Lead Instrument','violin');await change(page,'Chords Instrument','guitar');await change(page,'Bass Instrument','cello');await change(page,'Drums Instrument','soft');
  await page.getByLabel('Lead Volume',{exact:true}).evaluate(el=>{el.value=.37;el.dispatchEvent(new Event('change',{bubbles:true}));});await ready(page);
  await page.getByLabel('Chords Enabled',{exact:true}).uncheck();await ready(page);
  const bpm=a.tempoBpm;await change(page,'Arrangement tempo (BPM)',Math.max(40,Math.floor(bpm/2)));await change(page,'Arrangement key','2');await change(page,'Arrangement mode','minor');await change(page,'Arrangement timing','original');
  project=await stored(page);a=project.arrangements[0];assert.equal(a.parts.lead.volume,.37);assert.equal(a.parts.chords.enabled,false);assert.equal(a.parts.bass.instrument,'cello');assert.equal(a.parts.drums.instrument,'soft');assert.ok(a.revision>=9);assert.equal(JSON.stringify(project.recordings[0].performance),performance);assert.equal(JSON.stringify(project.recordings[0].source),source);
  const midi=await download(page,()=>page.getByRole('button',{name:'Save multitrack MIDI',exact:true}).click());const tracks=parseMidi(midi.bytes);assert.equal(tracks[1].program,40);assert.equal(tracks[1].cc[0].value,47);assert.equal(tracks[2].notes.length,0);assert.equal(tracks[3].program,42);assert.equal(tracks[4].program,8);assert.ok(tracks[4].notes.every(n=>n.channel===9));assert.equal(tracks[1].notes[0].midi,a.parts.lead.notes[0].midi);assert.match(midi.name,/arrangement-v1-/);
  const wav=await download(page,()=>page.getByRole('button',{name:'Save stereo WAV',exact:true}).click());assert.equal(wav.bytes.readUInt16LE(22),2);assert.equal(wav.bytes.readUInt16LE(34),16);assert.equal(wav.bytes.readUInt32LE(24),44100);assert.equal(wav.bytes.length,44+Math.ceil((a.duration+1.8)*44100)*4);assert.ok(wav.bytes.subarray(44).some(v=>v));assert.match(wav.name,/arrangement-v1-/);
  assert.ok((await download(page,()=>page.getByRole('button',{name:'Save WAV',exact:true}).click())).bytes.equals(master));
  console.log('PASS  edited performance snapshot, four controls, roll pixels, tempo/key/timing, multitrack MIDI and non-silent stereo WAV; unchanged evidence/performance/master');
  // Live context/source lifecycle: explicit Stop, edit/project/language switches, page exit.
  const contexts=()=>page.evaluate(()=>window.audioSeen.map(c=>({state:c.state,nodes:(c.__nodes||[]).map(n=>({stop:n.__stopped,disconnect:n.__disconnected}))})));
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);assert.ok((await contexts()).some(c=>c.state==='running'&&c.nodes.length));
  await page.getByRole('button',{name:'Stop arrangement',exact:true}).click();await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));let seen=await contexts();assert.ok(seen.flatMap(c=>c.nodes).every(n=>n.stop&&n.disconnect));
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);await change(page,'Lead Instrument','piano');await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));
  // Cancel while still rendering: Stop stays usable even while other controls are locked.
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click({noWaitAfter:true});await page.getByRole('button',{name:'Stop arrangement',exact:true}).click();await ready(page);await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);await page.evaluate(()=>window.dispatchEvent(new PageTransitionEvent('pagehide')));await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));
  // A page exit now also releases writer ownership. Resume the actual page.
  await page.reload();await ready(page);await page.waitForSelector('.arrangement-parts');
  // A resume failure must close the context and leave Stop/next play usable.
  await page.evaluate(()=>{window.originalResume=AudioContext.prototype.resume;AudioContext.prototype.resume=()=>Promise.reject(new Error('resume failed'));});await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);assert.match(await page.textContent('#status'),/Cannot play/);await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));await page.evaluate(()=>{AudioContext.prototype.resume=window.originalResume;});
  await page.evaluate(()=>{window.originalStart=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=()=>{throw new Error('start failed');};});await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);assert.match(await page.textContent('#status'),/Cannot play/);await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));assert.ok((await contexts()).flatMap(c=>c.nodes).every(n=>n.disconnect));await page.evaluate(()=>{AudioBufferSourceNode.prototype.start=window.originalStart;});
  const previousTempo=await page.getByLabel('Arrangement tempo (BPM)',{exact:true}).inputValue();await change(page,'Arrangement tempo (BPM)',220);
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'),{},{timeout:20000});assert.ok((await contexts()).flatMap(c=>c.nodes).every(n=>n.disconnect));await change(page,'Arrangement tempo (BPM)',previousTempo);
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);await page.click('#navLangBtn');await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));await page.click('#navLangBtn');await ready(page);

  console.log('PASS  Stop, edits, cancellation during render, pagehide, natural end, language change and resume/start failures close contexts and stop/disconnect audio nodes');
  await page.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(page);project=await stored(page);assert.equal(project.arrangements.length,2);assert.equal(project.arrangements[1].version,2);assert.notEqual(project.arrangements[0].id,project.arrangements[1].id);
  const v1=JSON.stringify(project.arrangements[0]);await change(page,'Arrangement tempo (BPM)',90);assert.equal(JSON.stringify((await stored(page)).arrangements[0]),v1);
  await page.reload();await ready(page);await page.waitForSelector('.arrangement-parts');assert.equal(await page.getByLabel('Arrangement tempo (BPM)',{exact:true}).inputValue(),'90');assert.equal((await stored(page)).arrangements.length,2);
  await page.getByLabel('Arrangement version',{exact:true}).selectOption(project.arrangements[0].id);await ready(page);assert.equal(await page.getByLabel('Lead Volume',{exact:true}).inputValue(),'0.37');
  // Invalid edits do not partially corrupt a saved arrangement.
  await change(page,'Arrangement tempo (BPM)',10);assert.match(await page.textContent('#status'),/Invalid values/);assert.equal(JSON.stringify((await stored(page)).arrangements[0]),v1);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.click('#navLangBtn');await page.waitForFunction(()=>document.documentElement.lang==='ro');assert.equal(await page.getByRole('button',{name:'Salvează WAV stereo',exact:true}).count(),1);assert.equal(await page.getByLabel('Tobe Activ',{exact:true}).count(),1);await page.click('#navLangBtn');await ready(page);
  console.log('PASS  independent versions, invalid controls, reload, phone layout and Romanian/English labels');
  await page.evaluate(()=>{window.putBeforeFailure=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='projects')throw new DOMException('quota','QuotaExceededError');return window.putBeforeFailure.apply(this,args);};});
  await change(page,'Lead Instrument','harp');assert.ok(await page.isVisible('#recovery'));assert.equal((await stored(page)).arrangements[0].parts.lead.instrument,'piano');const recovery=JSON.parse((await download(page,()=>page.click('#exportProject'))).bytes);assert.equal(recovery.arrangements[0].parts.lead.instrument,'harp');assert.equal(JSON.stringify(recovery.recordings[0].performance),performance);
  const recoveredMidi=parseMidi((await download(page,()=>page.getByRole('button',{name:'Save multitrack MIDI',exact:true}).click())).bytes);assert.equal(recoveredMidi[1].program,46);
  assert.ok((await download(page,()=>page.getByRole('button',{name:'Save WAV',exact:true}).click())).bytes.equals(master));
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.putBeforeFailure;});await page.click('#retry');await ready(page);assert.equal((await stored(page)).arrangements[0].parts.lead.instrument,'harp');assert.equal(await page.isVisible('#recovery'),false);assert.equal(JSON.stringify((await stored(page)).recordings[0].performance),performance);
  // Export route options are the shared folder API, including nested desktop exports.
  await page.evaluate(()=>{window.saveOriginal=ScuLaFolder.save;window.saved=[];ScuLaFolder.save=async(name,blob,options)=>{saved.push({name,size:blob.size,type:blob.type,options});return {message:'saved'};};});
  await page.getByRole('button',{name:'Save multitrack MIDI',exact:true}).click();await ready(page);await page.getByRole('button',{name:'Save stereo WAV',exact:true}).click();await ready(page);const saved=await page.evaluate(()=>saved);assert.equal(saved.length,2);assert.ok(saved.every(x=>x.options.directories[1]==='exports'));assert.deepEqual(saved.map(x=>x.type),['audio/midi','audio/wav']);
  const originalProject=await page.locator('#projects').inputValue();await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(page);await page.click('#newProject');await ready(page);await page.waitForFunction(()=>audioSeen.every(c=>c.state==='closed'));assert.equal(await page.locator('.take').count(),0);await page.selectOption('#projects',originalProject);await ready(page);await page.waitForSelector('.arrangement');assert.equal(await page.locator('.arrangement-parts fieldset').count(),4);
  const reader=await context.newPage();await reader.goto(page.url());await ready(reader);await reader.waitForSelector('.arrangement-parts');
  assert.ok(await reader.isVisible('#writerPanel'));assert.ok(await reader.getByLabel('Arrangement tempo (BPM)',{exact:true}).isDisabled());
  await reader.getByRole('button',{name:'Play arrangement',exact:true}).click();await ready(reader);assert.ok(await reader.getByRole('button',{name:'Stop arrangement',exact:true}).isEnabled());
  await reader.getByRole('button',{name:'Stop arrangement',exact:true}).click();await reader.close();
  console.log('PASS  read-only second tab disables arrangement edits but retains playback and Stop');
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS  quota failure keeps arrangement/MIDI/master/metadata exportable, retry commits; both exports use ScuLaFolder.save');
  const unavailable=await browser.newContext({acceptDownloads:true}),q=await unavailable.newPage();await begin(q,{failStorage:true});await q.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(q);await change(q,'Bass Instrument','guitar');const backup=JSON.parse((await download(q,()=>q.click('#exportProject'))).bytes);assert.equal(backup.arrangements[0].parts.bass.instrument,'guitar');assert.equal(parseMidi((await download(q,()=>q.getByRole('button',{name:'Save multitrack MIDI',exact:true}).click())).bytes)[3].program,25);assert.ok((await download(q,()=>q.getByRole('button',{name:'Save stereo WAV',exact:true}).click())).bytes.length>44);await unavailable.close();
  console.log('PASS  file:// with unavailable IndexedDB: arrangements and WAV/MIDI/JSON exports stay usable');
  console.log('all song arrangement checks passed');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
