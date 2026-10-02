// Sample imports and identical file:// playback/export through the shipped page.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function wav(notes){
 const sr=22050,frames=sr*3,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++){const t=i/sr,index=Math.floor((t-.1)/.5),local=t-.1-index*.5;if(index<0||index>=notes.length||local>.4)continue;const f=440*2**((notes[index]-69)/12),env=Math.min(1,local/.02,(.4-local)/.04);b.writeInt16LE(Math.round(.3*env*Math.sin(2*Math.PI*f*local)*32767),44+i*2);}return b;
}
function sampleWav(){
 const sr=22050,frames=sr,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++){const env=Math.min(1,i/200,(frames-i)/300);b.writeInt16LE(Math.round(env*(Math.sin(i*2*Math.PI*261.63/sr)>0?.35:-.35)*32767),44+i*2);}return b;
}
async function ready(page){await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');}
async function save(page,button){const pending=page.waitForEvent('download');await button.click();const d=await pending;return fs.readFileSync(await d.path());}
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{localStorage.setItem('scula:ui-lang','en');const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){window.played=this.buffer;return start.apply(this,args);};});
  await page.goto('file://'+path.join(root,'song.html'));await ready(page);
  const melody=wav([60,64,67,72]),source=sampleWav();
  await page.setInputFiles('#importWav',{name:'phrase.wav',mimeType:'audio/wav',buffer:melody});await ready(page);
  await page.getByRole('button',{name:'Extract melody',exact:true}).click();await ready(page);
  await page.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(page);
  await page.selectOption('#purpose','sample');await page.fill('#instrument','My Flute');await page.fill('#midiNote','60');await page.fill('#dynamic','mf');
  await page.setInputFiles('#importWav',{name:'flute.wav',mimeType:'audio/wav',buffer:source});await ready(page);await page.waitForFunction(()=>document.querySelectorAll('.take').length===2);
  assert.deepEqual(await save(page,page.locator('.take').nth(1).getByRole('button',{name:'Save WAV',exact:true})),source,'source WAV must remain byte-for-byte unchanged');
  const originalMidi=await save(page,page.getByRole('button',{name:'Save multitrack MIDI',exact:true}));
  await page.getByLabel('Lead Sample set',{exact:true}).selectOption('My Flute');await ready(page);
  assert.deepEqual(await save(page,page.getByRole('button',{name:'Save multitrack MIDI',exact:true})),originalMidi,'sample choice must preserve MIDI notes and programs');
  for(const part of ['Chords','Bass','Drums']){await page.getByLabel(part+' Enabled',{exact:true}).uncheck();await ready(page);}
  await page.getByRole('button',{name:'Play arrangement',exact:true}).click();await page.waitForFunction(()=>window.played && document.querySelector('#status').textContent.includes('Playing arrangement'));
  const exported=await save(page,page.getByRole('button',{name:'Save stereo WAV',exact:true}));await ready(page);
  assert.equal(exported.readUInt16LE(22),2);assert.equal(exported.readUInt32LE(24),44100);
  const played=await page.evaluate(()=>{const b=window.played;return {length:b.length,left:Array.from(b.getChannelData(0).filter((_,i)=>i%997===0)),right:Array.from(b.getChannelData(1).filter((_,i)=>i%997===0))};});
  assert.equal(exported.length,44+played.length*4);
  for(let k=0;k<played.left.length;k++){const at=44+k*997*4;const pcm=x=>Math.max(-1,Math.min(1,x));assert.ok(Math.abs(exported.readInt16LE(at)/32767-pcm(played.left[k]))<1/20000);assert.ok(Math.abs(exported.readInt16LE(at+2)/32767-pcm(played.right[k]))<1/20000);}
  const metadata=JSON.parse(await save(page,page.locator('#exportProject')));assert.equal(metadata.arrangements[0].parts.lead.sampleSet,'My Flute');assert.equal(metadata.recordings[1].sample.midiNote,60);
  await page.reload();await ready(page);assert.equal(await page.getByLabel('Lead Sample set',{exact:true}).inputValue(),'My Flute');
  await page.getByLabel('Lead Sample set',{exact:true}).selectOption('');await ready(page);
  const synthesized=await save(page,page.getByRole('button',{name:'Save stereo WAV',exact:true}));await ready(page);
  await page.getByLabel('Lead Sample set',{exact:true}).selectOption('My Flute');await ready(page);
  await page.evaluate(id=>new Promise((resolve,reject)=>{const open=indexedDB.open('scula-song');open.onsuccess=()=>{const db=open.result,tx=db.transaction('audio','readwrite');tx.objectStore('audio').delete(id);tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};open.onerror=()=>reject(open.error);}),metadata.recordings[1].id);
  const missingBlob=await save(page,page.getByRole('button',{name:'Save stereo WAV',exact:true}));assert.deepEqual(missingBlob,synthesized,'a missing source Blob must fall back to synthesis');
  page.once('dialog',dialog=>dialog.accept());await page.locator('.take').nth(1).getByRole('button',{name:'Delete',exact:true}).click();await ready(page);
  assert.equal(await page.getByLabel('Lead Sample set',{exact:true}).inputValue(),'My Flute');
  const fallback=await save(page,page.getByRole('button',{name:'Save stereo WAV',exact:true}));assert.deepEqual(fallback,synthesized,'a removed sample set must fall back to the current synth');
  await page.getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(page);
  const versions=JSON.parse(await save(page,page.locator('#exportProject'))).arrangements;
  assert.equal(versions.length,2);assert.equal(versions[0].parts.lead.sampleSet,'My Flute');assert.equal(versions[1].parts.lead.sampleSet,undefined);
  assert.deepEqual(errors,[]);await context.close();
  console.log('PASS  file:// sample import, unchanged source WAV and MIDI, saved/versioned selection, identical playback/export and missing-sample fallback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
