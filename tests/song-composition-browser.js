// Shipped composition UI, fenced persistence, independent versions and backups.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright'),{midiEvents}=require('./song-composition');
const root=path.resolve(__dirname,'..');
function wav(){const sr=22050,b=Buffer.alloc(44+sr*3*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(b.length-44,40);for(let i=0;i<sr*3;i++){const t=i/sr-.1,n=Math.floor(t/.5),local=t-n*.5;if(n<0||n>=4||local>.4)continue;const hz=440*2**(([60,64,67,72][n]-69)/12),env=Math.min(1,local/.02,(.4-local)/.04);b.writeInt16LE(Math.round(.3*env*Math.sin(2*Math.PI*hz*local)*32767),44+2*i);}return b;}
const ready=p=>p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
async function stored(p){return p.evaluate(()=>new Promise((resolve,reject)=>{const q=indexedDB.open('scula-song');q.onsuccess=()=>{const db=q.result,r=db.transaction('projects').objectStore('projects').getAll();r.onsuccess=()=>{db.close();resolve(r.result.find(p=>p.id===localStorage.getItem('scula:song:project'))||r.result[0]);};r.onerror=reject;};q.onerror=reject;}));}
async function change(p,label,value){const el=p.getByLabel(label,{exact:true});if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption(String(value));else{await el.fill(String(value));await el.press('Tab');}await ready(p);}
async function click(p,name){await p.getByRole('button',{name,exact:true}).click();await ready(p);}
async function save(p,selector){const pending=p.waitForEvent('download');await selector.click();const d=await pending;await ready(p);return fs.readFileSync(await d.path());}
async function manifest(p){return JSON.parse(await save(p,p.locator('#exportProject')));}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1100,height:900}}),p=await context.newPage(),errors=[];
  p.on('pageerror',e=>errors.push(e.message));await p.addInitScript(()=>localStorage.setItem('scula:ui-lang','en'));
  await p.goto('file://'+path.join(root,'song.html'));await ready(p);const source=wav();
  await p.setInputFiles('#importWav',{name:'melody.wav',mimeType:'audio/wav',buffer:source});await ready(p);await click(p,'Extract melody');await click(p,'Create arrangement version');
  await change(p,'Arrangement tempo (BPM)',120);await change(p,'Arrangement key',0);await change(p,'Arrangement mode','major');
  const original=await stored(p),legacy=JSON.stringify(original.arrangements[0]),performance=JSON.stringify(original.recordings[0].performance);
  await click(p,'Compose a new copy');await change(p,'Meter','3/4');await change(p,'Chord changes per bar',2);await change(p,'Chord slot 1',4);await change(p,'Chord slot 2',5);
  await change(p,'Style preset','folk');let project=await stored(p),a=project.arrangements.at(-1);
  assert.equal(a.generatorVersion,2);assert.equal(a.composition.meter,'3/4');assert.deepEqual(a.composition.chordDegrees,[4,5]);assert.equal(a.parts.chords.instrument,'guitar');assert.equal(a.composition.bassPattern,'fifths');
  assert.match(await p.getByLabel('Chord slot 1',{exact:true}).textContent(),/% melody match/);
  assert.equal(JSON.stringify(project.arrangements[0]),legacy);assert.equal(JSON.stringify(project.recordings[0].performance),performance);
  await change(p,'Arrangement timing','quantized');await change(p,'Arrangement timing','original');assert.equal(JSON.stringify((await stored(p)).arrangements.at(-1).performanceSnapshot),JSON.stringify(a.performanceSnapshot));
  await p.click('#addSongSection');await ready(p);await click(p,'Duplicate section 1');let linked=await stored(p);assert.equal(linked.timeline[0].arrangementId,linked.timeline[1].arrangementId);
  const previous=JSON.stringify(linked.arrangements[1]);await click(p,'Develop section independently 2');
  await change(p,'Meter','6/8');await change(p,'Drum fills','ending');await change(p,'Lead octave',1);project=await stored(p);
  assert.notEqual(project.timeline[0].arrangementId,project.timeline[1].arrangementId);assert.equal(project.timeline[0].arrangementId,linked.timeline[0].arrangementId);assert.equal(JSON.stringify(project.arrangements[1]),previous);
  assert.deepEqual(project.arrangements[2].parts.lead.notes.map(n=>n.midi),project.arrangements[1].parts.lead.notes.map(n=>n.midi+12));
  assert.match(await p.locator('.song-overview-block[data-section-id]').nth(0).textContent(),/3\/4/);assert.match(await p.locator('.song-overview-block[data-section-id]').nth(1).textContent(),/6\/8/);
  await p.click('#undoSongTimeline');await ready(p);assert.equal((await stored(p)).timeline[1].arrangementId,linked.timeline[1].arrangementId);await p.click('#redoSongTimeline');await ready(p);
  const data=await p.evaluate(project=>{const T=ScuLaSongTimeline;return {plan:T.resolve(project).seconds,marks:T.beatMarks(project)};},project);
  assert.equal(Number(await p.locator('#songBeatRuler').getAttribute('data-beat-count')),data.marks.length);
  const midi=midiEvents(await save(p,p.locator('#saveSongMidi'))),meters=midi[0].filter(e=>e.type===88);assert.deepEqual(meters.map(e=>e.data.slice(0,2)),[[3,2],[6,3]]);
  const secondAt=project.arrangements[1].duration;
  await p.selectOption('#songLoopMode','custom');await p.getByLabel('Snap to beats',{exact:true}).check();
  await p.locator('#songLoopStart').evaluate((el,time)=>{el.value=String(time);el.dispatchEvent(new Event('input',{bubbles:true}));},secondAt+.3);
  assert.ok(Math.abs(Number(await p.locator('#songLoopStart').inputValue())-(secondAt+.25))<.001);
  await p.getByLabel('Snap to beats',{exact:true}).uncheck();await change(p,'Start time (mm:ss.mmm)',secondAt-.25);await change(p,'End time (mm:ss.mmm)',secondAt+.75);
  const loop=midiEvents(await save(p,p.locator('#saveSongLoopMidi')));assert.deepEqual(loop[0].filter(e=>e.type===88).map(e=>[e.tick,e.data.slice(0,2)]),[[0,[3,2]],[240,[6,3]]]);
  const fullWav=await save(p,p.locator('#saveSongWav')),loopWav=await save(p,p.locator('#saveSongLoopWav'));assert.equal(fullWav.length,44+Math.ceil((data.plan+1.8)*44100)*4);
  const start=Math.round((secondAt-.25)*44100),end=Math.round((secondAt+.75)*44100);assert.deepEqual(loopWav.subarray(44),fullWav.subarray(44+start*4,44+end*4));
  // A new alternate melody must leave every older snapshot and source unchanged.
  const snapshots=project.arrangements.map(a=>JSON.stringify(a.performanceSnapshot));const note=p.locator('.note-table tbody tr:first-child input[data-field="midi"]');await note.fill('65');await note.press('Tab');await ready(p);
  await click(p,'New copy with edited melody');project=await stored(p);assert.equal(project.arrangements.at(-1).performanceSnapshot.notes[0].midi,65);assert.deepEqual(project.arrangements.slice(0,-1).map(a=>JSON.stringify(a.performanceSnapshot)),snapshots);
  // Invalid copied pitch range rolls back the controls and stored version.
  const current=project.arrangements.at(-1);await p.getByLabel('Lead octave',{exact:true}).evaluate(el=>{el.add(new Option('Invalid','9'));el.value='9';el.dispatchEvent(new Event('change',{bubbles:true}));});await ready(p);
  assert.match(await p.textContent('#status'),/Invalid values/);assert.deepEqual((await stored(p)).arrangements.at(-1),current);
  await p.reload();await ready(p);assert.equal(await p.getByLabel('Meter',{exact:true}).inputValue(),'6/8');
  const backup=await manifest(p);assert.equal(await p.evaluate(data=>{ScuLaSongBackup.validate(data);return true;},backup),true);
  for(const edit of [v=>v.arrangements[1].composition.version=3,v=>v.arrangements[1].composition.meter='5/4',v=>v.arrangements[1].composition.chordDegrees=[99],v=>v.arrangements[1].chords[0].start=100]){const bad=structuredClone(backup);edit(bad);assert.ok(await p.evaluate(data=>{try{ScuLaSongBackup.validate(data);return false;}catch(_){return true;}},bad));}
  assert.deepEqual(await save(p,p.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true})),source);
  await p.setInputFiles('#backupJson',{name:'composition.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(backup))});await p.setInputFiles('#backupWavs',{name:backup.recordings[0].source.filename,mimeType:'audio/wav',buffer:source});await p.click('#validateBackup');await ready(p);assert.equal(await p.locator('#restoreBackup').isEnabled(),true,await p.textContent('#backupSummary'));
  await p.click('#restoreBackup');await ready(p);const restored=await manifest(p);assert.notEqual(restored.id,backup.id);
  assert.deepEqual(restored.arrangements.map(a=>[a.generatorVersion,a.composition,a.performanceSnapshot,a.parts,a.chords]),backup.arrangements.map(a=>[a.generatorVersion,a.composition,a.performanceSnapshot,a.parts,a.chords]));
  assert.ok(restored.timeline.every(s=>restored.arrangements.some(a=>a.id===s.arrangementId)));assert.deepEqual(await save(p,p.locator('.take').first().getByRole('button',{name:'Save WAV',exact:true})),source);
  await p.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='projects')throw new DOMException('quota','QuotaExceededError');return originalPut.apply(this,args);};});
  await click(p,'Compose a new copy');assert.ok(await p.locator('#recovery').isVisible());assert.equal((await stored(p)).arrangements.length,restored.arrangements.length);assert.equal((await manifest(p)).arrangements.length,restored.arrangements.length+1);
  await p.evaluate(()=>IDBObjectStore.prototype.put=window.originalPut);await p.click('#retry');await ready(p);assert.equal((await stored(p)).arrangements.length,restored.arrangements.length+1);
  const other=await context.newPage();await other.goto('file://'+path.join(root,'song.html'));await ready(other);assert.ok(await other.getByRole('button',{name:'Compose a new copy',exact:true}).isDisabled());assert.ok(await other.getByLabel('Meter',{exact:true}).isDisabled());assert.ok(await other.getByRole('button',{name:'Develop section independently 1',exact:true}).isDisabled());await other.close();
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await p.click('#navLangBtn');await p.waitForFunction(()=>document.documentElement.lang==='ro');assert.equal(await p.getByLabel('Măsură',{exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Compune o copie nouă',exact:true}).count(),1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  assert.deepEqual(errors,[]);console.log('PASS composition UI: independent/alternate snapshots, presets/harmony, mixed-meter ruler and snapping, exact loop WAV/MIDI, rollback/reload, validated/remapped backup, quota recovery, read-only controls, source bytes and RO/EN phone layout');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
