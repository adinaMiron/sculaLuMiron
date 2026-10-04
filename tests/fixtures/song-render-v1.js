/* Pre-milestone-B full-buffer reference, retained only for short PCM parity tests.
   Source c0d29a2. The added 32 MiB guard prevents accidental large fixtures. */
(function(root){
'use strict';
const A=root.ScuLaArrangement,S=root.ScuLaSynthesis,I=root.ScuLaSongInstruments,T=root.ScuLaSongTimeline;
async function arrangement(a,{sampleRate=44100,samples={},cancelled=()=>false,yieldUI=()=>new Promise(r=>setTimeout(r,0))}={}){
 A.validate(a);
 if((a.duration+1.8)*sampleRate*8>32*1048576)throw new Error('renderLimit');
 const check=()=>{if(cancelled())throw new Error('cancelled');};check();
 const sr=sampleRate,L=new Float32Array(Math.ceil((a.duration+1.8)*sr)),R=new Float32Array(L.length),cache=new Map();
 const drumTypes={36:'kick',38:'snare',42:'hat',46:'hato'},pan={lead:0,chords:-.22,bass:.05,drums:.1};
 let count=0;
 for(const id of A.PARTS){const p=a.parts[id];if(!p.enabled||!p.volume)continue;
  const kit=id==='drums'?{kick:I.drum('kick',p.instrument,sr),snare:I.drum('snare',p.instrument,sr),hat:I.drum('hat',p.instrument,sr),hato:I.drum('hato',p.instrument,sr)}:null;
  for(const n of p.notes){
   check();let buf,hold=n.dur,rel=.005,gain=.28;
   if(kit){buf=kit[drumTypes[n.midi]];hold=buf.length/sr;gain=({36:.4,38:.25,42:.13,46:.12})[n.midi];
   }else {
    const group=p.sampleSet&&Object.hasOwn(samples,p.sampleSet)?samples[p.sampleSet]:[];
    const selected=p.sampleSet?A.mapSample(Array.isArray(group)?group:[],n.midi+(n.cents||0)/100,n.velocity||Math.round(n.vel*127)):null;
    if(selected){A.placeSample(L,R,selected,n,(id==='chords'?.2:.28)*p.volume,pan[id],sr);if((++count&7)===0){await yieldUI();check();}continue;}
    const pitch=n.midi+(n.cents||0)/100,key=p.instrument+'|'+pitch+'|'+hold+'|'+Math.round(n.vel*8);
    if(!cache.has(key))cache.set(key,I.instrument(p.instrument,pitch,hold+S.INSTR[p.instrument].rel,sr,Math.round(n.vel*8)/8));
    buf=cache.get(key);rel=S.INSTR[p.instrument].rel;gain=id==='chords'?.2:.28;
   }
   S.place(L,R,buf,n.start,hold,rel,gain*p.volume*n.vel,pan[id],sr);
   if((++count&7)===0){await yieldUI();check();}
  }
  await yieldUI();check();
 }
 cache.clear();await yieldUI();check();
 // Fixed headroom, no upward normalization: lowering a part stays quieter.
 const wl=S.reverbTail(L,sr,0);await yieldUI();check();
 const wr=S.reverbTail(R,sr,23);await yieldUI();check();let peak=0;
 for(let i=0;i<L.length;i++){L[i]+=wl[i]*.16;R[i]+=wr[i]*.16;peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));}
 if(peak>.95)for(let i=0;i<L.length;i++){L[i]*=.95/peak;R[i]*=.95/peak;}
 check();return {L,R,sr};
}
async function song(project,{sampleRate=44100,samplesFor=async()=>({}),cancelled=()=>false,yieldUI=()=>new Promise(r=>setTimeout(r,0))}={}){
 const plan=T.resolve(project);if(!plan.items.length)throw new Error('timelineEmpty');
 if((plan.seconds+1.8)*sampleRate*8>32*1048576)throw new Error('renderLimit');
 const length=Math.ceil((plan.seconds+1.8)*sampleRate),L=new Float32Array(length),R=new Float32Array(length),cache=new Map();
 for(const item of plan.items){
  if(cancelled())throw new Error('cancelled');
  const cacheKey=item.arrangement.id+'|'+JSON.stringify(item.section.mix||null);
  let mix=cache.get(cacheKey);
  if(!mix){const a=item.section.mix?{...item.arrangement,parts:Object.fromEntries(A.PARTS.map(id=>[id,{...item.arrangement.parts[id],...item.section.mix[id]}]))}:item.arrangement;const samples=await samplesFor(a);if(cancelled())throw new Error('cancelled');mix=await arrangement(a,{sampleRate,samples,cancelled,yieldUI});cache.set(cacheKey,mix);}
  const start=Math.round(item.seconds*sampleRate);
  for(let i=0;i<mix.L.length && start+i<length;i++){L[start+i]+=mix.L[i];R[start+i]+=mix.R[i];}
  await yieldUI();
 }
 if(cancelled())throw new Error('cancelled');
 let peak=0;for(let i=0;i<length;i++)peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));
 if(peak>.95){const gain=.95/peak;for(let i=0;i<length;i++){L[i]*=gain;R[i]*=gain;}}
 return {L,R,sr:sampleRate};
}
root.SongRenderReference={arrangement,song};
})(globalThis);
