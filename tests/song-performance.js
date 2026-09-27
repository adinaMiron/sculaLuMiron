// Real Song controls: WAV -> analysis -> edits -> persistence/exports.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),http=require('http');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),SEQ=[60,62,64,65,67,65,64,62,60,64,67,64];
function wav({silence=false,seconds=8,channels=2,bits=24}={}){
 const sr=44100,n=Math.ceil(sr*seconds),align=channels*bits/8,data=n*align;
 // A real extra, odd-sized RIFF chunk must survive every operation/export.
 const b=Buffer.alloc(54+data+(data%2));b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(channels,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*align,28);b.writeUInt16LE(align,32);b.writeUInt16LE(bits,34);b.write('JUNK',36);b.writeUInt32LE(1,40);b[44]=91;b.write('data',46);b.writeUInt32LE(data,50);
 if(!silence)for(let i=0;i<n;i++){const t=i/sr-.1,index=Math.floor(t/.6),local=t-index*.6;if(index<0 || index>=SEQ.length || local>.492)continue;const f=440*2**((SEQ[index]-69)/12),env=Math.min(1,local/.02,(.492-local)/.04),v=.2*env*(Math.sin(2*Math.PI*f*local)+.3*Math.sin(4*Math.PI*f*local));for(let c=0;c<channels;c++)b.writeIntLE(Math.round(v*(c===0?1:.7)*(2**(bits-1)-1)),54+i*align+c*bits/8,bits/8);}
 return b;
}
function readMidi(b){assert.equal(b.toString('ascii',0,4),'MThd');let i=22,tick=0,notes=[];while(i<b.length){let delta=0,v;do{v=b[i++];delta=(delta<<7)|(v&127);}while(v&128);tick+=delta;const status=b[i++];if(status===255){i++;let length=0;do{v=b[i++];length=(length<<7)|(v&127);}while(v&128);i+=length;}else {const midi=b[i++],vel=b[i++];if(status===144 && vel)notes.push({midi,tick,velocity:vel});}}return notes;}
async function projects(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('scula-song',1);r.onsuccess=()=>{const db=r.result,q=db.transaction('projects').objectStore('projects').getAll();q.onsuccess=()=>{db.close();resolve(q.result);};q.onerror=reject;};r.onerror=reject;}));}
async function download(page,action){const promise=page.waitForEvent('download');await action();return fs.readFileSync(await (await promise).path());}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');}
async function edit(page,field,value){await page.locator(`.note-table tbody tr:first-child input[data-field="${field}"]`).fill(String(value));await page.locator(`.note-table tbody tr:first-child input[data-field="${field}"]`).press('Tab');await ready(page);}
async function analyze(page,index=0){await page.locator('.take').nth(index).getByRole('button',{name:'Extract melody',exact:true}).click();await ready(page);await page.locator('.take').nth(index).waitFor();}
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!f.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(f,(err,data)=>{if(err){res.writeHead(404);return res.end();}res.setHeader('Content-Type',f.endsWith('.js')?'text/javascript':'text/html');res.end(data);});});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/song.html`;
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'song-phase2-')),fixture=path.join(temp,'hum.wav'),master=wav({});const fake=wav({channels:1,bits:16}),standard=Buffer.concat([fake.subarray(0,36),fake.subarray(46)]);standard.writeUInt32LE(standard.length-8,4);fs.writeFileSync(fixture,standard);
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream','--use-file-for-fake-audio-capture='+fixture]});
 try{
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1100,height:950}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url);await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Pregătit');await page.click('#navLangBtn');await ready(page);
  await page.setInputFiles('#importWav',{name:'Humming.wav',mimeType:'audio/wav',buffer:master});await page.waitForSelector('.take');await ready(page);
  let r=(await projects(page))[0].recordings[0];assert.equal(r.bitDepth,24);assert.equal(r.channelCount,2);assert.equal(r.source.immutable,true);
  assert.ok((await download(page,()=>page.getByRole('button',{name:'Save WAV',exact:true}).click())).equals(master));
  await analyze(page);r=(await projects(page))[0].recordings[0];let p=r.performance;
  assert.deepEqual(p.notes.map(n=>n.midi),SEQ);assert.equal(p.sourceAssetId,r.source.assetId);assert.equal(p.type,'MusicalPerformance');assert.ok(p.analysis.rawPitchFrames.length>300);assert.ok(p.analysis.onsets.length>=SEQ.length);assert.ok(p.notes.every(n=>n.quantizedTiming===null));
  console.log('PASS  stereo PCM24 WAV with extra chunk imported unchanged; real decoder produces known notes and performance');
  const rawEvidence=JSON.stringify(p.analysis),originalOnset=p.notes[0].onset;
  await edit(page,'midi',72);await edit(page,'onset',.15);await edit(page,'offset',.55);await edit(page,'cents',12.5);await edit(page,'velocity',77);
  p=(await projects(page))[0].recordings[0].performance;assert.equal(p.notes[0].midi,72);assert.equal(p.notes[0].onset,.15);assert.equal(p.notes[0].offset,.55);assert.equal(p.notes[0].cents,12.5);assert.equal(p.notes[0].velocity,77);assert.equal(JSON.stringify(p.analysis),rawEvidence);
  await page.getByRole('button',{name:'Undo',exact:true}).click();await ready(page);assert.notEqual((await projects(page))[0].recordings[0].performance.notes[0].velocity,77);
  await page.getByRole('button',{name:'Redo',exact:true}).click();await ready(page);
  await page.getByLabel('Timing used',{exact:true}).selectOption('quantized');await ready(page);
  p=(await projects(page))[0].recordings[0].performance;assert.equal(p.notes[0].onset,.15);assert.ok(p.notes[0].quantizedTiming);assert.equal(p.analysis.detectedNotes[0].onset,originalOnset);
  const midi=readMidi(await download(page,()=>page.getByRole('button',{name:'Save MIDI',exact:true}).click()));assert.equal(midi[0].midi,72);assert.equal(midi[0].velocity,77);assert.equal(midi[0].tick,Math.round(p.notes[0].quantizedTiming.onset*p.tempoBpm*8));
  await page.getByRole('button',{name:'Play melody',exact:true}).click();await ready(page);await page.getByRole('button',{name:'Stop melody',exact:true}).click();await ready(page);
  await edit(page,'offset',.01);assert.equal((await projects(page))[0].recordings[0].performance.notes[0].offset,.55);assert.match(await page.textContent('#status'),/Invalid values/);
  await page.reload();await ready(page);await page.waitForSelector('.performance');p=(await projects(page))[0].recordings[0].performance;assert.equal(p.notes[0].midi,72);assert.equal(p.timingMode,'quantized');
  assert.ok((await download(page,()=>page.getByRole('button',{name:'Save WAV',exact:true}).click())).equals(master));
  const manifest=JSON.parse(await download(page,()=>page.click('#exportProject')));assert.equal(manifest.recordings[0].performance.notes[0].midi,72);assert.equal(manifest.recordings[0].performance.sourceAssetId,manifest.recordings[0].source.assetId);
  console.log('PASS  edits, undo/redo, quantized timing, MIDI, preview and reload preserve evidence and master bytes');
  page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Analyze again',exact:true}).click();await ready(page);assert.equal((await projects(page))[0].recordings[0].performance.notes[0].midi,72);
  await page.getByRole('button',{name:'Add note',exact:true}).click();await ready(page);assert.equal((await projects(page))[0].recordings[0].performance.notes.length,SEQ.length+1);
  await page.locator('.note-table tbody tr:last-child').getByRole('button',{name:'Delete',exact:true}).click();await ready(page);
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Restore detected notes',exact:true}).click();await ready(page);assert.equal((await projects(page))[0].recordings[0].performance.notes[0].midi,60);
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.click('#navLangBtn');await page.waitForFunction(()=>document.documentElement.lang==='ro');assert.equal(await page.getByRole('button',{name:'Adaugă notă',exact:true}).count(),1);await page.click('#navLangBtn');await ready(page);
  console.log('PASS  reanalysis cancellation, add/delete/reset, Romanian labels and phone layout');
  await page.evaluate(()=>{const put=IDBObjectStore.prototype.put;window.originalPut=put;IDBObjectStore.prototype.put=function(...args){if(this.name==='projects')throw new DOMException('full','QuotaExceededError');return put.apply(this,args);};});
  await edit(page,'midi',74);assert.equal((await projects(page))[0].recordings[0].performance.notes[0].midi,60);assert.ok(await page.isVisible('#recovery'));
  const recovery=JSON.parse(await download(page,()=>page.click('#exportProject')));assert.equal(recovery.recordings[0].performance.notes[0].midi,74);assert.ok((await download(page,()=>page.getByRole('button',{name:'Save WAV',exact:true}).click())).equals(master));
  await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});await page.click('#retry');await ready(page);assert.equal((await projects(page))[0].recordings[0].performance.notes[0].midi,74);
  console.log('PASS  failed metadata commit keeps edits exportable and retry stores them atomically');
  await page.setInputFiles('#importWav',{name:'bad.wav',mimeType:'audio/wav',buffer:Buffer.from('not WAV')});await ready(page);assert.match(await page.textContent('#status'),/Invalid or unsupported/);assert.equal((await projects(page))[0].recordings.length,1);
  await page.setInputFiles('#importWav',{name:'silence.wav',mimeType:'audio/wav',buffer:wav({silence:true,seconds:1,channels:1,bits:16})});await page.waitForFunction(()=>document.querySelectorAll('.take').length===2);await ready(page);await analyze(page,1);assert.equal((await projects(page))[0].recordings[1].performance.notes.length,0);assert.match(await page.textContent('#status'),/No clear notes/);
  const quiet=page.locator('.take').nth(1);await quiet.getByRole('button',{name:'Add note',exact:true}).click();await ready(page);assert.equal((await projects(page))[0].recordings[1].performance.notes.length,1);
  console.log('PASS  invalid import rejected; silent audio retains evidence and supports manual notes');
  await page.click('#recordBtn');await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Recording');await page.waitForTimeout(2100);await page.click('#stopBtn');await ready(page);await page.waitForFunction(()=>document.querySelectorAll('.take').length===3);
  const captured=page.locator('.take').nth(2),capturedMaster=await download(page,()=>captured.getByRole('button',{name:'Save WAV',exact:true}).click());await analyze(page,2);
  r=(await projects(page))[0].recordings[2];assert.equal(r.source.captureBackend,'AudioWorklet');assert.ok(r.performance.notes.length>=2,JSON.stringify({notes:r.performance.notes,source:r.source,frames:r.performance.analysis.rawPitchFrames.slice(0,4)}));assert.equal(r.performance.notes[0].midi,60);
  assert.ok((await download(page,()=>captured.getByRole('button',{name:'Save WAV',exact:true}).click())).equals(capturedMaster));
  const savedPerformance=JSON.stringify(r.performance);await page.evaluate(()=>{window.decodeOriginal=BaseAudioContext.prototype.decodeAudioData;BaseAudioContext.prototype.decodeAudioData=()=>Promise.reject(new Error('decode failed'));});
  page.once('dialog',d=>d.accept());await captured.getByRole('button',{name:'Analyze again',exact:true}).click();await ready(page);assert.match(await page.textContent('#status'),/Analysis failed/);assert.equal(JSON.stringify((await projects(page))[0].recordings[2].performance),savedPerformance);await page.evaluate(()=>{BaseAudioContext.prototype.decodeAudioData=window.decodeOriginal;});
  console.log('PASS  actual fake microphone capture feeds extraction; master and existing performance survive analysis failure');
  assert.deepEqual(errors,[]);await context.close();
  const unavailable=await browser.newContext(),q=await unavailable.newPage();await q.addInitScript(()=>{indexedDB.open=()=>{throw new DOMException('no storage','SecurityError');};localStorage.setItem('scula:ui-lang','en');});await q.goto('file://'+path.join(root,'song.html'));await ready(q);await q.setInputFiles('#importWav',{name:'hum.wav',mimeType:'audio/wav',buffer:master});await ready(q);await q.waitForSelector('.take');await analyze(q);const noDb=JSON.parse(await download(q,()=>q.click('#exportProject')));assert.deepEqual(noDb.recordings[0].performance.notes.map(n=>n.midi),SEQ);await unavailable.close();
  console.log('PASS  file:// import, analysis and exports work without IndexedDB');
  console.log('all song performance checks passed');
 }finally{await browser.close();server.close();fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
