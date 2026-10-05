// Generator 2 musical contracts, legacy preservation and exact mixed-meter export.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm'),crypto=require('crypto');
const root=path.resolve(__dirname,'..'),json=v=>JSON.parse(JSON.stringify(v));
function load(){const c=vm.createContext({Blob,TextEncoder,Float32Array,Float64Array,Uint8Array,ArrayBuffer,DataView,setTimeout});for(const f of ['analysis','performance','synthesis','song-instruments','arrangement','song-timeline','song-renderer'])vm.runInContext(fs.readFileSync(path.join(root,'js/audio/'+f+'.js'),'utf8'),c);return c;}
const recording={id:'take',source:{assetId:'master'},performance:{id:'perf',updatedAt:'2026-10-05T00:00:00Z',tempoBpm:120,timingMode:'original',quantizationDivision:4,analysis:{tempo:{bpm:120,phaseSeconds:0},key:{tonic:0,mode:'major'}},notes:[
 {id:'n1',sourceNoteId:null,midi:60,onset:.13,offset:.63,cents:13,velocity:85,quantizedTiming:{onset:.125,offset:.625}},
 {id:'n2',sourceNoteId:null,midi:64,onset:.7,offset:1.05,cents:-9,velocity:90,quantizedTiming:{onset:.75,offset:1}},
 {id:'n3',sourceNoteId:null,midi:67,onset:1.1,offset:1.42,cents:0,velocity:99,quantizedTiming:{onset:1.125,offset:1.375}}
]}};
function create(A){return A.enableComposition(A.create(recording,{id:'arr',version:1,createdAt:'2026-10-05T00:00:00Z',updatedAt:'2026-10-05T00:00:00Z'}));}
function midiEvents(b){let pos=14;const tracks=[];for(let i=0;i<b.readUInt16BE(10);i++){const end=pos+8+b.readUInt32BE(pos+4),events=[];pos+=8;let tick=0;const vlq=()=>{let n=0,x;do{x=b[pos++];n=(n<<7)|(x&127);}while(x&128);return n;};while(pos<end){tick+=vlq();const status=b[pos++];if(status===255){const type=b[pos++],len=vlq();events.push({tick,type,data:Array.from(b.subarray(pos,pos+len))});pos+=len;}else if((status&240)===192)events.push({tick,status,program:b[pos++]});else events.push({tick,status,note:b[pos++],value:b[pos++]});}assert.equal(pos,end);tracks.push(events);}assert.equal(pos,b.length);return tracks;}
async function checks(){
 const c=load(),A=c.ScuLaArrangement,T=c.ScuLaSongTimeline,R=c.ScuLaSongRenderer,before=JSON.stringify(recording),a=create(A),snapshot=JSON.stringify(a.performanceSnapshot);
 const options=A.chordAlternatives(a,0,1.5);
 assert.deepEqual(json(options.map(c=>[c.root,c.q])),[[0,'maj'],[2,'min'],[4,'min'],[5,'maj'],[7,'maj'],[9,'min'],[11,'dim']]);
 assert.equal(options[0].compatibility,1);assert.equal(A.chordAlternatives(a,20,1)[0].compatibility,null);
 const minor=json(a);minor.key.mode='minor';assert.deepEqual(json(A.chordAlternatives(minor,0,1).map(c=>[c.root,c.q])),[[0,'min'],[2,'dim'],[3,'maj'],[5,'min'],[7,'min'],[8,'maj'],[10,'maj']]);
 a.composition.meter='3/4';a.composition.harmonicRhythm=2;a.composition.chordDegrees=[4,5];A.generate(a);
 assert.equal(a.duration,1.5);assert.deepEqual(json(a.chords.map(c=>[c.root,c.start,c.dur])),[[5,0,.75],[7,.75,.75]]);
 const lead=json(a.parts.lead.notes);a.composition.bassPattern='fifths';A.generate(a);
 assert.deepEqual(json(a.parts.bass.notes.map(n=>[n.start,n.midi])),[[0,41],[.375,36],[.75,43],[1.125,38]]);
 a.composition.bassPattern='walk';A.generate(a);assert.deepEqual(json(a.parts.bass.notes.map(n=>n.start)),[0,.375,.75,1.125]);
 for(const p of Object.values(a.parts))assert.ok(p.notes.every(n=>n.start>=0&&n.dur>0&&n.start+n.dur<=a.duration+1e-9));
 a.composition.meter='6/8';a.composition.harmonicRhythm=1;a.composition.chordDegrees=[1];a.composition.fills='none';a.composition.drumPattern='backbeat';A.generate(a);
 assert.equal(a.duration,1.5);assert.deepEqual(json(a.parts.drums.notes.filter(n=>n.midi===38).map(n=>n.start)),[.75]);
 a.composition.fills='ending';A.generate(a);assert.deepEqual(json(a.parts.drums.notes.filter(n=>n.midi===38).map(n=>n.start)),[.75,.9375,1.125,1.3125]);
 a.parts.lead.performanceVersion=1;a.parts.lead.pianoPedal='bar';a.rendererVersion=2;
 assert.equal(A.performanceNotes(a.parts.lead,a)[0].dur,1.37);delete a.parts.lead.performanceVersion;delete a.parts.lead.pianoPedal;
 a.timingMode='quantized';A.generate(a);assert.equal(a.parts.lead.notes[0].start,.125);a.timingMode='original';A.generate(a);assert.deepEqual(json(a.parts.lead.notes),lead);
 a.composition.leadOctave=1;A.generate(a);assert.equal(a.parts.lead.notes[0].midi,72);assert.equal(JSON.stringify(a.performanceSnapshot),snapshot);
 a.composition.leadOctave=0;A.generate(a);
 const long=create(A);long.performanceSnapshot.notes.at(-1).offset=9.9;long.composition.fills='every4';A.generate(long);
 assert.deepEqual(json(long.parts.drums.notes.filter(n=>n.midi===38&&n.vel===.45).map(n=>n.start)),[7.5,9.5]);
 const golden={};
 for(const meter of A.METERS)for(const style of Object.keys(A.STYLES)){
  const v=create(A);v.composition.meter=meter;v.composition.harmonicRhythm=2;v.composition.chordDegrees=[1,5];A.applyStyle(v,style);
  assert.equal(v.performanceSnapshot.notes[0].onset,.13);assert.equal(v.parts.lead.notes[0].start,.13);assert.deepEqual(json(v.composition.chordDegrees),[1,5]);
  for(const p of Object.values(v.parts))assert.ok(p.notes.every(n=>n.midi>=0&&n.midi<=127&&n.dur>0&&n.start+n.dur<=v.duration+1e-9));
  const once=JSON.stringify(v);A.generate(v);assert.equal(JSON.stringify(v),once);
  golden[meter+' '+style]=crypto.createHash('sha256').update(JSON.stringify({parts:v.parts,chords:v.chords,duration:v.duration})).digest('hex');
 }
 const fixture=path.join(__dirname,'fixtures/song-composition-v2.json');
 if(process.argv.includes('--write-fixture'))fs.writeFileSync(fixture,JSON.stringify(golden,null,2)+'\n');
 assert.deepEqual(golden,JSON.parse(fs.readFileSync(fixture,'utf8')));
 for(const mutate of [x=>x.generatorVersion=3,x=>x.composition.version=2,x=>x.composition.meter='5/0',x=>x.composition.chordDegrees=[8],x=>x.composition.chordDegrees=[1.5],x=>x.composition.density=9,x=>x.composition.bassPattern='bad',x=>x.composition.drumPattern='bad',x=>x.composition.fills='bad',x=>x.composition.leadOctave=8,x=>{x.performanceSnapshot.notes[0].midi=127;x.composition.leadOctave=1;}]){const bad=json(a);mutate(bad);assert.throws(()=>A.generate(bad),/invalidEdit/);}
 const legacy=A.create(recording,{});const old=JSON.stringify(legacy);const next=json(legacy);A.enableComposition(next);assert.equal(JSON.stringify(legacy),old);assert.equal(legacy.generatorVersion,1);assert.deepEqual(json(A.meter(legacy)),{numerator:4,denominator:4,quarters:4});assert.deepEqual(json(next.chords.map(c=>[c.root,c.q])),json(legacy.chords.map(c=>[c.root,c.q])));
 const b=create(A);b.id='second';b.composition.meter='3/4';b.tempoBpm=90;A.generate(b);
 const song={arrangements:[a,b],timeline:[{id:'s1',name:'Six',arrangementId:a.id,repeats:2},{id:'s2',name:'Three',arrangementId:b.id,repeats:1}]};
 const marks=json(T.beatMarks(song));assert.deepEqual(marks.slice(0,7).map(m=>[m.seconds,m.bar,m.beat]),[[0,1,1],[.25,1,2],[.5,1,3],[.75,1,4],[1,1,5],[1.25,1,6],[1.5,2,1]]);
 assert.deepEqual(marks.filter(m=>m.beat===1).map(m=>[m.seconds,m.bar]),[[0,1],[1.5,2],[3,3],[5,4]]);
 const full=midiEvents(Buffer.from(await T.midi(song).arrayBuffer()));assert.deepEqual(full[0].filter(e=>e.type===88).map(e=>[e.tick,e.data]),[[0,[6,3,36,8]],[1440,[6,3,36,8]],[2880,[3,2,24,8]]]);
 const loop=midiEvents(Buffer.from(await T.midi(song,{start:2.75,end:4}).arrayBuffer()));assert.deepEqual(loop[0].filter(e=>e.type===88).map(e=>[e.tick,e.data.slice(0,2)]),[[0,[6,3]],[240,[3,2]]]);
 assert.ok(loop.slice(1).flat().filter(e=>(e.status&240)===128).every(e=>e.tick<=960));
 const am=midiEvents(Buffer.from(await A.midi(a).arrayBuffer()));assert.deepEqual(am[0].find(e=>e.type===88).data,[6,3,36,8]);
 assert.ok(am.every(track=>track.at(-1).tick===1440));assert.ok(full.every(track=>track.at(-1).tick===4320));assert.ok(loop.every(track=>track.at(-1).tick===960));
 assert.deepEqual(midiEvents(Buffer.from(await T.midi(song,{start:0,end:6.8}).arrayBuffer())),full);
 const muted=json(a);Object.values(muted.parts).forEach(p=>p.enabled=false);assert.ok(midiEvents(Buffer.from(await A.midi(muted).arrayBuffer())).every(track=>track.at(-1).tick===1440));
 const opts={sampleRate:8000,yieldUI:()=>Promise.resolve()};
 const one=await R.song(song,{...opts,blockFrames:4096}).collect(),two=await R.song(song,{...opts,blockFrames:512}).collect();assert.deepEqual(one.L,two.L);assert.deepEqual(one.R,two.R);assert.equal(one.L.length,Math.ceil((5+1.8)*8000));
 const energies=[];for(const name of Object.keys(A.STYLES)){const v=create(A);A.applyStyle(v,name);const mix=await A.render(v,opts);energies.push(mix.L.reduce((sum,x)=>sum+x*x,0));assert.ok(mix.L.every(Number.isFinite));}
 assert.equal(new Set(energies.map(e=>e.toFixed(6))).size,3);assert.ok(energies.every(e=>e>0));assert.equal(JSON.stringify(recording),before);
 console.log('PASS composition: triads/match, explicit harmony, meters, bass, fills, pedal, human timing, presets, bounds, 12 deterministic fixtures, mixed-meter MIDI/loops/ruler, block-exact audible rendering and immutable snapshots');
}
if(require.main===module)checks().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={midiEvents};
