// Exercise the real Song analysis handler without a browser or audio hardware.
const assert=require('assert/strict'),fs=require('fs'),vm=require('vm');
const source=fs.readFileSync(require('path').join(__dirname,'..','song.html'),'utf8');
const handler=source.slice(source.indexOf('async function analyzeTake(r){'),source.indexOf('async function importWav(file){'));
const hide=source.match(/window.addEventListener\('pagehide',\(\)=>\{([^\n]*)\}\);/)[1];
async function scenario(mode){
 const record={duration:1,source:{assetId:'source'},performance:{id:'edited',notes:[{midi:72}]}};
 const calls=[],jobState={value:'idle'},project={updatedAt:'before'};
 let resolveAnalysis,resolveCommit;
 const sandbox={record,project,state:'idle',analysisJob:null,analysisFraction:0,analysisPhase:'decoding',generation:0,
  confirm:()=>true,t:k=>k,now:()=> 'after',id:()=> 'new',
  stopPreview:()=>calls.push('preview stopped'),stopArrangement:()=>calls.push('arrangement stopped'),clearPlayers:()=>calls.push('players cleared'),
  paintAnalysisProgress:()=>{},setState:s=>{sandbox.state=s;jobState.value=s;},
  say:k=>calls.push(k),blobFor:async()=>({}),histories:new Map([['record','history']]),
  touch:()=>{project.updatedAt='after';},persist:()=>new Promise(r=>{resolveCommit=r;}),
  render:async()=>calls.push('render'),
  P:{MAX_SECONDS:180,analyze:()=>new Promise(r=>{resolveAnalysis=r;})},
  backupJob:null,cancelBackup:()=>{},capture:null,cleanup:()=>{}};
 vm.createContext(sandbox);vm.runInContext(handler+'\nfunction pagehide(){'+hide+'}',sandbox);
 const operation=vm.runInContext('analyzeTake(record)',sandbox);
 await Promise.resolve();await Promise.resolve();
 assert.deepEqual(calls.slice(0,3),['preview stopped','arrangement stopped','players cleared']);
 if(mode==='cancel')sandbox.analysisJob.cancelled=true;
 if(mode==='hidden')sandbox.pagehide();
 resolveAnalysis({notes:[{midi:60}]});
 await Promise.resolve();await Promise.resolve();
 if(mode==='saving-hidden'){assert.equal(sandbox.state,'saving');sandbox.pagehide();}
 if(resolveCommit)resolveCommit(true);
 await operation;
 assert.equal(sandbox.state,'idle');
 if(mode==='cancel' || mode==='hidden')assert.equal(record.performance.id,'edited');
 else assert.equal(record.performance.id,'new');
 assert.equal(calls.filter(c=>c==='render').length,mode==='hidden' || mode==='saving-hidden'?0:1);
}
(async()=>{
 for(const mode of ['complete','cancel','hidden','saving-hidden'])await scenario(mode);
 console.log('PASS  analysis stops existing audio; cancellation preserves edits; pagehide during analysis or commit does not recreate players');
})().catch(e=>{console.error(e);process.exitCode=1;});
