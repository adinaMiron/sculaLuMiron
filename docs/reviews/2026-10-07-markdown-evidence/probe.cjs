const fs=require('fs'),path=require('path'),http=require('http');
const ROOT=path.resolve(__dirname,'../../..');
const OUT=process.env.MARKDOWN_REVIEW_OUTPUT||'/tmp/markdown-review-2026-10-07';
fs.mkdirSync(OUT,{recursive:true});
const {chromium}=require(path.join(ROOT,'tests/node_modules/playwright'));
const results={};
let browser,server,url;
async function page(viewport={width:1366,height:900},context){
  const ctx=context||await browser.newContext({viewport,hasTouch:viewport.width<=1024,isMobile:viewport.width<=700});
  await ctx.route('https://**/*',r=>r.abort());
  const p=await ctx.newPage();
  await p.goto(url);await p.waitForFunction(()=>typeof wbBooted!=='undefined'&&wbBooted);
  await p.waitForTimeout(150);
  return p;
}
async function seed(p){await p.evaluate(async()=>{
  const b={id:'review-book',name:'Review',folder:'Review',created:1,updated:1,order:0};
  const cs=['a','b'].map((id,i)=>({id,workbookId:b.id,title:id.toUpperCase(),file:id+'.md',content:'ORIGINAL '+id,created:1,updated:1,order:i}));
  wbBooks=[b];wbChapters=cs;await wbPut(WB_BOOKS,b);for(const c of cs)await wbPut(WB_CHAPTERS,c);
  wbOpenBooks.add(b.id);loadChapterIntoEditor(cs[0]);wbDraftReady=true;
});}
async function type(p,text){await p.locator('#editor').fill(text);}
async function state(p){return p.evaluate(async()=>({text:editor.value,id:wbCurrentId,dirty:wbDirty,pending:[...wbPendingIds],status:document.getElementById('stat-wb').textContent,stored:await wbAll(WB_CHAPTERS),draft:wbDraftRead()}));}
async function run(name,fn){try{results[name]=await fn();console.log(name,JSON.stringify(results[name]));}catch(e){results[name]={error:e.stack};console.log(name,e.message);}}
(async()=>{
 server=http.createServer((req,res)=>{
  const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));
  fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':f.endsWith('.html')?'text/html':f.endsWith('.js')?'application/javascript':'application/octet-stream'});res.end(e?'missing':b);});
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port+'/index.html';
 browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH||'/usr/bin/google-chrome-stable'});
 await run('failed-folder-save-all',async()=>{const p=await page();await seed(p);await type(p,'LATEST a');await p.evaluate(async()=>{await flushChapter();ScuLaFolder.mode=()=> 'folder';ScuLaFolder.dir=async()=>({getDirectoryHandle:async()=>{throw new DOMException('Disk full','QuotaExceededError');}});await saveAllModifiedChapters();});const s=await state(p);await p.context().close();return s;});
 await run('failed-folder-sync',async()=>{const p=await page();await seed(p);await type(p,'LATEST a');await p.evaluate(async()=>{await flushChapter();ScuLaFolder.mode=()=> 'folder';ScuLaFolder.dir=async()=>null;await syncAllToFolder({cloud:false});});const s=await state(p);await p.context().close();return s;});
 await run('failed-store-then-switch',async()=>{const p=await page();await seed(p);await p.evaluate(()=>{window.originalTx=wbTx;wbTx=(store,mode,run)=>store===WB_CHAPTERS&&mode==='readwrite'?Promise.reject(new DOMException('Quota','QuotaExceededError')):originalTx(store,mode,run);});await type(p,'UNSAVED A');const afterFailure=await p.evaluate(async()=>{await flushChapter();const r={dirty:wbDirty,status:document.getElementById('stat-wb').textContent};await openChapter('b');return r;});await p.reload();await p.waitForFunction(()=>wbBooted);await p.evaluate(()=>openChapter('a'));const s={afterFailure,...await state(p)};await p.context().close();return s;});
 await run('file-open-before-autosave',async()=>{const p=await page();await seed(p);await type(p,'LOST EDIT A');await p.locator('#file-input').setInputFiles({name:'incoming.md',mimeType:'text/markdown',buffer:Buffer.from('IMPORTED')});await p.waitForTimeout(1000);const s=await state(p);await p.context().close();return s;});
 await run('export-before-autosave',async()=>{const p=await page();await seed(p);await type(p,'LATEST EDIT');const exported=await p.evaluate(async()=>{ScuLaFolder.save=async(name,blob)=>{window.exported=await blob.text();};exportChapter('a');await new Promise(r=>setTimeout(r,20));return window.exported;});await p.context().close();return{exported,expected:'LATEST EDIT'};});
 await run('toolbar-edit-not-autosaved',async()=>{const p=await page();await seed(p);await p.waitForTimeout(1500);await p.locator('#editor').selectText();await p.locator('button[onclick="wrapSelection(\'**\',\'**\')"]').click();await p.waitForTimeout(1100);const before=await state(p);await p.evaluate(()=>openChapter('b'));await p.evaluate(()=>openChapter('a'));const after=await state(p);await p.context().close();return{before,after};});
 await run('rename-failed-copy-deletes-source',async()=>{const p=await page();await seed(p);const r=await p.evaluate(async()=>{window.removed=[];ScuLaFolder.mode=()=> 'folder';ScuLaFolder.dir=async()=>({getDirectoryHandle:async()=>({getFileHandle:async()=>({createWritable:async()=>{throw new Error('disk full');}}),removeEntry:async(name)=>removed.push(name)})});await renameChapter('a','Renamed');return{removed,title:wbChapter('a').title,file:wbChapter('a').file};});await p.context().close();return r;});
 await run('quick-idea-typing-during-save',async()=>{const p=await page();await seed(p);const r=await p.evaluate(async()=>{openIdeaModal();document.getElementById('idea-text').value='FIRST IDEA';window.origPersist=wbPersist;wbPersist=async(store,value)=>{if(store===WB_CHAPTERS)await new Promise(r=>window.releaseSave=r);return origPersist(store,value);};window.savePromise=saveIdea();await new Promise(r=>setTimeout(r,30));document.getElementById('idea-text').value='SECOND IDEA';releaseSave();await savePromise;return{box:document.getElementById('idea-text').value,chapter:wbChapter('a').content,open:document.getElementById('idea-modal').classList.contains('open')};});await p.context().close();return r;});
 await run('two-tabs-stale-overwrite',async()=>{const ctx=await browser.newContext();const p=await page(undefined,ctx);await seed(p);const q=await page(undefined,ctx);await type(p,'TAB A NEWER');await p.evaluate(()=>flushChapter());await type(q,'TAB B STALE EDIT');await q.evaluate(()=>flushChapter());const r=await p.evaluate(async()=>({visible:editor.value,stored:(await wbAll(WB_CHAPTERS)).find(c=>c.id==='a').content}));await ctx.close();return r;});
 async function driveSetup(p,remoteOnly=false){await seed(p);await p.evaluate(remoteOnly=>{gsToken='fake';gsTokenExp=Date.now()+3600000;gsFolder={id:'root',name:'Fake'};gsRoot=async()=>gsFolder;gsChild=async(name,parent,folder)=>name===GSYNC.MANIFEST?{id:'manifest'}:null;gsDirLive=async()=>true;gsWrite=async(name,parent,blob,id)=>{if(name===GSYNC.MANIFEST)window.uploadedManifest=JSON.parse(await blob.text());return{id:id||'new'};};window.remote={v:1,books:[{...wbBooks[0],driveId:'dir'}],chapters:[{...wbChapters[0],updated:Date.now()+10000,driveId:'remote-a'}],deleted:{}};if(remoteOnly){wbChapters=wbChapters.filter(c=>c.id!=='a');wbCurrentId=null;wbDirty=false;}},remoteOnly);}
 await run('drive-failed-download-forgets-remote',async()=>{const p=await page();await driveSetup(p,true);const r=await p.evaluate(async()=>{gsRaw=async url=>{if(url.includes('/manifest?'))return{text:async()=>JSON.stringify(remote)};throw new Error('503 transient failure');};await cloudSync(true);return{remoteIds:remote.chapters.map(c=>c.id),uploadedIds:uploadedManifest.chapters.map(c=>c.id)};});await p.context().close();return r;});
 await run('drive-malformed-manifest-overwrite',async()=>{const p=await page();await driveSetup(p);const r=await p.evaluate(async()=>{gsRaw=async()=>({text:async()=>'{invalid'});gsMakeFolder=async()=>({id:'new-dir'});await cloudSync(true);return uploadedManifest;});await p.context().close();return r;});
 await run('drive-pull-overwrites-typing',async()=>{const p=await page();await driveSetup(p);const r=await p.evaluate(async()=>{gsRaw=async url=>({text:async()=>url.includes('/manifest?')?JSON.stringify(remote):new Promise(r=>window.releaseDownload=r)});window.syncPromise=cloudSync(true);while(!window.releaseDownload)await new Promise(r=>setTimeout(r,5));editor.value='NEW LOCAL WHILE SYNCING';updatePreview();updateStatus();scheduleAutosave();releaseDownload('REMOTE BODY');await syncPromise;return{text:editor.value,dirty:wbDirty,stored:(await wbAll(WB_CHAPTERS)).find(c=>c.id==='a').content,draft:wbDraftRead()};});await p.context().close();return r;});
 await run('markdown-active-span',async()=>{const p=await page();const r=await p.evaluate(()=>{editor.value='<span onmouseover="window.reviewExecuted=1">hover</span>';updatePreview();const el=document.querySelector('#preview span[onmouseover]');if(el)el.dispatchEvent(new MouseEvent('mouseover'));return{executed:window.reviewExecuted||false,html:preview.innerHTML};});await p.context().close();return r;});
 await run('modal-shortcut-mutates-editor',async()=>{const p=await page();await seed(p);await p.evaluate(()=>openLinkModal());await p.locator('#link-modal input').first().focus();await p.keyboard.press('Control+b');const s=await state(p);await p.context().close();return s;});
 await run('modal-keyboard-focus-escape',async()=>{const p=await page();await p.evaluate(()=>openWorkbookModal());await p.waitForTimeout(60);await p.keyboard.press('Escape');const r=await p.evaluate(()=>({stillOpen:document.getElementById('workbook-modal').classList.contains('open'),role:document.getElementById('workbook-modal').getAttribute('role'),ariaModal:document.getElementById('workbook-modal').getAttribute('aria-modal')}));await p.context().close();return r;});
 await run('ui-layout-and-contrast',async()=>{
  const r=[];for(const [width,height]of [[1920,1080],[1366,900],[1025,768],[390,844],[320,640],[844,390]]){
   const p=await page({width,height});await seed(p);await type(p,'# Review\n\nA pleasant place to write and keep notes.\n\n- [ ] Important task !vital\n\n## Next section\n\nKeep every edit safe.');await p.waitForTimeout(150);
   for(const lang of ['ro','en']){await p.evaluate(lang=>{UI=lang;applyUILang();},lang);
    const data=await p.evaluate(()=>{
     const geometry=s=>{const e=document.querySelector(s);if(!e)return null;const b=e.getBoundingClientRect(),c=getComputedStyle(e);return{x:b.x,y:b.y,w:b.width,h:b.height,color:c.color,bg:c.backgroundColor,font:c.fontSize,scroll:e.scrollWidth,client:e.clientWidth};};
     return{lang:UI,width:innerWidth,height:innerHeight,pageScroll:document.documentElement.scrollWidth,header:geometry('header'),toolbar:geometry('.toolbar'),workspace:geometry('.workspace'),editor:geometry('#editor'),preview:geometry('#preview'),saveRow:geometry('#wb-save-sync-row'),panelTitle:geometry('.panel-title'),tbLabel:geometry('.tb-label'),status:geometry('#status-bar'),loose:geometry('#current-file'),buttons:[...document.querySelectorAll('header button,#wb-save-sync-row button,.toolbar button')].filter(e=>e.getBoundingClientRect().height>0).map(e=>({id:e.id,text:e.textContent.trim(),h:e.getBoundingClientRect().height,w:e.getBoundingClientRect().width}))};
    });r.push(data);await p.screenshot({path:OUT+`/ui-${width}-${lang}.png`});
   }
   if(width<=1024){await p.evaluate(()=>toggleToolbarCollapse());await p.waitForTimeout(300);await p.screenshot({path:OUT+`/ui-${width}-collapsed.png`});r.push(await p.evaluate(()=>({collapsedWidth:innerWidth,workspaceHeight:document.querySelector('.workspace').getBoundingClientRect().height,focusedHiddenControls:[...document.querySelectorAll('#toolbar-groups button,#toolbar-groups select')].filter(e=>e.tabIndex>=0&&!e.disabled).length})));}
   await p.context().close();
  }return r;
 });
 fs.writeFileSync(OUT+'/evidence.json',JSON.stringify(results,null,2));await browser.close();await new Promise(r=>server.close(r));
})().catch(async e=>{console.error(e);if(browser)await browser.close();if(server)server.close();process.exitCode=1;});
