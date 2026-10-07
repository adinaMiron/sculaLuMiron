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
 server=http.createServer((req,res)=>{const f=path.join(ROOT,decodeURIComponent(req.url.split('?')[0]));fs.readFile(f,(e,b)=>{res.writeHead(e?404:200,{'Content-Type':f.endsWith('.html')?'text/html':'application/javascript'});res.end(e?'missing':b);});});await new Promise(r=>server.listen(0,'127.0.0.1',r));url='http://127.0.0.1:'+server.address().port+'/index.html';
 browser=await chromium.launch({executablePath:process.env.PW_CHROME_PATH||'/usr/bin/google-chrome-stable',args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 await run('save-overlaps-new-edit',async()=>{const p=await page();await seed(p);await p.waitForTimeout(1500);const r=await p.evaluate(async()=>{
  editor.value='FIRST VERSION';scheduleAutosave();await flushChapter();window.originalMirror=wbMirrorWrite;wbMirrorWrite=async()=>new Promise(r=>window.releaseMirror=r);window.saving=saveToWorkbook();while(!window.releaseMirror)await new Promise(r=>setTimeout(r,5));editor.value='SECOND VERSION';updateStatus();scheduleAutosave();await flushChapter();const before=[...wbPendingIds];releaseMirror('folder/first-version.md');await saving;return{pendingBefore:before,pendingAfter:[...wbPendingIds],stored:(await wbAll(WB_CHAPTERS)).find(c=>c.id==='a').content,status:document.getElementById('stat-wb').textContent};});await p.context().close();return r;});
 await run('collapsed-toolbar-focus-invisible',async()=>{const p=await page({width:390,height:844});await p.evaluate(()=>toggleToolbarCollapse());await p.waitForTimeout(300);await p.locator('#btn-toolbar-toggle').focus();await p.keyboard.press('Tab');const r=await p.evaluate(()=>({focused:document.activeElement.id,toolbarCollapsed:document.querySelector('.toolbar').classList.contains('collapsed'),ancestorOpacity:getComputedStyle(document.querySelector('#toolbar-groups')).opacity}));await p.context().close();return r;});
 await run('lost-loose-draft-on-quota',async()=>{const p=await page();await p.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='scula:md:draft')throw new DOMException('Quota','QuotaExceededError');return originalStorageSet.call(this,k,v);};});await type(p,'LOOSE WORK MUST SURVIVE');await p.waitForTimeout(950);const before=await state(p);await p.reload();await p.waitForFunction(()=>wbBooted);const after=await state(p);await p.context().close();return{before,after};});
 await run('late-dictation-wrong-chapter',async()=>{const p=await page();await seed(p);let held;await p.route('**/audio/transcriptions',async route=>{held=route;});await p.evaluate(async()=>store.set('caiet-vocal:settings',JSON.stringify({engine:'api',provider:'custom',endpoint:'https://stt.test/audio/transcriptions',key:'',model:'whisper-large-v3',lang:'ro',segMin:0,tidy:false})));await p.locator('#btn-dictate').click();await p.waitForFunction(()=>document.getElementById('btn-dictate').classList.contains('active'));await p.waitForTimeout(1300);await p.locator('#btn-dictate').click();for(let i=0;i<100&&!held;i++)await p.waitForTimeout(20);if(!held)throw new Error('No transcript request');await p.evaluate(()=>openChapter('b'));await held.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({text:'SPOKEN FOR CHAPTER A'})});await p.waitForFunction(()=>editor.value.includes('SPOKEN'));await p.evaluate(()=>flushChapter());const r=await state(p);await p.context().close();return r;});
 await run('cloud-name-collision-mirror',async()=>{const p=await page();await seed(p);const r=await p.evaluate(async()=>{
 gsToken='fake';gsTokenExp=Date.now()+3600000;gsFolder={id:'root',name:'Fake'};gsRoot=async()=>gsFolder;gsDirLive=async()=>true;gsChild=async name=>name===GSYNC.MANIFEST?{id:'manifest'}:null;gsMakeFolder=async()=>({id:'remote-dir'});gsWrite=async(name,parent,blob,id)=>({id:id||'new'});
 const man={v:1,books:[{...wbBooks[0],id:'other-book',driveId:'other-dir'}],chapters:[{...wbChapters[0],id:'other-a',workbookId:'other-book',driveId:'other-file'}],deleted:{}};
 gsRaw=async u=>({text:async()=>u.includes('/manifest?')?JSON.stringify(man):'REMOTE NOTE'});await cloudSync(true);
 const paths=wbChapters.map(c=>({id:c.id,path:wbBook(c.workbookId).folder+'/'+c.file,text:c.content}));return paths;});await p.context().close();return r;});
 await run('modal-focus-leaves-dialog',async()=>{const p=await page();await seed(p);await p.evaluate(()=>openLinkModal());let escaped=null;for(let i=0;i<15;i++){await p.keyboard.press('Tab');const s=await p.evaluate(()=>({inside:!!document.activeElement.closest('#link-modal'),tag:document.activeElement.tagName,id:document.activeElement.id}));if(!s.inside){escaped=s;break;}}await p.context().close();return escaped;});
 fs.writeFileSync(OUT+'/extra-evidence.json',JSON.stringify(results,null,2));await browser.close();await new Promise(r=>server.close(r));
})().catch(async e=>{console.error(e);if(browser)await browser.close();if(server)server.close();process.exitCode=1;});
