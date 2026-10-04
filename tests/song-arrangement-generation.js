// Known edited melody -> four parts, control isolation, stereo PCM and DAW MIDI.
const assert=require('assert/strict'),fs=require('fs'),path=require('path'),vm=require('vm');
const root=path.resolve(__dirname,'..');
function load(){let seed=12;const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};const c=vm.createContext({Math:math,Blob,Float32Array,Float64Array,Uint8Array,ArrayBuffer,DataView,setTimeout});for(const f of ['analysis','performance','synthesis','song-instruments','arrangement','song-timeline','song-renderer'])vm.runInContext(fs.readFileSync(path.join(root,'js/audio/'+f+'.js'),'utf8'),c);return c.ScuLaArrangement;}
const recording={id:'take-1',source:{assetId:'master-1',immutable:true},performance:{id:'performance-1',updatedAt:'2026-01-01',tempoBpm:120,timingMode:'original',quantizationDivision:4,analysis:{tempo:{phaseSeconds:0},key:{tonic:0,mode:'major'},detectedNotes:[{midi:60}]},notes:[{id:'edited-1',sourceNoteId:'detected-1',midi:64,onset:.13,offset:.63,cents:23,velocity:77,quantizedTiming:{onset:.125,offset:.625}},{id:'manual-2',sourceNoteId:null,midi:67,onset:1.01,offset:1.43,cents:-7,velocity:110,quantizedTiming:null}]}};
const json=v=>JSON.parse(JSON.stringify(v)),energy=x=>x.reduce((s,v)=>s+v*v,0);
function parseMidi(b){
 assert.equal(b.toString('ascii',0,4),'MThd');assert.equal(b.readUInt16BE(8),1);assert.equal(b.readUInt16BE(10),5);assert.equal(b.readUInt16BE(12),480);
 const tracks=[];let at=14;
 for(let i=0;i<5;i++){assert.equal(b.toString('ascii',at,at+4),'MTrk');const end=at+8+b.readUInt32BE(at+4);at+=8;const track={notes:[],off:[],cc:[]};let tick=0;
  const vlq=()=>{let v=0,c;do{c=b[at++];v=(v<<7)|(c&127);}while(c&128);return v;};
  while(at<end){tick+=vlq();const status=b[at++];if(status===255){const type=b[at++],len=vlq();if(type===3)track.name=b.toString('ascii',at,at+len);if(type===81)track.tempo=b.readUIntBE(at,3);at+=len;}else if((status&240)===192){track.program=b[at++];track.channel=status&15;}else{const m=b[at++],v=b[at++];if((status&240)===144)track.notes.push({tick,midi:m,velocity:v,channel:status&15});if((status&240)===128)track.off.push({tick,midi:m});if((status&240)===176)track.cc.push({controller:m,value:v});}}
  assert.equal(at,end);tracks.push(track);
 }assert.equal(at,b.length);return tracks;
}
if(require.main===module)(async()=>{
 const A=load(),before=JSON.stringify(recording),a=A.create(recording,{id:'arrangement-1',version:1,createdAt:'now',updatedAt:'now'});
 assert.equal(a.schemaVersion,1);assert.equal(a.sourceAssetId,'master-1');assert.equal(a.sourceRecordingId,'take-1');assert.equal(a.sourcePerformanceId,'performance-1');assert.deepEqual(Array.from(a.parts.lead.notes,n=>n.midi),[64,67]);assert.equal(a.parts.lead.notes[0].start,.13);assert.equal(a.parts.lead.notes[0].cents,23);assert.equal(a.parts.lead.notes[0].velocity,77);assert.ok(Object.values(a.parts).every(p=>p.notes.length));assert.equal(a.chords.at(-1).root,0);
 a.tempoBpm=60;a.key={tonic:2,mode:'minor'};a.timingMode='quantized';A.generate(a);assert.equal(a.parts.lead.notes[0].start,.25);assert.equal(a.parts.lead.notes[0].dur,1);assert.equal(a.parts.lead.notes[0].midi,66);assert.equal(a.parts.lead.notes[1].start,2);assert.equal(a.chords.at(-1).q,'min');assert.equal(JSON.stringify(recording),before);
 const snapshot=JSON.stringify(a.performanceSnapshot);recording.performance.notes[0].midi=12;A.generate(a);assert.equal(a.parts.lead.notes[0].midi,66);assert.equal(JSON.stringify(a.performanceSnapshot),snapshot);recording.performance.notes[0].midi=64;
 const prior=json(a.parts);a.parts.chords.instrument='guitar';a.parts.bass.instrument='cello';a.parts.drums.instrument='electronic';a.parts.drums.enabled=false;a.parts.lead.volume=.31;A.generate(a);assert.deepEqual(json(a.parts.lead.notes),prior.lead.notes);assert.notDeepEqual(json(a.parts.chords.notes),prior.chords.notes);assert.equal(a.parts.bass.instrument,'cello');assert.equal(a.parts.drums.enabled,false);
 const tracks=parseMidi(Buffer.from(await A.midi(a).arrayBuffer()));assert.deepEqual(tracks.map(t=>t.name),['Song Creation','Lead','Chords','Bass','Drums']);assert.equal(tracks[0].tempo,1000000);assert.deepEqual(tracks[1].notes[0],{tick:120,midi:66,velocity:77,channel:0});assert.equal(tracks[1].off[0].tick,600);assert.equal(tracks[1].cc[0].value,39);assert.equal(tracks[2].program,25);assert.equal(tracks[3].program,42);assert.equal(tracks[4].program,24);assert.equal(tracks[4].notes.length,0);
 a.parts.drums.enabled=true;const drums=parseMidi(Buffer.from(await A.midi(a).arrayBuffer()))[4];assert.ok(drums.notes.every(n=>n.channel===9));assert.deepEqual([...new Set(drums.notes.map(n=>n.midi))].sort(),[36,38,42]);
 for(const change of [x=>x.tempoBpm=0,x=>x.key.tonic=12,x=>x.parts.lead.volume=NaN,x=>x.parts.bass.instrument='bad',x=>x.parts.drums.enabled='yes']){const bad=json(a);change(bad);assert.throws(()=>A.generate(bad),/invalidEdit/);}
 console.log('PASS  reference IDs, edited/cents/velocity snapshot, selected timing, tempo/key, harmony, isolated controls, MIDI tracks/programs/CC7/notes');
 const single=json(a);single.tempoBpm=120;single.key={tonic:0,mode:'major'};single.parts.chords.enabled=single.parts.bass.enabled=single.parts.drums.enabled=false;single.parts.lead.volume=1;A.generate(single);
 const options={sampleRate:22050,yieldUI:()=>Promise.resolve()};const loud=await load().render(single,options);single.parts.lead.volume=.25;const quiet=await load().render(single,options);
 assert.ok(energy(loud.L)>0);assert.ok(Math.abs(energy(quiet.L)/energy(loud.L)-.0625)<.000001,'Volume must not be normalized away');assert.ok(loud.L.every(Number.isFinite));assert.notDeepEqual(loud.L,loud.R,'Stereo room tail');
 const wav=Buffer.from(await A.wav(loud).arrayBuffer());assert.equal(wav.toString('ascii',0,4),'RIFF');assert.equal(wav.readUInt16LE(22),2);assert.equal(wav.readUInt16LE(34),16);assert.equal(wav.readUInt32LE(24),22050);assert.equal(wav.readUInt32LE(40),loud.L.length*4);
 single.parts.lead.enabled=false;const silent=await A.render(single,options);assert.equal(energy(silent.L)+energy(silent.R),0);const muted=parseMidi(Buffer.from(await A.midi(single).arrayBuffer()));assert.ok(muted.slice(1).every(t=>!t.notes.length));
 let calls=0;await assert.rejects(A.render(a,{...options,cancelled:()=>++calls>10}),/cancelled/);assert.equal(JSON.stringify(recording),before);
 console.log('PASS  non-silent stereo WAV dimensions, proportional independent volume, all parts muted, render cancellation and immutable input');
})().catch(e=>{console.error(e);process.exitCode=1;});
module.exports={parseMidi};
