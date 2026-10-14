/* Short scheduled buffers for long previews. Export normalization is separate:
   a live peak compressor protects preview output without a whole-song scan. */
(function(root){
'use strict';
function play(session,ctx,{start=0,end=session.length,loop=false,loopStart=start,cancelled=()=>false,onPosition=()=>{},onEnded=()=>{},onError=()=>{}}={}){
 let stopped=false,nextTime=0,clock=null,iterator=null,finished=false,started=false;
 const nodes=new Set(),sr=session.sampleRate,limiter=ctx.createDynamicsCompressor();
 limiter.threshold.value=20*Math.log10(.95);limiter.knee.value=0;limiter.ratio.value=20;limiter.attack.value=0;limiter.release.value=.05;limiter.connect(ctx.destination);
 let resolveReady,rejectReady;const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
 const dead=()=>stopped||cancelled();
 function stop(){if(stopped)return;stopped=true;clearInterval(clock);for(const entry of nodes){entry.node.onended=null;try{entry.node.stop();}catch(_){}entry.node.disconnect();entry.node.buffer=null;}nodes.clear();limiter.disconnect();if(!started)resolveReady();}
 function position(){const now=ctx.currentTime;for(const entry of nodes)if(now>=entry.when&&now<entry.until){onPosition((entry.offset+(now-entry.when)*sr)/sr);break;}}
 const pump=(async()=>{
  try{
   do{
    iterator=session.blocks({start,end,normalized:false,cancelled:dead})[Symbol.asyncIterator]();
    while(!dead()){
     // At most 1 second of scheduled audio, plus one <=4096-frame buffer.
     while(!dead()&&nextTime-ctx.currentTime>1)await new Promise(r=>setTimeout(r,15));
     if(dead())break;
     const next=await iterator.next();if(dead())break;if(next.done)break;
     const b=next.value,buffer=ctx.createBuffer(2,b.L.length,sr);buffer.copyToChannel(b.L,0);buffer.copyToChannel(b.R,1);
     if(!started)nextTime=ctx.currentTime+.3;
     else if(nextTime<ctx.currentTime+.01)throw Error('previewUnderrun');
     const node=ctx.createBufferSource();node.buffer=buffer;node.connect(limiter);
     const entry={node,offset:b.offset,when:nextTime,until:nextTime+b.L.length/sr};nodes.add(entry);
     node.onended=()=>{nodes.delete(entry);node.onended=null;node.disconnect();node.buffer=null;if(!dead()&&finished&&!nodes.size){stop();onEnded();}};
     node.start(nextTime);nextTime=entry.until;
     if(!started){started=true;clock=setInterval(position,25);resolveReady();}
    }
    await iterator.return();iterator=null;if(loop)start=loopStart;
   }while(loop&&!dead());
   finished=true;if(dead())stop();else if(!nodes.size){stop();onEnded();}
  }catch(e){const wasStopped=dead();stop();rejectReady(e);if(!wasStopped&&started)onError(e);}
  finally{if(iterator)await iterator.return();}
 })();
 // pump handles its errors; done lets tests/callers observe resource release.
 return {ready,stop,done:pump,get queued(){return nodes.size;}};
}
root.ScuLaSongPlayback=Object.freeze({play});
})(typeof window==='undefined'?globalThis:window);
