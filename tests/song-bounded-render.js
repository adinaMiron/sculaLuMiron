const assert=require('assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
function load(){const c=vm.createContext({Blob,Float32Array,Uint8Array,DataView,ArrayBuffer,TextEncoder,setTimeout});for(const file of ['synthesis','song-instruments','arrangement','song-timeline','song-renderer'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/audio',file+'.js'),'utf8'),c);vm.runInContext(fs.readFileSync(path.join(__dirname,'fixtures/song-render-v1.js'),'utf8'),c);return {Reference:c.SongRenderReference,A:c.ScuLaArrangement,T:c.ScuLaSongTimeline,R:c.ScuLaSongRenderer,S:c.ScuLaSynthesis};}
function fixture(){return {id:'a',duration:1.31,tempoBpm:120,key:{tonic:0,mode:'major'},timingMode:'original',parts:{lead:{enabled:true,volume:.8,instrument:'piano',notes:[{start:.037,dur:1.1,midi:60,cents:17,vel:.8}]},chords:{enabled:true,volume:.7,instrument:'strings',notes:[{start:.13,dur:1.04,midi:64,vel:.6},{start:0,dur:.97,midi:67,vel:.6}]},bass:{enabled:true,volume:1,instrument:'bass',notes:[{start:.43,dur:.7,midi:36,vel:.7}]},drums:{enabled:true,volume:.9,instrument:'standard',notes:[{start:.02,dur:.12,midi:36,vel:1},{start:.511,dur:.12,midi:38,vel:.8},{start:1.21,dur:.12,midi:46,vel:.7}]}}};}
async function bytes(source){const chunks=[];for await(const b of source.stream())chunks.push(Buffer.from(b));return Buffer.concat(chunks);}
if(require.main===module)(async()=>{
 const {A,T,R,S,Reference}=load(),a=fixture(),opts={sampleRate:22050,yieldUI:()=>Promise.resolve()};
 for(const instrument of Object.keys(S.INSTR)){
  a.parts.lead.instrument=instrument;
  const old=await Reference.arrangement(a,opts),session=R.arrangement(a,opts),out=await bytes(session.wav());
  assert.deepEqual(out,Buffer.from(await A.wav(old).arrayBuffer()),instrument+' exact PCM');assert.equal(session.stats.usedBytes,0);
 }
 console.log('PASS all fourteen instruments: seeded PCM, reverb and chunk boundaries exactly match original renderer');
 const sample={midiNote:60,dynamic:'mf',sampleRate:22050,channels:[Float32Array.from({length:22050},(_,i)=>.8*Math.sin(i*.075)),Float32Array.from({length:22050},(_,i)=>.5*Math.sin(i*.12))],playback:{startSeconds:.1,loopStartSeconds:.2,loopEndSeconds:.7,crossfadeSeconds:.04,releaseSeconds:.2}};
 a.parts.lead.sampleSet='test';a.parts.lead.notes.push({start:.19,dur:1,midi:62,cents:-5,vel:.55});
 const sampleOpts={...opts,samples:{test:[sample]}};
 assert.deepEqual(await bytes(R.arrangement(a,sampleOpts).wav()),Buffer.from(await A.wav(await Reference.arrangement(a,sampleOpts)).arrayBuffer()));
 const b=JSON.parse(JSON.stringify(a));b.id='b';b.duration=1.61;b.tempoBpm=90;b.key={tonic:3,mode:'minor'};b.parts.lead.notes[0].midi=65;
 const project={arrangements:[a,b],timeline:[{id:'s1',name:'one',arrangementId:'a',repeats:2},{id:'s2',name:'two',arrangementId:'b',repeats:1,mix:Object.fromEntries(A.PARTS.map(id=>[id,{enabled:id!=='bass',volume:1}]))}]};
 const songOpts={...opts,samplesFor:async()=>sampleOpts.samples};
 const reference=await Reference.song(project,songOpts),full=await bytes(R.song(project,songOpts).wav());assert.deepEqual(full,Buffer.from(await T.wav(reference).arrayBuffer()));
 const start=12345,end=97891;
 for(const fadeMs of [0,25,100]){const expected=T.edgeFade({L:reference.L.subarray(start,end),R:reference.R.subarray(start,end),sr:opts.sampleRate},fadeMs);assert.deepEqual(await bytes(R.song(project,songOpts).wav({start,end,fadeMs})),Buffer.from(await T.wav(expected).arrayBuffer()));}
 for(const blockFrames of [128,1000])assert.deepEqual(await bytes(R.song(project,{...songOpts,blockFrames}).wav({start,end})),await bytes(R.song(project,songOpts).wav({start,end})));
 console.log('PASS sample loops/stereo/pitch/release, repeats, tempo/key, overrides, overlapping tails and exact loop slices/fades');
 // Deliberately force both levels of attenuation. No per-block normalization.
 const loud=fixture();loud.parts.lead.notes=Array.from({length:25},()=>({...loud.parts.lead.notes[0]}));
 const loudProject={arrangements:[loud],timeline:[{id:'s',name:'Loud',arrangementId:'a',repeats:2}]};
 assert.deepEqual(await bytes(R.song(loudProject,opts).wav()),Buffer.from(await T.wav(await Reference.song(loudProject,opts)).arrayBuffer()));
 console.log('PASS global two-stage peak attenuation matches reference at high polyphony');
 let cancelled=false,yields=0;const session=R.arrangement(a,{...sampleOpts,cancelled:()=>cancelled,yieldUI:async()=>{if(++yields===8)cancelled=true;}});await assert.rejects(bytes(session.wav()),/cancelled/);assert.equal(session.stats.usedBytes,0);
 // An hour-sized final-buffer allocation must never occur, even before iteration.
 const huge=fixture();huge.duration=1200;huge.parts.lead.instrument='organ';huge.parts.lead.notes[0].dur=1199;
 const bounded=R.arrangement(huge,opts),stream=bounded.blocks({normalized:false});for(let i=0;i<12;i++)await stream.next();await stream.return();assert.ok(bounded.stats.peakBytes<R.limits.workingBytes);assert.equal(bounded.stats.usedBytes,0);
 await assert.rejects(bounded.collect(),/renderLimit/);await assert.rejects(A.render(huge,opts),/renderLimit/);
 const crowded=fixture();crowded.parts.lead.notes=Array.from({length:100},()=>({...crowded.parts.lead.notes[0]}));const limited=R.arrangement(crowded,opts);await assert.rejects(bytes(limited.wav()),/renderLimit/);assert.equal(limited.stats.usedBytes,0);
 const subsonic=fixture();subsonic.parts.lead.instrument='guitar';subsonic.parts.lead.notes[0].cents=-100000;const rejected=R.arrangement(subsonic,opts);await assert.rejects(bytes(rejected.wav()),/renderLimit/);assert.equal(rejected.stats.usedBytes,0);
 const oversized=R.arrangement(a,{...opts,samples:{test:[{channels:[{byteLength:R.limits.sampleBytes+4}]}]}});await assert.rejects(bytes(oversized.wav()),/sampleBudget/);assert.equal(oversized.stats.usedBytes,0);
 let stopSeek=false;const seeking=R.arrangement(huge,{...opts,yieldUI:async()=>{stopSeek=true;}}),seek=seeking.blocks({start:1100*opts.sampleRate,end:1101*opts.sampleRate,normalized:false,cancelled:()=>stopSeek});await assert.rejects(seek.next(),/cancelled/);assert.equal(seeking.stats.usedBytes,0);
 let stopOutput=false;const encoding=R.arrangement(a,{...sampleOpts,cancelled:()=>stopOutput});await encoding.prepare();const writer=encoding.wav().stream();await writer.next();stopOutput=true;await assert.rejects(writer.next(),/cancelled/);assert.equal(encoding.stats.usedBytes,0);
 console.log('PASS bounded long-note state, allocation high-water instrumentation, sample/polyphony caps, seek/output cancellation and cleanup');
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={fixture,load,bytes};
