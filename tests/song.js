// /apptest song — real fake-device capture, PCM bytes, project recovery and save routes.
const fs=require('fs'),path=require('path'),assert=require('assert');
const {chromium}=require('playwright');
const http=require('http');
let URL;
const server=http.createServer((req,res)=>{const target=path.resolve(__dirname,'..','.'+decodeURIComponent(req.url.split('?')[0]));if(!target.startsWith(path.resolve(__dirname,'..')+path.sep)){res.writeHead(403);res.end();return;}fs.readFile(target,(err,data)=>{if(err){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',target.endsWith('.js')?'text/javascript':'text/html');res.end(data);});});
let failed=0;
function check(name,cond,detail=''){console.log((cond?'PASS  ':'FAIL  ')+name+(cond?'':' '+detail));if(!cond)failed++;}
async function records(page){return page.evaluate(()=>new Promise((resolve,reject)=>{const r=indexedDB.open('scula-song',1);r.onsuccess=()=>{const db=r.result,req=db.transaction('projects').objectStore('projects').getAll();req.onsuccess=()=>{db.close();resolve(req.result);};req.onerror=reject;};r.onerror=reject;}));}
async function record(page,name='Hum',purpose='melody'){
 await page.fill('#takeName',name);await page.selectOption('#purpose',purpose);
 await page.click('#recordBtn');await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Recording');
 check('recording controls transition',await page.isDisabled('#recordBtn') && !await page.isDisabled('#stopBtn') && await page.getAttribute('#recordBtn','aria-pressed')==='true');
 await page.waitForTimeout(1350);check('timer advances',await page.textContent('#timer')!=='00:00');
 await page.click('#stopBtn');await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
 check('stop returns controls to idle',!await page.isDisabled('#recordBtn') && await page.isDisabled('#stopBtn'));
}
async function init(page,url=URL){await page.goto(url);await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Pregătit');await page.click('#navLangBtn');await page.waitForFunction(()=>document.documentElement.lang==='en');}
function wavCheck(b){
 const ch=b.readUInt16LE(22),sr=b.readUInt32LE(24),n=b.readUInt32LE(40),align=b.readUInt16LE(32);
 check('real RIFF/WAVE PCM24 structure',b.toString('ascii',0,4)==='RIFF' && b.toString('ascii',8,12)==='WAVE' && b.toString('ascii',12,16)==='fmt ' && b.toString('ascii',36,40)==='data' && b.readUInt16LE(20)===1 && b.readUInt16LE(34)===24);
 check('header matches PCM payload and padding',n+44+(n%2)===b.length && b.readUInt32LE(4)===b.length-8 && align===ch*3 && n%align===0 && b.readUInt32LE(28)===sr*align);
 let peak=0;for(let o=44;o<44+n;o+=3)peak=Math.max(peak,Math.abs(b.readIntLE(o,3)));
 check('captured audio is non-silent',peak>1000);check('valid rate/channels',sr>=8000 && sr<=192000 && [1,2].includes(ch));
 return {ch,sr,n,frames:n/align,duration:n/(sr*align)};
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));URL='http://127.0.0.1:'+server.address().port+'/song.html';
 const browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const ctx=await browser.newContext({viewport:{width:1100,height:1000},acceptDownloads:true});const page=await ctx.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.songStreams=[];window.songContexts=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async opts=>{const stream=await get(opts);window.songStreams.push(stream);return stream;};const Original=window.AudioContext;window.AudioContext=class extends Original{constructor(...args){super(...args);window.songContexts.push(this);}};window.MediaRecorder=undefined;});
 await init(page);check('RO/EN title and navigation',await page.textContent('h1')==='Song Creation' && await page.textContent('#site-nav [data-page="song.html"]')==='Song Creation');
 await page.fill('#projectName','../My:Song');await page.click('#renameProject');await page.waitForFunction(()=>document.querySelector('#currentProject').textContent==='../My:Song');
 await page.click('#enableMic');await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');
 check('microphone enumeration after permission',await page.locator('#microphone option').count()>1);
 await page.selectOption('#microphone',{index:1});
 await record(page);
 check('microphone tracks and contexts released after Stop',await page.evaluate(()=>window.songStreams.every(s=>s.getTracks().every(t=>t.readyState==='ended')) && window.songContexts.every(c=>c.state==='closed')));
 check('recording appears with playback and waveform',await page.locator('.take').count()===1 && await page.locator('.take audio[src]').count()===1 && await page.locator('.take canvas').count()===1);
 let ps=await records(page),p=ps[0],r=p.recordings[0];
 check('source metadata, purpose and future seam',r.purpose==='melody' && r.source.immutable && r.performance===null && Array.isArray(r.derivedAssets));
 check('music processing actually disabled',r.source.inputSettings.echoCancellation===false && r.source.inputSettings.noiseSuppression===false && r.source.inputSettings.autoGainControl===false,JSON.stringify(r.source.inputSettings));
 check('preferred AudioWorklet backend',r.source.captureBackend==='AudioWorklet',r.source.captureBackend);
 check('quality details report effective settings',/WAV rate: \d+ Hz/.test(await page.textContent('#quality')) && /off \/ off \/ off/.test(await page.textContent('#quality')));
 // PCM endpoint/interleaving and odd-byte RIFF padding regression on the shared helper.
 const edge=await page.evaluate(async()=>{const pcm=ScuLaPCM.pack24([Float32Array.from([-1,0,1]),Float32Array.from([.5,-.5,0])]);const mono=ScuLaPCM.wav([new Uint8Array(3)],3,44100,1);return {bytes:[...pcm],wav:[...new Uint8Array(await mono.arrayBuffer())]};});
 const edgeBuf=Buffer.from(edge.bytes);check('PCM signed endpoints and stereo interleaving',edgeBuf.readIntLE(0,3)===-8388608 && edgeBuf.readIntLE(3,3)===4194304 && edgeBuf.readIntLE(12,3)===8388607);
 check('odd mono data chunk is padded correctly',edge.wav.length===48 && Buffer.from(edge.wav).readUInt32LE(4)===40 && Buffer.from(edge.wav).readUInt32LE(40)===3);
 const downloadPromise=page.waitForEvent('download');await page.locator('.take button').filter({hasText:'Save WAV'}).click();const download=await downloadPromise,b=fs.readFileSync(await download.path());const w=wavCheck(b);
 check('metadata agrees with WAV',r.sampleRate===w.sr && r.channelCount===w.ch && Math.abs(r.duration-w.duration)<1e-9 && r.source.size===b.length);
 check('unsafe names sanitized and ownership retained',!/[\\/:]/.test(download.suggestedFilename()) && download.suggestedFilename().includes(p.id) && download.suggestedFilename().includes(r.id));
 const decoded=await page.evaluate(async id=>{const db=await new Promise(resolve=>{const r=indexedDB.open('scula-song');r.onsuccess=()=>resolve(r.result);});const blob=await new Promise(resolve=>{const r=db.transaction('audio').objectStore('audio').get(id);r.onsuccess=()=>resolve(r.result);});db.close();const ac=new AudioContext({sampleRate:48000});try{const a=await ac.decodeAudioData(await blob.arrayBuffer());return {duration:a.duration,channels:a.numberOfChannels};}finally{await ac.close();}},r.id);
 check('browser Web Audio decodes captured WAV',Math.abs(decoded.duration-w.duration)<.001 && decoded.channels===w.ch);
 await page.locator('.take audio').evaluate(a=>a.play());await page.waitForFunction(()=>document.querySelector('.take audio').currentTime>0);check('recorded WAV plays',await page.locator('.take audio').evaluate(a=>!a.paused));
 await page.selectOption('#purpose','sample');await page.fill('#instrument','Violin');await page.fill('#note','A4');await page.fill('#midiNote','69');await page.fill('#articulation','pizzicato');await page.fill('#dynamic','soft');await page.fill('#notes','Own instrument');await record(page,'Pluck','sample');
 check('multiple takes in one project',await page.locator('.take').count()===2);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');await page.waitForSelector('.take audio[src]');
 ps=await records(page);p=ps[0];check('metadata and audio persist on reload',p.name==='../My:Song' && p.recordings.length===2 && await page.locator('.take audio[src]').count()===2);
 check('sample details persist',JSON.stringify(p.recordings[1].sample)===JSON.stringify({instrument:'Violin',note:'A4',midiNote:69,articulation:'pizzicato',dynamic:'soft',notes:'Own instrument'}));
 check('selected microphone remembered locally',await page.evaluate(()=>!!localStorage.getItem('scula:song:mic')));
 check('no large audio in localStorage',await page.evaluate(()=>Object.keys(localStorage).every(k=>localStorage.getItem(k).length<10000)));
 // Actual folder routing with in-memory directory handles; no alternate app saver.
 await page.evaluate(()=>{window.savedFiles={};function directory(prefix,name){return {name,queryPermission:async()=> 'granted',requestPermission:async()=> 'granted',getDirectoryHandle:async n=>directory(prefix+n+'/',n),getFileHandle:async(n,opts)=>{if(!opts && !window.savedFiles[prefix+n])throw new DOMException('missing','NotFoundError');return {createWritable:async()=>({write:async b=>{window.savedFiles[prefix+n]=[...new Uint8Array(await b.arrayBuffer())];},close:async()=>{}})};}};}window.showDirectoryPicker=async()=>directory('','Root');});
 await page.click('#navFolderBtn');await page.waitForFunction(()=>ScuLaFolder.mode()==='folder');
 await page.locator('.take').nth(1).getByRole('button',{name:'Save WAV',exact:true}).click();await page.waitForFunction(()=>Object.keys(window.savedFiles).length===1);
 await page.click('#exportProject');await page.waitForFunction(()=>Object.keys(window.savedFiles).length===2);
 const paths=await page.evaluate(()=>Object.keys(window.savedFiles));check('ScuLaFolder nested project/sample/metadata routes',paths.some(s=>/^Song Creation\/[^/]+\/samples\/[^/]+\.wav$/.test(s)) && paths.some(s=>/^Song Creation\/[^/]+\/[^/]+-project\.json$/.test(s)),paths.join(' | '));
 const manifest=await page.evaluate(()=>{const bytes=Object.entries(window.savedFiles).find(([k])=>k.endsWith('.json'))[1];return JSON.parse(new TextDecoder().decode(new Uint8Array(bytes)));});check('project manifest references immutable WAV assets',manifest.recordings.every(r=>r.source.filename.includes(r.id) && r.source.relativePath.endsWith(r.source.filename)));
 let confirmOnce=msg=>{check('delete asks confirmation',/Delete/.test(msg.message()));return msg.dismiss();};page.once('dialog',confirmOnce);await page.locator('.take').first().getByRole('button',{name:'Delete',exact:true}).click();check('cancel delete keeps take',await page.locator('.take').count()===2);
 page.once('dialog',d=>d.accept('Renamed hum'));await page.locator('.take').first().getByRole('button',{name:'Rename',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.take h3').textContent==='Renamed hum');
 page.once('dialog',d=>d.accept());await page.locator('.take').first().getByRole('button',{name:'Delete',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.take').length===1);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');check('delete persists without removing other take',await page.locator('.take').count()===1 && (await records(page))[0].recordings[0].name==='Pluck');
 await page.click('#newProject');await page.waitForFunction(()=>document.querySelectorAll('.take').length===0);check('new project retains previous project', (await records(page)).length===2);
 await page.selectOption('#projects',p.id);await page.waitForSelector('.take');check('project switch restores takes',await page.textContent('.take h3')==='Pluck');
 check('no JS errors',errors.length===0,errors.join(' | '));await ctx.close();
 // Mobile layout, share cancellation/fallback, denied APIs, compatibility capture, failed persistence.
 for(const kind of ['mobile','denied','unsupported','fallback','storage']){
  const context=await browser.newContext({viewport:{width:412,height:915},isMobile:kind==='mobile',hasTouch:kind==='mobile',acceptDownloads:true}),q=await context.newPage();const err=[];q.on('pageerror',e=>err.push(e.message));
  if(kind==='denied')await q.addInitScript(()=>{navigator.mediaDevices.getUserMedia=async()=>{throw new DOMException('denied','NotAllowedError');};});
  if(kind==='unsupported')await q.addInitScript(()=>{Object.defineProperty(window,'AudioContext',{value:undefined});Object.defineProperty(window,'webkitAudioContext',{value:undefined});});
  // Real file:// exercises Chromium's Blob-module compatibility fallback.
  if(kind==='storage')await q.addInitScript(()=>{const proto=IDBObjectStore.prototype,put=proto.put;window.songOriginalPut=put;proto.put=function(...args){if(this.name==='audio')throw new DOMException('full','QuotaExceededError');return put.apply(this,args);};});
  await init(q,kind==='fallback'?'file://'+path.resolve(__dirname,'../song.html'):URL);
  if(kind==='denied'){await q.click('#recordBtn');await q.waitForFunction(()=>/denied/.test(document.querySelector('#status').textContent));check('permission denial is useful and retryable',!await q.isDisabled('#recordBtn'));
  }else if(kind==='unsupported'){check('missing APIs degrade gracefully',await q.isDisabled('#recordBtn') && /HTTPS/.test(await q.textContent('#status')));
  }else{
   await record(q,'Test '+kind);
   if(kind==='mobile'){
    check('mobile layout fits viewport',await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await q.evaluate(()=>{window.shareCalls=0;navigator.canShare=()=>true;navigator.share=async({files})=>{window.shareCalls++;window.sharedName=files[0].name;};});
    await q.evaluate(()=>ScuLaFolder.setMode('share'));await q.locator('.take').getByRole('button',{name:'Save WAV',exact:true}).click();await q.waitForFunction(()=>window.shareCalls===1);check('mobile save goes through ScuLaFolder share',await q.evaluate(()=>window.sharedName.endsWith('.wav')));
    await q.evaluate(()=>{navigator.share=async()=>{throw new DOMException('cancel','AbortError');};});let downloads=0;q.on('download',()=>downloads++);await q.locator('.take').getByRole('button',{name:'Save WAV',exact:true}).click();await q.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');check('cancelled mobile share does not download',downloads===0);
    await q.evaluate(()=>{navigator.canShare=()=>false;});const dl=q.waitForEvent('download');await q.locator('.take').getByRole('button',{name:'Save WAV',exact:true}).click();await dl;check('unsupported mobile file share falls back to download',true);
   }else if(kind==='fallback'){check('file:// ScriptProcessor fallback produces PCM WAV', (await records(q))[0].recordings[0].source.captureBackend==='ScriptProcessor');const dl=q.waitForEvent('download');await q.locator('.take').getByRole('button',{name:'Save WAV',exact:true}).click();const d=await dl;wavCheck(fs.readFileSync(await d.path()));}
   else {check('failed audio transaction keeps take and warns',await q.locator('.take').count()===1 && await q.isVisible('#recovery') && /storage failed/.test(await q.textContent('#status')));check('failed transaction does not publish missing source', (await records(q))[0].recordings.length===0);const dl=q.waitForEvent('download');await q.locator('.take').getByRole('button',{name:'Save WAV',exact:true}).click();const d=await dl;wavCheck(fs.readFileSync(await d.path()));await q.evaluate(()=>{IDBObjectStore.prototype.put=window.songOriginalPut;});await q.click('#retry');await q.waitForFunction(()=>document.querySelector('#recovery').hidden);check('retry commits retained WAV and metadata',(await records(q))[0].recordings.length===1);await q.reload();await q.waitForFunction(()=>document.querySelector('#recordState').textContent==='Ready');await q.waitForSelector('.take audio[src]');check('recovered recording survives reload',await q.locator('.take').count()===1);}
  }
  check(kind+' no JS errors',err.length===0,err.join(' | '));await context.close();
 }
 // Nav synchronization includes all nine pages; parse checks live in /verify.
 const files=['voice','editor','index','recipes','calendar','transfer','map','kanban','song'];const blocks=files.map(f=>fs.readFileSync(path.resolve(__dirname,'../'+f+'.html'),'utf8').match(/<nav id="site-nav"[\s\S]*?<!-- ===== end toolbar nav ===== -->/)[0]);check('all nine shared nav blocks byte-identical',blocks.every(b=>b===blocks[0]));
 await browser.close();console.log(failed?`${failed} FAILED`:'all song checks passed');server.close();process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
