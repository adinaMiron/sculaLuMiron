/* Song backup staging. No decoding, analysis, synthesis or persistence here.
   IDs of notes are scoped to their performance/snapshot; entity IDs are global. */
(function(root){
'use strict';
const fail=(code,detail)=>{const e=new Error(code);e.code=code;e.detail=detail;throw e;};
const check=(ok,path)=>{if(!ok)fail('backupInvalid',path);};
const object=(v,p)=>check(v!==null && typeof v==='object' && !Array.isArray(v),p);
const string=(v,p)=>check(typeof v==='string' && v.length>0,p);
const number=(v,p,min=-Infinity,max=Infinity)=>check(Number.isFinite(v) && v>=min && v<=max,p);
const integer=(v,p,min,max)=>{number(v,p,min,max);check(Number.isInteger(v),p);};
const array=(v,p)=>check(Array.isArray(v),p);
const stamp=(v,p)=>{string(v,p);check(Number.isFinite(Date.parse(v)),p);};
const identity=(v,p)=>{string(v,p);check(/^[A-Za-z0-9_-]{1,100}$/.test(v),p);};
const version=(v,expected,p)=>{if(v!==expected)fail('backupVersion',p+' = '+String(v));};
function key(v,p){object(v,p);integer(v.tonic,p+'.tonic',0,11);check(['major','minor'].includes(v.mode),p+'.mode');}
function timing(v,p){object(v,p);number(v.onset,p+'.onset',0);number(v.offset,p+'.offset',0);check(v.offset>v.onset,p+'.offset');}
function settings(v,p){
  integer(v.tempoBpm,p+'.tempoBpm',40,220);check(['original','quantized'].includes(v.timingMode),p+'.timingMode');
  check([1,2,4,8].includes(v.quantizationDivision),p+'.quantizationDivision');
}
function notes(v,p,detected=false){
  array(v,p);const ids=new Set();
  v.forEach((n,i)=>{const at=p+'['+i+']';object(n,at);identity(n.id,at+'.id');check(!ids.has(n.id),at+'.id');ids.add(n.id);
    timing(n,at);integer(n.midi,at+'.midi',0,127);integer(n.velocity,at+'.velocity',1,127);number(n.cents,at+'.cents');
    if(detected){
      number(n.confidence,at+'.confidence',0,1);object(n.dynamics,at+'.dynamics');number(n.dynamics.rms,at+'.dynamics.rms',0);number(n.dynamics.peak,at+'.dynamics.peak',0);
      object(n.vibrato,at+'.vibrato');if(n.vibrato.rateHz!==null)number(n.vibrato.rateHz,at+'.vibrato.rateHz',0);
      number(n.vibrato.depthCents,at+'.vibrato.depthCents',0);number(n.vibrato.confidence,at+'.vibrato.confidence',0,1);
      check(typeof n.legato==='boolean',at+'.legato');number(n.attackSeconds,at+'.attackSeconds',0);number(n.releaseSeconds,at+'.releaseSeconds',0);
    }else{
      if(n.sourceNoteId!==null)identity(n.sourceNoteId,at+'.sourceNoteId');
      if(n.quantizedTiming!==null)timing(n.quantizedTiming,at+'.quantizedTiming');
    }
  });return ids;
}
function tempo(v,p){object(v,p);number(v.bpm,p+'.bpm',0.001);number(v.phaseSeconds,p+'.phaseSeconds',0);}
function emptyDerived(v,p){if(v!==undefined){array(v,p);if(v.length)fail('backupVersion',p+' (derived assets)');}}
function validate(project){
  object(project,'project');
  // Reject non-finite JSON numbers and prototype keys even inside retained extensions.
  function json(v,p){if(typeof v==='number')number(v,p);if(v && typeof v==='object')Object.entries(v).forEach(([k,x])=>{check(!['__proto__','prototype','constructor'].includes(k),p+'.'+k);json(x,p+'.'+k);});}
  json(project,'project');version(project.schemaVersion,1,'project.schemaVersion');
  const entities=new Map(),owners=new Map(),references=new Set(),versions=new Set();
  function entity(v,p,owner){identity(v,p);check(!entities.has(v),p+' (duplicate ID)');entities.set(v,p);if(owner)owners.set(v,owner);}
  entity(project.id,'project.id');string(project.name,'project.name');stamp(project.createdAt,'project.createdAt');stamp(project.updatedAt,'project.updatedAt');
  array(project.recordings,'recordings');emptyDerived(project.derivedAssets,'project.derivedAssets');
  const filenames=new Map(),recordings=new Map();
  project.recordings.forEach((r,i)=>{
    const p='recordings['+i+']';object(r,p);entity(r.id,p+'.id');recordings.set(r.id,r);
    string(r.name,p+'.name');stamp(r.createdAt,p+'.createdAt');number(r.duration,p+'.duration',0.000001);
    check(r.mimeType==='audio/wav',p+'.mimeType');integer(r.sampleRate,p+'.sampleRate',8000,192000);check([1,2].includes(r.channelCount),p+'.channelCount');check([16,24,32].includes(r.bitDepth),p+'.bitDepth');
    check(['melody','sample'].includes(r.purpose),p+'.purpose');array(r.waveform,p+'.waveform');r.waveform.forEach(v=>number(v,p+'.waveform',0));emptyDerived(r.derivedAssets,p+'.derivedAssets');
    if(r.sample!==undefined){object(r.sample,p+'.sample');Object.entries(r.sample).forEach(([k,v])=>{if(k==='midiNote'){if(v!==null)integer(v,p+'.sample.midiNote',0,127);}else if(k==='playback'){
      object(v,p+'.sample.playback');check(Object.keys(v).every(field=>['startSeconds','loopStartSeconds','loopEndSeconds','crossfadeSeconds','releaseSeconds'].includes(field)),p+'.sample.playback');
      check(!!root.ScuLaArrangement.samplePlayback(v,r.duration),p+'.sample.playback');
    }else check(typeof v==='string',p+'.sample.'+k);});}
    object(r.source,p+'.source');const s=r.source;identity(s.assetId,p+'.source.assetId');if(s.assetId!==r.id)entity(s.assetId,p+'.source.assetId');
    if(s.integrity!==undefined){
      const v=s.integrity;
      if(!v || typeof v!=='object' || Array.isArray(v) || typeof v.digest!=='string' || v.digest.length!==64 || !/^[a-fA-F0-9]{64}$/.test(v.digest))fail('backupDigest',p+'.source.integrity');
      if(v.algorithm!=='SHA-256' || Object.keys(v).some(k=>!['algorithm','digest'].includes(k)))fail('backupIntegrityFormat',p+'.source.integrity');
    }
    check(s.immutable===true,p+'.source.immutable');integer(s.size,p+'.source.size',44,4294967303);object(s.inputSettings,p+'.source.inputSettings');
    ['captureBackend','microphone','originalFilename'].forEach(k=>{if(s[k]!==undefined)check(typeof s[k]==='string',p+'.source.'+k);});
    if(s.peak!==undefined)number(s.peak,p+'.source.peak',0);if(s.interrupted!==undefined)check(typeof s.interrupted==='boolean',p+'.source.interrupted');
    if(s.encoding!==undefined)check([1,3].includes(s.encoding) && (s.encoding!==3 || r.bitDepth===32),p+'.source.encoding');
    let filename=s.filename;
    if(s.relativePath!==undefined){string(s.relativePath,p+'.source.relativePath');check(!s.relativePath.includes('\\') && s.relativePath.split('/').every(x=>x && x!=='.' && x!=='..'),p+'.source.relativePath');
      const base=s.relativePath.split('/').pop();if(filename!==undefined)check(filename===base,p+'.source.filename / relativePath');else filename=base;
    }
    string(filename,p+'.source.filename');check(!/[\\/\x00-\x1f]/.test(filename) && /\.wav$/i.test(filename),p+'.source.filename');
    check(!references.has(filename),p+'.source.filename (duplicate reference)');references.add(filename);filenames.set(r.id,filename);
    if(r.performance!=null){const v=r.performance,q=p+'.performance';object(v,q);version(v.schemaVersion,1,q+'.schemaVersion');check(v.analyzerVersion===1 || v.analyzerVersion===2,q+'.analyzerVersion');check(v.type==='MusicalPerformance',q+'.type');
      entity(v.id,q+'.id',r.id);stamp(v.createdAt,q+'.createdAt');stamp(v.updatedAt,q+'.updatedAt');check(v.sourceAssetId===s.assetId,q+'.sourceAssetId');number(v.duration,q+'.duration',0,root.ScuLaPerformance.MAX_SECONDS);
      check(Math.abs(v.duration-r.duration)<.001,q+'.duration / source');settings(v,q);const a=v.analysis;object(a,q+'.analysis');key(a.key,q+'.analysis.key');tempo(a.tempo,q+'.analysis.tempo');
      integer(a.sampleRate,q+'.analysis.sampleRate',8000,192000);number(a.pitchHopSeconds,q+'.analysis.pitchHopSeconds',0.000001);number(a.pitchWindowSeconds,q+'.analysis.pitchWindowSeconds',0.000001);number(a.onsetHopSeconds,q+'.analysis.onsetHopSeconds',0.000001);
      array(a.rawPitchFrames,q+'.analysis.rawPitchFrames');a.rawPitchFrames.forEach(f=>{object(f,q+'.frame');number(f.time,q+'.frame.time',0);number(f.confidence,q+'.frame.confidence',0,1);number(f.rms,q+'.frame.rms',0);if(f.hz===null)check(f.midi===null && f.cents===null,q+'.frame.pitch');else{number(f.hz,q+'.frame.hz',0.000001);number(f.midi,q+'.frame.midi');number(f.cents,q+'.frame.cents');}});
      if(v.analyzerVersion===2 || a.interpretedPitchFrames!==undefined){array(a.interpretedPitchFrames,q+'.analysis.interpretedPitchFrames');check(a.interpretedPitchFrames.length===a.rawPitchFrames.length,q+'.analysis.interpretedPitchFrames.length');a.interpretedPitchFrames.forEach((f,i)=>{object(f,q+'.contourFrame');number(f.time,q+'.contourFrame.time',0);check(Math.abs(f.time-a.rawPitchFrames[i].time)<1e-6,q+'.contourFrame.time');if(f.midi!==null)number(f.midi,q+'.contourFrame.midi',0,127);});}
      array(a.onsetEnvelope,q+'.analysis.onsetEnvelope');a.onsetEnvelope.forEach(x=>number(x,q+'.envelope',0));array(a.onsets,q+'.analysis.onsets');a.onsets.forEach(x=>{object(x,q+'.onset');integer(x.frame,q+'.onset.frame',0);number(x.time,q+'.onset.time',0);number(x.strength,q+'.onset.strength',0);});
      const detected=notes(a.detectedNotes,q+'.analysis.detectedNotes',true);notes(v.notes,q+'.notes');v.notes.forEach(n=>check(n.sourceNoteId===null || detected.has(n.sourceNoteId),q+'.notes.sourceNoteId'));
    }
  });
  if(project.arrangements!==undefined)array(project.arrangements,'arrangements');
  (project.arrangements||[]).forEach((a,i)=>{
    const p='arrangements['+i+']';object(a,p);version(a.schemaVersion,1,p+'.schemaVersion');if(![1,2].includes(a.generatorVersion))fail('backupVersion',p+'.generatorVersion');check(a.type==='InstrumentalArrangement',p+'.type');entity(a.id,p+'.id');
    integer(a.version,p+'.version',1);integer(a.revision,p+'.revision',1);stamp(a.createdAt,p+'.createdAt');stamp(a.updatedAt,p+'.updatedAt');stamp(a.sourcePerformanceUpdatedAt,p+'.sourcePerformanceUpdatedAt');
    const r=recordings.get(a.sourceRecordingId);check(!!r,p+'.sourceRecordingId');check(a.sourceAssetId===r.source.assetId,p+'.sourceAssetId');
    // Reanalysis replaces the current performance; old arrangement provenance is valid.
    identity(a.sourcePerformanceId,p+'.sourcePerformanceId');if(!owners.has(a.sourcePerformanceId))entity(a.sourcePerformanceId,p+'.sourcePerformanceId',r.id);
    check(owners.get(a.sourcePerformanceId)===r.id,p+'.sourcePerformanceId');
    const v=r.id+':'+a.version;check(!versions.has(v),p+'.version (duplicate)');versions.add(v);
    const s=a.performanceSnapshot;object(s,p+'.performanceSnapshot');settings(s,p+'.performanceSnapshot');key(s.key,p+'.snapshot.key');object(s.analysis,p+'.snapshot.analysis');tempo(s.analysis.tempo,p+'.snapshot.tempo');const snapshotIds=notes(s.notes,p+'.snapshot.notes');check(s.notes.length>0,p+'.snapshot.notes');
    object(a.parts,p+'.parts');key(a.key,p+'.key');try{root.ScuLaArrangement.validate(a);}catch(_){fail('backupInvalid',p+'.controls');}
    number(a.duration,p+'.duration',0.000001,1200);
    const leadIds=new Set();root.ScuLaArrangement.PARTS.forEach(part=>{array(a.parts[part].notes,p+'.parts.'+part+'.notes');a.parts[part].notes.forEach(n=>{object(n,p+'.part.note');number(n.start,p+'.part.note.start',0,a.duration);number(n.dur,p+'.part.note.dur',0.000001,1200);check(n.start+n.dur<=a.duration+1e-6,p+'.part.note.duration');integer(n.midi,p+'.part.note.midi',0,127);number(n.vel,p+'.part.note.vel',0,1);if(n.cents!==undefined)number(n.cents,p+'.part.note.cents');if(n.velocity!==undefined)integer(n.velocity,p+'.part.note.velocity',1,127);
      if(part==='lead'){check(snapshotIds.has(n.id) && !leadIds.has(n.id),p+'.lead.note.id');leadIds.add(n.id);check(n.sourceNoteId===s.notes.find(x=>x.id===n.id).sourceNoteId,p+'.lead.note.sourceNoteId');}
    });});check(leadIds.size===snapshotIds.size,p+'.lead / snapshot notes');
    array(a.chords,p+'.chords');a.chords.forEach(c=>{object(c,p+'.chord');integer(c.bar,p+'.chord.bar',0);integer(c.root,p+'.chord.root',0,11);check(['maj','min','dim'].includes(c.q),p+'.chord.q');array(c.tones,p+'.chord.tones');c.tones.forEach(n=>integer(n,p+'.chord.tones',0,11));});
    if(a.generatorVersion===2){
      const bar=root.ScuLaArrangement.meter(a).quarters*60/a.tempoBpm,slot=bar/a.composition.harmonicRhythm;
      check(Math.abs(a.duration/bar-Math.round(a.duration/bar))<1e-6,p+'.meter duration');
      check(a.chords.length===Math.round(a.duration/slot),p+'.chord slots');
      a.chords.forEach((c,i)=>{check(c.slot===i&&c.bar===Math.floor(i/a.composition.harmonicRhythm),p+'.chord slot');integer(c.degree,p+'.chord degree',1,7);number(c.start,p+'.chord start',0,a.duration);number(c.dur,p+'.chord duration',.000001,a.duration);check(Math.abs(c.start-i*slot)<1e-6&&Math.abs(c.dur-slot)<1e-6,p+'.chord timing');if(c.compatibility!==null)number(c.compatibility,p+'.chord compatibility',0,1);});
    }
  });
  if(project.timeline!==undefined){
    array(project.timeline,'timeline');
    project.timeline.forEach((s,i)=>{const p='timeline['+i+']';object(s,p);entity(s.id,p+'.id');string(s.name,p+'.name');check(s.name.trim().length>0 && s.name.length<=120,p+'.name');identity(s.arrangementId,p+'.arrangementId');integer(s.repeats,p+'.repeats',1,16);});
    try{root.ScuLaSongTimeline.resolve(project);}catch(_){fail('backupInvalid','timeline');}
  }
  return {entities,filenames};
}
function occupied(projects,extra=[]){
  const ids=new Set(extra);projects.forEach(p=>{ids.add(p.id);(p.recordings||[]).forEach(r=>{ids.add(r.id);ids.add(r.source.assetId);if(r.performance)ids.add(r.performance.id);});(p.arrangements||[]).forEach(a=>{ids.add(a.id);ids.add(a.sourcePerformanceId);});(p.timeline||[]).forEach(s=>ids.add(s.id));});return ids;
}
async function stage(text,files,{used=new Set(),newId,cancelled=()=>false,progress=()=>{}}={}){
  const cancel=()=>{if(cancelled())fail('backupCancelled','');};cancel();let p;
  try{p=JSON.parse(text);}catch(_){fail('backupJson','');}
  const {entities,filenames}=validate(p),blobs=new Map(),byName=new Map();
  Array.from(files).forEach(f=>{const list=byName.get(f.name)||[];list.push(f);byName.set(f.name,list);});
  // Report all missing/ambiguous references before reading audio.
  const missing=[],ambiguous=[];filenames.forEach(name=>{const list=byName.get(name)||[];if(!list.length)missing.push(name);if(list.length>1)ambiguous.push(name);});
  if(missing.length || ambiguous.length)fail('backupFiles',{missing,ambiguous});
  const unverified=[];
  for(const r of p.recordings){cancel();const name=filenames.get(r.id),file=byName.get(name)[0];let meta;
    try{meta=await root.ScuLaPerformance.inspectWav(file,{cancelled,progress:(done,total)=>progress({name,done,total,phase:'inspection'})});}
    catch(e){if(e.code==='backupCancelled')throw e;fail('backupWav',name);}cancel();
    check(file.size===r.source.size && Math.abs(meta.duration-r.duration)<1e-6 && meta.sampleRate===r.sampleRate && meta.channelCount===r.channelCount && meta.bitDepth===r.bitDepth && meta.encoding===(r.source.encoding===undefined?1:r.source.encoding),'WAV / '+name);
    if(r.source.integrity){
      const digest=await root.ScuLaIntegrity.sha256(file,{cancelled,progress:(done,total)=>progress({name,done,total})});cancel();
      if(digest!==r.source.integrity.digest.toLowerCase())fail('backupMismatch',name);
    }else unverified.push(name);
    blobs.set(r.id,file);
  }
  cancel();const mapping=new Map(),reserved=new Set([...used,...entities.keys()]);
  // Every import gets its own entity namespace, even on a fresh device.
  entities.forEach((_,old)=>{let fresh;do{fresh=newId();}while(reserved.has(fresh));reserved.add(fresh);mapping.set(old,fresh);});
  const remap=v=>mapping.get(v)||v;p.id=remap(p.id);
  const audio=new Map();p.recordings.forEach(r=>{audio.set(remap(r.id),blobs.get(r.id));r.id=remap(r.id);r.source.assetId=remap(r.source.assetId);if(r.performance){r.performance.id=remap(r.performance.id);r.performance.sourceAssetId=remap(r.performance.sourceAssetId);}});
  (p.arrangements||[]).forEach(a=>{a.id=remap(a.id);a.sourceRecordingId=remap(a.sourceRecordingId);a.sourceAssetId=remap(a.sourceAssetId);a.sourcePerformanceId=remap(a.sourcePerformanceId);});
  (p.timeline||[]).forEach(s=>{s.id=remap(s.id);s.arrangementId=remap(s.arrangementId);});
  return {project:p,audio,unverified};
}
root.ScuLaSongBackup=Object.freeze({version:1,validate,occupied,stage});
})(typeof window==='undefined'?globalThis:window);
