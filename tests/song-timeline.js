// Whole-song sections through the shipped file:// UI and real browser exports.
const assert=require('assert/strict'),fs=require('fs'),path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
function wav(pitches){const sr=22050,frames=sr*3,b=Buffer.alloc(44+frames*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVE',8);b.write('fmt ',12);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(sr,24);b.writeUInt32LE(sr*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);for(let i=0;i<frames;i++){const t=i/sr-.1,n=Math.floor(t/.5),local=t-n*.5;if(n<0||n>=pitches.length||local>.4)continue;const f=440*2**((pitches[n]-69)/12),env=Math.min(1,local/.02,(.4-local)/.04);b.writeInt16LE(Math.round(.3*env*Math.sin(2*Math.PI*f*local)*32767),44+i*2);}return b;}
async function ready(p){await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');}
async function save(p,action){const pending=p.waitForEvent('download');await action();const download=await pending;return {name:download.suggestedFilename(),bytes:fs.readFileSync(await download.path())};}
function checkLoopWav(loop,full,mode,startSeconds,endSeconds){
  const rate=full.readUInt32LE(24),start=Math.round(startSeconds*rate),end=Math.round(endSeconds*rate),frames=end-start;
  assert.match(loop.name,new RegExp('-song-loop-'+mode+'.*-'+start+'f-'+end+'f\\.wav$'));
  assert.equal(loop.bytes.toString('ascii',0,4),'RIFF');assert.equal(loop.bytes.readUInt16LE(22),2);assert.equal(loop.bytes.readUInt32LE(24),rate);
  assert.equal(loop.bytes.readUInt32LE(40),frames*4);assert.equal(loop.bytes.length,44+frames*4);
  assert.ok(loop.bytes.subarray(44).equals(full.subarray(44+start*4,44+end*4)),'loop PCM must be the exact stereo slice of the full-song WAV');
}
async function manifest(p){return JSON.parse((await save(p,()=>p.click('#exportProject'))).bytes);}
function midiTracks(b){assert.equal(b.toString('ascii',0,4),'MThd');assert.equal(b.readUInt16BE(8),1);assert.equal(b.readUInt16BE(10),5);let pos=14;const tracks=[];for(let i=0;i<5;i++){assert.equal(b.toString('ascii',pos,pos+4),'MTrk');const end=pos+8+b.readUInt32BE(pos+4),events=[];pos+=8;let tick=0;const vlq=()=>{let n=0,x;do{x=b[pos++];n=(n<<7)|(x&127);}while(x&128);return n;};while(pos<end){tick+=vlq();const status=b[pos++];if(status===255){const type=b[pos++],len=vlq(),data=b.subarray(pos,pos+len);events.push({tick,type,data});pos+=len;}else if((status&240)===192){events.push({tick,status,program:b[pos++]});}else{const note=b[pos++],value=b[pos++];events.push({tick,status,note,value});}}assert.equal(pos,end);tracks.push(events);}assert.equal(pos,b.length);return tracks;}
const data=(name,buffer)=>({name,mimeType:'audio/wav',buffer});
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH});
 try{
  const ctx=await browser.newContext({acceptDownloads:true,hasTouch:true,viewport:{width:1100,height:900}}),p=await ctx.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(()=>{localStorage.setItem('scula:ui-lang','en');window.playedMix=null;window.songStarts=[];window.songDurations=[];window.songContexts=[];const Native=window.AudioContext;window.AudioContext=class extends Native{constructor(...args){super(...args);songContexts.push(this);this.songNodes=[];}createBufferSource(){const node=super.createBufferSource();this.songNodes.push(node);node.wasStopped=false;node.wasDisconnected=false;const stop=node.stop.bind(node),disconnect=node.disconnect.bind(node);node.stop=(...args)=>{node.wasStopped=true;return stop(...args);};node.disconnect=(...args)=>{node.wasDisconnected=true;return disconnect(...args);};return node;}};const start=AudioBufferSourceNode.prototype.start;AudioBufferSourceNode.prototype.start=function(...args){if(this.buffer?.numberOfChannels===2 && this.buffer.length>44100){window.playedMix=[Float32Array.from(this.buffer.getChannelData(0)),Float32Array.from(this.buffer.getChannelData(1))];songStarts.push(args[1]||0);songDurations.push(args[2]??null);}return start.apply(this,args);};});
  await p.goto('file://'+path.join(root,'song.html'));await ready(p);
  assert.equal(await p.isDisabled('#saveSongLoopWav'),true);assert.equal(await p.isDisabled('#saveSongLoopMidi'),true);
  const sources=[wav([60,64,67,72]),wav([67,69,72,74])];
  for(let i=0;i<2;i++){await p.setInputFiles('#importWav',data('hum-'+i+'.wav',sources[i]));await ready(p);await p.locator('.take').nth(i).getByRole('button',{name:'Extract melody',exact:true}).click();await ready(p);await p.locator('.take').nth(i).getByRole('button',{name:'Create arrangement version',exact:true}).click();await ready(p);}
  let original=await manifest(p);assert.equal(original.arrangements.length,2);
  await p.locator('.take').nth(1).getByLabel('Arrangement tempo (BPM)',{exact:true}).fill('90');await p.locator('.take').nth(1).getByLabel('Arrangement tempo (BPM)',{exact:true}).press('Tab');await ready(p);
  await p.locator('.take').nth(1).getByLabel('Arrangement key',{exact:true}).selectOption('2');await ready(p);original=await manifest(p);
  await p.click('#addSongSection');await ready(p);assert.equal(await p.getByRole('button',{name:'Move up 1'}).isDisabled(),true);await p.getByLabel('Arrangement version 1',{exact:true}).selectOption(original.arrangements[0].id);await ready(p);await p.getByLabel('Section name 1').fill('Verse');await p.getByLabel('Section name 1').press('Tab');await ready(p);await p.getByLabel('Repeats 1').fill('2');await p.getByLabel('Repeats 1').press('Tab');await ready(p);
  await p.click('#addSongSection');await ready(p);await p.getByLabel('Section name 2').fill('Chorus');await p.getByLabel('Section name 2').press('Tab');await ready(p);
  await p.getByRole('button',{name:'Move up 2'}).click();await ready(p);await p.getByRole('button',{name:'Duplicate section 1'}).click();await ready(p);assert.equal(await p.locator('.song-section').count(),3);await p.getByRole('button',{name:'Remove section 2'}).click();await ready(p);
  let project=await manifest(p);assert.deepEqual(project.timeline.map(s=>[s.name,s.arrangementId,s.repeats]),[['Chorus',project.arrangements[1].id,1],['Verse',project.arrangements[0].id,2]]);assert.equal(new Set(project.timeline.map(s=>s.id)).size,2);
  const [chorus,verse]=[project.arrangements[1],project.arrangements[0]],seconds=chorus.duration+2*verse.duration,playbackSeconds=Math.ceil((seconds+1.8)*44100)/44100;
  const blocks=p.locator('.song-overview-block[data-section-id]');assert.equal(await blocks.count(),2);assert.equal(await p.locator('.song-tail').count(),1);
  const overview=await p.evaluate(()=>Array.from(document.querySelectorAll('.song-overview-block[data-section-id]')).map(b=>({width:b.getBoundingClientRect().width,name:b.querySelector('strong').textContent,meta:b.textContent,marks:b.querySelectorAll('.song-repeat-marks i').length})));
  assert.deepEqual(overview.map(b=>[b.name,b.marks]),[['Chorus',0],['Verse',2]]);
  assert.ok(Math.abs(overview[1].width/overview[0].width-2*verse.duration/chorus.duration)<.03);
  assert.match(overview[0].meta,/v\d+.*BPM/);assert.match(overview[1].meta,/BPM.*major/);
  await blocks.first().click({position:{x:overview[0].width*.5,y:35}});assert.ok(Math.abs(Number(await p.locator('#songSeek').inputValue())-chorus.duration*.5)<.05);
  await blocks.nth(1).click({position:{x:overview[1].width*.75,y:35}});
  assert.ok(Math.abs(Number(await p.locator('#songSeek').inputValue())-(chorus.duration+1.5*verse.duration))<.05);
  assert.ok(await p.evaluate(expected=>Math.abs(parseFloat(document.querySelector('#songOverviewTrack').style.getPropertyValue('--song-playhead'))-expected)<1,(chorus.duration+1.5*verse.duration)/playbackSeconds*100));
  assert.equal(await p.textContent('#songTotal'),String(Math.floor(playbackSeconds/60)).padStart(2,'0')+':'+String(Math.floor(playbackSeconds%60)).padStart(2,'0'));
  await p.locator('#songSeek').focus();await p.keyboard.press('Home');assert.equal(Number(await p.locator('#songSeek').inputValue()),0);
  await p.keyboard.press('End');assert.ok(Math.abs(Number(await p.locator('#songSeek').inputValue())-playbackSeconds)<.05);
  await p.keyboard.press('Home');
  const midi=(await save(p,()=>p.click('#saveSongMidi'))).bytes,tracks=midiTracks(midi),tempos=tracks[0].filter(e=>e.type===81),keys=tracks[0].filter(e=>e.type===89),markers=tracks[0].filter(e=>e.type===6);
  const t1=Math.round(chorus.duration*chorus.tempoBpm/60*480),t2=t1+Math.round(verse.duration*verse.tempoBpm/60*480);
  assert.deepEqual(tempos.map(e=>e.tick),[0,t1,t2]);assert.deepEqual(tempos.map(e=>e.data.readUIntBE(0,3)),[Math.round(60000000/chorus.tempoBpm),Math.round(60000000/verse.tempoBpm),Math.round(60000000/verse.tempoBpm)]);
  assert.deepEqual(keys.map(e=>e.tick),[0,t1,t2]);assert.deepEqual(markers.map(e=>e.data.toString()),['Chorus','Verse 1/2','Verse 2/2']);
  const notes=tracks[1].filter(e=>(e.status&240)===144),expected=[{at:0,a:chorus},{at:t1,a:verse},{at:t2,a:verse}];for(const {at,a} of expected){assert.ok(notes.some(e=>e.tick===at+Math.round(a.parts.lead.notes[0].start*a.tempoBpm/60*480) && e.note===a.parts.lead.notes[0].midi));}
  assert.equal(tracks.length,5);assert.ok(tracks[4].some(e=>(e.status&15)===9 && (e.status&240)===144));
  const exported=(await save(p,()=>p.click('#saveSongWav'))).bytes;await ready(p);assert.equal(exported.readUInt16LE(22),2);assert.equal(exported.readUInt32LE(24),44100);assert.equal(exported.length,44+Math.ceil((seconds+1.8)*44100)*4);assert.ok(Math.abs(Number(await p.locator('#songSeek').getAttribute('max'))-(exported.length-44)/4/44100)<1/44100);
  await p.click('#playSong');await ready(p);await p.waitForFunction(()=>window.playedMix?.[0]?.length>0);const played=await p.evaluate(()=>{const len=playedMix[0].length,points=new Set([0,1,len-1]);for(let i=0;i<1000;i++)points.add(Math.floor(i*(len-1)/999));return {len,points:Array.from(points).map(i=>[i,playedMix[0][i],playedMix[1][i]])};});assert.equal(played.len,(exported.length-44)/4);for(const [i,l,r] of played.points){assert.ok(Math.abs(exported.readInt16LE(44+i*4)/32767-l)<1/32767);assert.ok(Math.abs(exported.readInt16LE(46+i*4)/32767-r)<1/32767);}await p.waitForFunction(()=>Number(document.querySelector('#songSeek').value)>.15);assert.ok(await p.evaluate(()=>parseFloat(document.querySelector('#songOverviewTrack').style.getPropertyValue('--song-playhead'))>0));
  await blocks.nth(1).click({position:{x:overview[1].width*.75,y:35}});await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,chorus.duration+1.5*verse.duration);assert.equal(await p.textContent('#status'),'Playing whole song.');
  await p.click('#stopSong');await ready(p);assert.equal(Number(await p.locator('#songSeek').inputValue()),0);await p.waitForFunction(()=>songContexts.every(c=>c.state==='closed'));assert.ok(await p.evaluate(()=>songContexts.flatMap(c=>c.songNodes).every(n=>n.wasStopped&&n.wasDisconnected)));
  await p.locator('#songSeek').evaluate(el=>{el.value='.5';el.dispatchEvent(new Event('input',{bubbles:true}));});
  await p.click('#playSong');await ready(p);await p.waitForFunction(()=>Math.abs(songStarts.at(-1)-.5)<.05);await p.click('#stopSong');await ready(p);
  await p.locator('#songLoopMode').selectOption('full');assert.equal(await p.locator('#songLoopRange').isVisible(),true);assert.equal(await p.isEnabled('#saveSongLoopWav'),true);
  checkLoopWav(await save(p,()=>p.click('#saveSongLoopWav')),exported,'full',0,playbackSeconds);await ready(p);
  const fullLoopMidi=await save(p,()=>p.click('#saveSongLoopMidi'));assert.match(fullLoopMidi.name,/-song-loop-full-0ms-\d+ms\.mid$/);assert.ok(fullLoopMidi.bytes.equals(midi));await ready(p);
  assert.ok(await p.evaluate(()=>Math.abs(parseFloat(document.querySelector('#songOverviewTrack').style.getPropertyValue('--song-loop-end'))-100)<.001));
  await p.click('#playSong');await ready(p);await p.waitForFunction(()=>songDurations.at(-1)!==null);
  assert.ok(await p.evaluate(d=>Math.abs(songDurations.at(-1)-d)<.01,playbackSeconds));
  const fullCount=await p.evaluate(()=>songStarts.length);await p.evaluate(()=>songContexts.flatMap(c=>c.songNodes).at(-1).onended());
  await p.waitForFunction(n=>songStarts.length===n+1,fullCount);assert.ok(await p.evaluate(()=>Math.abs(songStarts.at(-1))<.01));
  await p.click('#stopSong');await ready(p);
  await p.locator('#songLoopMode').selectOption('section');await p.locator('#songLoopSection').selectOption(project.timeline[1].id);
  const sectionBounds=await p.evaluate(()=>{const o=document.querySelector('#songOverviewTrack').style;return [parseFloat(o.getPropertyValue('--song-loop-start')),parseFloat(o.getPropertyValue('--song-loop-end'))];});
  assert.ok(Math.abs(sectionBounds[0]-chorus.duration/playbackSeconds*100)<.01);
  assert.ok(Math.abs(sectionBounds[1]-seconds/playbackSeconds*100)<.01);
  checkLoopWav(await save(p,()=>p.click('#saveSongLoopWav')),exported,'section-Verse',chorus.duration,seconds);await ready(p);
  const sectionMidi=await save(p,()=>p.click('#saveSongLoopMidi')),sectionTracks=midiTracks(sectionMidi.bytes),verseTicks=Math.round(verse.duration*verse.tempoBpm/60*480);
  assert.match(sectionMidi.name,/-song-loop-section-Verse-\d+ms-\d+ms\.mid$/);
  assert.deepEqual(sectionTracks[0].filter(e=>e.type===81).map(e=>e.tick),[0,verseTicks]);
  assert.deepEqual(sectionTracks[0].filter(e=>e.type===89).map(e=>e.tick),[0,verseTicks]);
  assert.deepEqual(sectionTracks[0].filter(e=>e.type===6).map(e=>e.data.toString()),['Verse 1/2','Verse 2/2']);
  assert.deepEqual(sectionTracks[1].filter(e=>(e.status&240)===192).map(e=>[e.tick,e.program]),[[0,tracks[1].find(e=>e.tick===t1&&(e.status&240)===192).program],[verseTicks,tracks[1].find(e=>e.tick===t2&&(e.status&240)===192).program]]);
  assert.deepEqual(sectionTracks[1].filter(e=>(e.status&240)===176&&e.note===7).map(e=>[e.tick,e.value]),[[0,Math.round(verse.parts.lead.volume*127)],[verseTicks,Math.round(verse.parts.lead.volume*127)]]);
  assert.ok(sectionTracks[1].filter(e=>(e.status&240)===144).some(e=>e.tick===verseTicks+Math.round(verse.parts.lead.notes[0].start*verse.tempoBpm/60*480)));await ready(p);
  await p.click('#playSong');await ready(p);await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,chorus.duration);
  assert.ok(await p.evaluate(span=>Math.abs(songDurations.at(-1)-span)<.01,2*verse.duration));
  const sectionCount=await p.evaluate(()=>songStarts.length);await p.evaluate(()=>songContexts.flatMap(c=>c.songNodes).at(-1).onended());
  await p.waitForFunction(n=>songStarts.length===n+1,sectionCount);assert.ok(await p.evaluate(target=>Math.abs(songStarts.at(-1)-target)<.05,chorus.duration));
  await p.click('#stopSong');await ready(p);
  await p.locator('#songLoopMode').selectOption('custom');
  const startSlider=p.locator('#songLoopStart'),endSlider=p.locator('#songLoopEnd');
  await startSlider.focus();await p.keyboard.press('ArrowRight');assert.ok(Number(await startSlider.inputValue())>0);
  const beforeTouch=Number(await startSlider.inputValue());await startSlider.tap({position:{x:Math.round((await startSlider.boundingBox()).width*.28),y:20}});assert.ok(Number(await startSlider.inputValue())>beforeTouch);
  await endSlider.tap({position:{x:Math.round((await endSlider.boundingBox()).width*.72),y:20}});
  const customStart=Number(await startSlider.inputValue()),customEnd=Number(await endSlider.inputValue());assert.ok(customEnd>customStart+.01&&customEnd<playbackSeconds);
  const customBounds=await p.evaluate(()=>{const o=document.querySelector('#songOverviewTrack').style;return [parseFloat(o.getPropertyValue('--song-loop-start')),parseFloat(o.getPropertyValue('--song-loop-end'))];});
  assert.ok(Math.abs(customBounds[0]-customStart/playbackSeconds*100)<.01&&Math.abs(customBounds[1]-customEnd/playbackSeconds*100)<.01);
  assert.ok(await p.evaluate(()=>{const track=document.querySelector('#songOverviewTrack').getBoundingClientRect(),shade=document.querySelector('#songLoopRange').getBoundingClientRect(),start=Number(document.querySelector('#songLoopStart').value),end=Number(document.querySelector('#songLoopEnd').value),duration=Number(document.querySelector('#songSeek').max);return Math.abs((shade.left-track.left)/track.width-start/duration)<.005&&Math.abs(shade.width/track.width-(end-start)/duration)<.005;}));
  await p.click('#playSong');await ready(p);await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,customStart);
  assert.ok(await p.evaluate(span=>Math.abs(songDurations.at(-1)-span)<.01,customEnd-customStart));
  await p.locator('#songSeek').evaluate((el,value)=>{el.value=String(value);el.dispatchEvent(new Event('input',{bubbles:true}));},Number((customEnd+.2).toFixed(2)));await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,customStart);
  await p.click('#stopSong');await ready(p);assert.equal(await p.locator('#songLoopMode').inputValue(),'custom');
  // All precision editors write the same temporary range, including keyboard and overview markers.
  await p.locator('#songLoopStartField').fill('00:01.234');await p.locator('#songLoopStartField').press('Tab');
  await p.locator('#songLoopEndField').fill('4.567');await p.locator('#songLoopEndField').press('Tab');
  assert.ok(Math.abs(Number(await startSlider.inputValue())-1.234)<.001);assert.ok(Math.abs(Number(await endSlider.inputValue())-4.567)<.001);
  assert.equal(await p.locator('#songLoopStartTime').textContent(),'00:01.234');assert.equal(await p.locator('#songLoopEndField').inputValue(),'00:04.567');
  checkLoopWav(await save(p,()=>p.click('#saveSongLoopWav')),exported,'custom',1.234,4.567);await ready(p);assert.deepEqual(await manifest(p),project);
  assert.ok(await p.evaluate(()=>{const track=document.querySelector('#songOverviewTrack').getBoundingClientRect(),marker=document.querySelector('#songLoopStartMarker').getBoundingClientRect(),duration=Number(document.querySelector('#songSeek').max);return Math.abs((marker.left+marker.width/2-track.left)/track.width-1.234/duration)<.002;}));
  await p.locator('#songLoopStartField').fill('99:00');await p.locator('#songLoopStartField').press('Tab');assert.equal(await p.locator('#songLoopStartField').getAttribute('aria-invalid'),'true');assert.ok(Math.abs(Number(await startSlider.inputValue())-1.234)<.001);
  await p.locator('#songLoopStartMarker').focus();await p.keyboard.press('ArrowRight');assert.ok(Math.abs(Number(await startSlider.inputValue())-1.244)<.001);
  await p.keyboard.press('Shift+ArrowLeft');assert.ok(Math.abs(Number(await startSlider.inputValue())-.244)<.001);
  await p.locator('#songSeek').evaluate(el=>{el.value='2.34';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.click('#songLoopSetStart');assert.ok(Math.abs(Number(await startSlider.inputValue())-2.34)<.001);
  await p.locator('#songSeek').evaluate(el=>{el.value='5.67';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.locator('#songLoopSetStart').focus();await p.keyboard.press('o');assert.ok(Math.abs(Number(await endSlider.inputValue())-5.67)<.001);
  await p.locator('#songSeek').evaluate(el=>{el.value='1.11';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.keyboard.press('i');assert.ok(Math.abs(Number(await startSlider.inputValue())-1.11)<.001);
  await p.locator('#songLoopSnap').check();await p.locator('#songLoopEndField').fill(seconds.toFixed(3));await p.locator('#songLoopEndField').press('Tab');
  async function dragMarker(marker,target,offset=0){await p.locator(marker).scrollIntoViewIfNeeded();const track=await p.locator('#songOverviewTrack').boundingBox(),box=await p.locator(marker).boundingBox(),x=track.x+target/playbackSeconds*track.width+offset;await p.mouse.move(box.x+box.width/2,box.y+box.height/2);await p.mouse.down();await p.mouse.move(x,box.y+box.height/2,{steps:4});await p.mouse.up();}
  await dragMarker('#songLoopStartMarker',chorus.duration+verse.duration,5);assert.ok(Math.abs(Number(await startSlider.inputValue())-(chorus.duration+verse.duration))<.001);
  await dragMarker('#songLoopEndMarker',seconds,4);assert.ok(Math.abs(Number(await endSlider.inputValue())-seconds)<.001);
  await dragMarker('#songLoopStartMarker',chorus.duration+verse.duration+.45);assert.ok(Math.abs(Number(await startSlider.inputValue())-(chorus.duration+verse.duration+.45))<.05);
  await p.locator('#songLoopSnap').uncheck();await dragMarker('#songLoopStartMarker',chorus.duration+verse.duration+.08);assert.ok(Math.abs(Number(await startSlider.inputValue())-(chorus.duration+verse.duration+.08))<.05);
  await p.locator('#songLoopEndField').fill(playbackSeconds.toFixed(3));await p.locator('#songLoopEndField').press('Tab');const startsBefore=await p.evaluate(()=>songStarts.length);await p.click('#playSong');await ready(p);await p.waitForFunction(n=>songStarts.length>n,startsBefore);
  const liveLoop=await p.evaluate(()=>{const seek=document.querySelector('#songSeek'),target=Math.min(Number(seek.max)-1,Number(document.querySelector('#songLoopStart').value)+.5);seek.value=String(target);seek.dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#songLoopSetStart').click();return {last:songStarts.at(-1),start:Number(document.querySelector('#songLoopStart').value)};});assert.ok(Math.abs(liveLoop.last-liveLoop.start)<.08,JSON.stringify(liveLoop));await p.click('#stopSong');await ready(p);
  const firstChorus=chorus.parts.lead.notes[0],firstVerse=verse.parts.lead.notes[0];
  const cutStart=Number((firstChorus.start+firstChorus.dur/2).toFixed(3)),cutEnd=Number((chorus.duration+firstVerse.start+firstVerse.dur/2).toFixed(3));
  assert.ok(cutStart>firstChorus.start&&cutStart<firstChorus.start+firstChorus.dur&&cutEnd>chorus.duration+firstVerse.start&&cutEnd<chorus.duration+firstVerse.start+firstVerse.dur);
  await p.locator('#songLoopStartField').fill(String(cutStart));await p.locator('#songLoopStartField').press('Tab');
  await p.locator('#songLoopEndField').fill(String(cutEnd));await p.locator('#songLoopEndField').press('Tab');
  await p.evaluate(()=>{const original=ScuLaFolder.save;ScuLaFolder.save=async(name,blob,options)=>{window.loopMidiSave={name,type:blob.type,directories:options.directories};ScuLaFolder.save=original;return original(name,blob,options);};});
  const customMidi=await save(p,()=>p.click('#saveSongLoopMidi')),customTracks=midiTracks(customMidi.bytes),startTick=Math.round(cutStart*chorus.tempoBpm/60*480),endTick=t1+Math.round((cutEnd-chorus.duration)*verse.tempoBpm/60*480),join=t1-startTick;
  assert.match(customMidi.name,new RegExp('-song-loop-custom-'+Math.round(cutStart*1000)+'ms-'+Math.round(cutEnd*1000)+'ms\\.mid$'));
  assert.deepEqual(await p.evaluate(()=>loopMidiSave),{name:customMidi.name,type:'audio/midi',directories:[customMidi.name.split('-song-loop-custom-')[0],'exports']});
  assert.deepEqual(customTracks[0].filter(e=>e.type===81).map(e=>[e.tick,e.data.readUIntBE(0,3)]),[[0,Math.round(60000000/chorus.tempoBpm)],[join,Math.round(60000000/verse.tempoBpm)]]);
  assert.deepEqual(customTracks[0].filter(e=>e.type===89).map(e=>[e.tick,...e.data]),[[0,...keys[0].data],[join,...keys[1].data]]);
  assert.deepEqual(customTracks[1].filter(e=>(e.status&240)===192).map(e=>[e.tick,e.program]),[[0,tracks[1].find(e=>(e.status&240)===192).program],[join,tracks[1].find(e=>e.tick===t1&&(e.status&240)===192).program]]);
  assert.deepEqual(customTracks[1].filter(e=>(e.status&240)===176&&e.note===7).map(e=>[e.tick,e.value]),[[0,Math.round(chorus.parts.lead.volume*127)],[join,Math.round(verse.parts.lead.volume*127)]]);
  for(let i=1;i<5;i++){
    for(const kind of [192,176]){
      const select=es=>es.filter(e=>(e.status&240)===kind&&(kind===192||e.note===7));
      const value=e=>kind===192?e.program:e.value;
      assert.deepEqual(select(customTracks[i]).map(e=>[e.tick,value(e)]),[[0,value(select(tracks[i]).find(e=>e.tick===0))],[join,value(select(tracks[i]).find(e=>e.tick===t1))]]);
    }
  }
  const customOn=customTracks[1].filter(e=>(e.status&240)===144),customOff=customTracks[1].filter(e=>(e.status&240)===128);
  assert.ok(customOn.some(e=>e.tick===0&&e.note===firstChorus.midi),'note crossing the start is clipped to zero');
  assert.ok(customOff.some(e=>e.tick===Math.round((firstChorus.start+firstChorus.dur)*chorus.tempoBpm/60*480)-startTick&&e.note===firstChorus.midi));
  assert.ok(customOn.some(e=>e.tick===t1+Math.round(firstVerse.start*verse.tempoBpm/60*480)-startTick&&e.note===firstVerse.midi));
  assert.ok(customOff.some(e=>e.tick===endTick-startTick&&e.note===firstVerse.midi),'note crossing the end is clipped to the range');await ready(p);
  assert.ok((await save(p,()=>p.click('#saveSongMidi'))).bytes.equals(midi));assert.ok((await save(p,()=>p.click('#saveSongWav'))).bytes.equals(exported));
  await p.locator('#songLoopMode').selectOption('off');assert.equal(await p.isDisabled('#saveSongLoopWav'),true);assert.equal(await p.isDisabled('#saveSongLoopMidi'),true);await p.getByRole('button',{name:'Play from here · Verse'}).click();await ready(p);await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,chorus.duration);await p.click('#stopSong');await ready(p);
  await p.evaluate(()=>{window.normalTimer=window.setTimeout;window.setTimeout=(fn,ms,...args)=>normalTimer(fn,ms===0?100:ms,...args);});
  await p.click('#playSong');await p.waitForFunction(()=>document.querySelector('#status').textContent==='Rendering whole song…');assert.equal(await p.isEnabled('#stopSong'),true);await p.click('#stopSong');await ready(p);await p.evaluate(()=>{window.setTimeout=normalTimer;});await p.waitForFunction(()=>songContexts.every(c=>c.state==='closed'));assert.equal(Number(await p.locator('#songSeek').inputValue()),0);
  const files=[];for(let i=0;i<2;i++){const source=await save(p,()=>p.locator('.take').nth(i).getByRole('button',{name:'Save WAV',exact:true}).click());assert.ok(source.bytes.equals(sources[i]));files.push(data(project.recordings[i].source.filename,source.bytes));}
  await p.locator('#songSeek').focus();await p.keyboard.press('End');assert.deepEqual((await manifest(p)).timeline,project.timeline);
  await p.reload();await ready(p);assert.deepEqual((await manifest(p)).timeline,project.timeline);assert.equal(Number(await p.locator('#songSeek').inputValue()),0);assert.equal(await p.locator('#songLoopMode').inputValue(),'off');
  await p.setInputFiles('#backupJson',{name:'project.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(project))});await p.setInputFiles('#backupWavs',files);await p.click('#validateBackup');await ready(p);assert.equal(await p.isEnabled('#restoreBackup'),true,await p.textContent('#backupSummary'));await p.click('#restoreBackup');await ready(p);
  const restored=await manifest(p);assert.deepEqual(restored.timeline.map(s=>[s.name,s.repeats]),project.timeline.map(s=>[s.name,s.repeats]));assert.notDeepEqual(restored.timeline.map(s=>s.id),project.timeline.map(s=>s.id));assert.deepEqual(restored.timeline.map(s=>s.arrangementId),restored.arrangements.map(a=>a.id).reverse());
  assert.ok((await save(p,()=>p.click('#saveSongMidi'))).bytes.equals(midi));assert.ok((await save(p,()=>p.click('#saveSongWav'))).bytes.equals(exported));for(let i=0;i<2;i++)assert.ok((await save(p,()=>p.locator('.take').nth(i).getByRole('button',{name:'Save WAV',exact:true}).click())).bytes.equals(sources[i]));
  const links=restored.timeline.map(s=>s.arrangementId);await p.locator('.take').first().getByLabel('Lead Volume',{exact:true}).evaluate(el=>{el.value=.4;el.dispatchEvent(new Event('change',{bubbles:true}));});await ready(p);assert.deepEqual((await manifest(p)).timeline.map(s=>s.arrangementId),links);const linkedMidi=midiTracks((await save(p,()=>p.click('#saveSongMidi'))).bytes);assert.deepEqual(linkedMidi[1].filter(e=>(e.status&240)===176 && e.note===7).map(e=>e.value),[Math.round(chorus.parts.lead.volume*127),51,51]);
  const invalid=structuredClone(project);invalid.timeline[0].arrangementId='missing-version';await p.setInputFiles('#backupJson',{name:'invalid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(invalid))});await p.setInputFiles('#backupWavs',files);await p.click('#validateBackup');await ready(p);assert.equal(await p.isEnabled('#restoreBackup'),false);assert.deepEqual((await manifest(p)).timeline.map(s=>s.arrangementId),links);
  await p.click('#navLangBtn');await p.waitForFunction(()=>document.documentElement.lang==='ro');assert.equal(await p.getByRole('button',{name:'Salvează WAV-ul melodiei',exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Salvează bucla ca WAV stereo',exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Salvează bucla ca MIDI cu mai multe piste',exact:true}).count(),1);assert.equal(await p.getByLabel('Caută în melodie',{exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:/Redă de aici/}).count(),2);
  assert.equal(await p.getByRole('button',{name:'Pune începutul la cursor (I)'}).count(),1);assert.equal(await p.getByLabel('Timp sfârșit (mm:ss.mmm)').count(),1);assert.equal(await p.getByLabel('Aliniază la secțiuni și repetări').count(),1);
  await p.setViewportSize({width:390,height:844});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await p.evaluate(()=>document.querySelector('.song-overview').scrollWidth>document.querySelector('.song-overview-scroll').clientWidth));
  await p.getByLabel('Buclă melodie',{exact:true}).selectOption('custom');assert.equal(await p.getByLabel('Începutul buclei',{exact:true}).count(),1);
  const roStart=p.locator('#songLoopStart');await roStart.tap({position:{x:Math.round((await roStart.boundingBox()).width*.3),y:20}});assert.ok(Number(await roStart.inputValue())>0);
  await p.locator('#songLoopStartField').fill('00:01.250');await p.locator('#songLoopStartField').press('Tab');assert.ok(Math.abs(Number(await roStart.inputValue())-1.25)<.001);
  await p.locator('#songLoopSnap').check();await p.locator('#songLoopEndField').fill(seconds.toFixed(3));await p.locator('#songLoopEndField').press('Tab');await dragMarker('#songLoopStartMarker',chorus.duration,4);assert.ok(Math.abs(Number(await roStart.inputValue())-chorus.duration)<.001,JSON.stringify({actual:Number(await roStart.inputValue()),expected:chorus.duration}));
  await p.locator('#songSeek').evaluate(el=>{el.value='2.2';el.dispatchEvent(new Event('input',{bubbles:true}));});await p.getByRole('button',{name:'Pune începutul la cursor (I)'}).tap();assert.ok(Math.abs(Number(await roStart.inputValue())-2.2)<.02);
  await p.getByLabel('Buclă melodie',{exact:true}).selectOption('section');assert.equal(await p.getByLabel('Secțiunea buclei',{exact:true}).count(),1);
  await p.locator('.song-overview-block[data-section-id]').first().tap();assert.ok(Number(await p.locator('#songSeek').inputValue())>0);
  await p.getByRole('button',{name:/Redă de aici · Verse/}).tap();await p.waitForFunction(target=>Math.abs(songStarts.at(-1)-target)<.05,chorus.duration);await p.click('#stopSong');await p.waitForFunction(()=>document.querySelector('#recordState').textContent==='Pregătit');
  await p.click('#navLangBtn');await p.waitForFunction(()=>document.documentElement.lang==='en');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.equal(await p.getByRole('button',{name:'Save loop stereo WAV',exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Save loop multitrack MIDI',exact:true}).count(),1);assert.equal(await p.getByRole('button',{name:'Set end at playhead (O)'}).count(),1);assert.equal(await p.getByLabel('Start time (mm:ss.mmm)').count(),1);
  assert.deepEqual(errors,[]);await ctx.close();console.log('PASS  sections/repeats, full/section/custom loop WAV and MIDI ranges, clipped notes and tempo/key/program/volume state, playback/Stop, reload/backup, immutable WAVs, RO/EN phone file://');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
