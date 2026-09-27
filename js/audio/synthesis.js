/* ScuLaSynthesis v1. Voice's original instrument/harmony/render kernels.
   Plain script: no modules, fetches, samples or browser-only dependencies. */
(function(root){
'use strict';
const TAU2=Math.PI*2,clampN=(v,a,b)=>v<a?a:(v>b?b:v);
const INSTR = {
  piano:   {k:"instPiano",   gm:0,  lo:33, hi:96, partials:[1,.55,.32,.18,.11,.07,.045,.03,.02], inharm:.0004, damp:2.6, dampP:.6,  atk:.004, dec:0,   sus:1,   rel:.16, gain:.95},
  guitar:  {k:"instGuitar",  gm:25, lo:40, hi:88, ks:true, ksHold:.012,                                          atk:.002, dec:0,   sus:1,   rel:.12, gain:2.2},
  harp:    {k:"instHarp",    gm:46, lo:36, hi:96, partials:[1,.4,.22,.12,.07,.04],                 damp:2.1, dampP:.7,  atk:.003, dec:0,   sus:1,   rel:.2,  gain:.9},
  box:     {k:"instBox",     gm:10, lo:60, hi:105,partials:[1,.28,.14,.07],          inharm:.004,  damp:4.2, dampP:.8,  atk:.002, dec:0,   sus:1,   rel:.25, gain:.85},
  xylo:    {k:"instXylo",    gm:13, lo:53, hi:96, partials:[1,0,.32,0,0,.12],        inharm:.012,  damp:7,   dampP:.5,  atk:.002, dec:0,   sus:1,   rel:.1,  gain:.85},
  violin:  {k:"instViolin",  gm:40, lo:55, hi:96, partials:[1,.7,.55,.42,.3,.22,.16,.11,.08,.05],  atk:.075, dec:.22, sus:.82, rel:.14, vibR:5.6, vibD:.006, noise:.02,  gain:.6},
  cello:   {k:"instCello",   gm:42, lo:36, hi:76, partials:[1,.75,.5,.34,.22,.14,.09,.05],         atk:.1,   dec:.28, sus:.85, rel:.2,  vibR:4.8, vibD:.005, noise:.018, gain:.66},
  strings: {k:"instStrings", gm:48, lo:40, hi:88, partials:[1,.62,.4,.26,.17,.1,.06],              atk:.22,  dec:.4,  sus:.9,  rel:.45, vibR:4.2, vibD:.004, noise:.012, gain:.48},
  flute:   {k:"instFlute",   gm:73, lo:60, hi:100,partials:[1,.16,.06,.02],                        atk:.06,  dec:.2,  sus:.9,  rel:.12, vibR:5,   vibD:.004, noise:.07,  gain:.7},
  clarinet:{k:"instClarinet",gm:71, lo:50, hi:91, partials:[1,.04,.5,.03,.28,.02,.16,.01,.08],     atk:.045, dec:.16, sus:.9,  rel:.1,  vibR:4.5, vibD:.002, noise:.03,  gain:.6},
  trumpet: {k:"instTrumpet", gm:56, lo:54, hi:86, partials:[1,.8,.65,.5,.4,.3,.22,.15,.1,.06],     atk:.05,  dec:.18, sus:.85, rel:.1,  vibR:5.2, vibD:.003, noise:.02,  gain:.5},
  organ:   {k:"instOrgan",   gm:19, lo:36, hi:96, partials:[1,.5,.7,.35,0,.28,0,.2],               atk:.012, dec:.05, sus:1,   rel:.06, gain:.55},
  synth:   {k:"instSynth",   gm:81, lo:36, hi:96, partials:[1,.5,.33,.25,.2,.16,.14,.12,.1,.09,.08,.07], atk:.02, dec:.3, sus:.7, rel:.2, vibR:5, vibD:.003, gain:.46},
  bass:    {k:"instBass",    gm:33, lo:24, hi:60, partials:[1,.42,.2,.08,.04],                     damp:1.6, dampP:.7, atk:.006, dec:0, sus:1, rel:.15, gain:1.05}
};
const LEAD_ORDER  = ["piano","guitar","violin","cello","flute","clarinet","trumpet","organ","harp","xylo","box","strings","synth"];
const CHORD_ORDER = ["piano","guitar","strings","organ","harp","synth"];

const NOTE_RO = ["Do","Do♯","Re","Mi♭","Mi","Fa","Fa♯","Sol","La♭","La","Si♭","Si"];
const NOTE_EN = ["C","C♯","D","E♭","E","F","F♯","G","A♭","A","B♭","B"];
const SCALES  = { major:[0,2,4,5,7,9,11], minor:[0,2,3,5,7,8,10], penta:[0,2,4,7,9], chrom:null };

/* --- a shared sine table: one lookup per partial per sample beats a
   Math.sin() call by an order of magnitude, and a few hundred notes
   is a few hundred million lookups. --- */
const TSZ = 16384, TMASK = TSZ - 1;
const SINE = new Float32Array(TSZ);
for(let i = 0; i < TSZ; i++) SINE[i] = Math.sin(TAU2 * i / TSZ);

function snapMidi(m, tonic, set){
  if(!set) return m;
  const base = Math.floor((m - tonic) / 12) * 12 + tonic;
  let best = m, bd = 1e9;
  for(let k = -1; k <= 1; k++){
    for(const s of set){
      const c = base + k*12 + s, d = Math.abs(c - m);
      if(d < bd){ bd = d; best = c; }
    }
  }
  return best;
}
const QUAL = { maj:[0,4,7], min:[0,3,7], dim:[0,3,6] };
const DEG_MAJ = [[0,"maj"],[2,"min"],[4,"min"],[5,"maj"],[7,"maj"],[9,"min"],[11,"dim"]];
const DEG_MIN = [[0,"min"],[2,"dim"],[3,"maj"],[5,"min"],[7,"min"],[8,"maj"],[10,"maj"]];
/* One chord per bar: the diatonic triad that covers the most melody,
   with a nudge toward I/IV/V so an ambiguous bar still sounds settled,
   and a plain tonic on the last bar so the piece lands. */
function chordsFor(notes, origin, barLen, bars, tonic, mode){
  const degs = mode === "minor" ? DEG_MIN : DEG_MAJ;
  const out = [];
  let prev = null;
  for(let b = 0; b < bars; b++){
    const t0 = origin + b*barLen, t1 = t0 + barLen;
    const w = new Float64Array(12);
    let tot = 0;
    for(const n of notes){
      const s = Math.max(n.start, t0), e = Math.min(n.start + n.dur, t1);
      if(e <= s) continue;
      w[((n.midi % 12) + 12) % 12] += e - s;
      tot += e - s;
    }
    let pick = null;
    if(tot > 0){
      let bestS = -Infinity;
      for(const [deg, q] of degs){
        const root = (tonic + deg) % 12;
        let s = 0;
        for(const iv of QUAL[q]) s += w[(root + iv) % 12];
        if(deg === 0) s += tot * 0.14;
        if(deg === 5 || deg === 7) s += tot * 0.07;
        if(s > bestS){ bestS = s; pick = { root, q, deg }; }
      }
    }
    if(!pick) pick = prev || { root: tonic, q: mode === "minor" ? "min" : "maj", deg: 0 };
    if(b === bars - 1) pick = { root: tonic, q: mode === "minor" ? "min" : "maj", deg: 0 };
    prev = pick;
    out.push({ bar: b, root: pick.root, q: pick.q, tones: QUAL[pick.q].map(iv => (pick.root + iv) % 12) });
  }
  return out;
}

/* --- synthesis ----------------------------------------------------
   One kernel covers every pitched instrument: a bank of partials read
   out of the sine table, an ADSR without the R (the release is applied
   where the note is placed, so one rendered tone serves notes of any
   length), an optional per-partial exponential damping that turns a
   held tone into a struck one, vibrato, and a breath/bow noise layer.
   The guitar gets its own kernel — a plucked string is a delay line,
   not a sum of sines. */
function renderTone(sp, freq, hold, sr){
  const n = Math.ceil((hold + 0.03) * sr) + 2;
  const out = new Float32Array(n);
  const nyq = sr * 0.45;
  const inc = [], amp = [], gain = [], dk = [];
  const damp = sp.damp || 0, dampP = sp.dampP || 1;
  for(let p = 1; p <= sp.partials.length; p++){
    const f = freq * p * (sp.inharm ? Math.sqrt(1 + sp.inharm*p*p) : 1);
    if(f > nyq) break;
    const a = sp.partials[p-1];
    if(!a) continue;
    inc.push(f / sr); amp.push(a); gain.push(1);
    dk.push(damp ? Math.exp(-damp * Math.pow(p, dampP) / sr) : 1);
  }
  const K = inc.length;
  if(!K) return out;
  const ph = new Float32Array(K);
  for(let k = 0; k < K; k++) ph[k] = Math.random();
  const atk = Math.max(0.001, sp.atk || 0.005);
  const dec = sp.dec || 0, sus = sp.dec ? (sp.sus == null ? 1 : sp.sus) : 1;
  const decK = dec > 0 ? Math.exp(-1 / (dec * sr)) : 0;
  const vibD = sp.vibD || 0, vibInc = (sp.vibR || 0) / sr;
  const nzAmp = sp.noise || 0;
  let dcy = 1, vph = 0, lp = 0, env = 0, norm = 0;
  for(let k = 0; k < K; k++) norm += amp[k];
  const scale = (sp.gain || 1) / Math.max(1, norm * 0.62);
  const atkN = atk * sr;
  for(let i = 0; i < n; i++){
    if(i < atkN) env = i / atkN;
    else { if(dec > 0){ dcy *= decK; env = sus + (1 - sus) * dcy; } else env = 1; }
    let vib = 1;
    if(vibD){
      vib = 1 + vibD * SINE[(vph * TSZ) & TMASK];
      vph += vibInc; if(vph >= 1) vph -= 1;
    }
    let s = 0;
    for(let k = 0; k < K; k++){
      if(dk[k] !== 1) gain[k] *= dk[k];
      let p = ph[k] + inc[k] * vib;
      if(p >= 1) p -= 1;
      ph[k] = p;
      s += gain[k] * amp[k] * SINE[(p * TSZ) & TMASK];
    }
    if(nzAmp){
      lp += 0.28 * ((Math.random()*2 - 1) - lp);
      s += lp * nzAmp * (norm * 0.5);
    }
    out[i] = s * env * scale;
  }
  return out;
}
/* Karplus-Strong: a burst of noise round a lowpassed delay line. The
   per-pass decay is derived from the loop length so a high string does
   not die faster than a low one. */
function renderString(sp, freq, hold, sr){
  const n = Math.ceil((hold + 0.03) * sr) + 2;
  const out = new Float32Array(n);
  const L = Math.max(2, Math.round(sr / freq));
  const line = new Float32Array(L);
  let lp = 0;
  for(let i = 0; i < L; i++){
    lp += 0.55 * ((Math.random()*2 - 1) - lp);
    line[i] = lp;
  }
  const decay = Math.pow(sp.ksHold || 0.012, L / sr);
  const atkN = Math.max(1, (sp.atk || 0.002) * sr);
  let idx = 0, prev = 0;
  for(let i = 0; i < n; i++){
    const cur = line[idx];
    const v = decay * 0.5 * (cur + prev);
    prev = cur;
    line[idx] = v;
    if(++idx >= L) idx = 0;
    out[i] = v * (sp.gain || 1) * (i < atkN ? i / atkN : 1);
  }
  return out;
}
function renderInstrument(id, midi, hold, sr){
  const sp = INSTR[id] || INSTR.piano;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  return sp.ks ? renderString(sp, freq, hold, sr) : renderTone(sp, freq, hold, sr);
}

/* --- drums: three one-shots, no samples --------------------------- */
function renderKick(sr){
  const n = Math.ceil(0.42 * sr), out = new Float32Array(n);
  let ph = 0;
  for(let i = 0; i < n; i++){
    const t = i / sr;
    const f = 45 + 95 * Math.exp(-t / 0.035);
    ph += f / sr; if(ph >= 1) ph -= 1;
    const body = SINE[(ph * TSZ) & TMASK] * Math.exp(-t / 0.16);
    const click = (Math.random()*2 - 1) * Math.exp(-t / 0.004) * 0.35;
    out[i] = (body + click) * 0.95;
  }
  return out;
}
function renderSnare(sr){
  const n = Math.ceil(0.3 * sr), out = new Float32Array(n);
  let hp = 0, x1 = 0, ph = 0;
  for(let i = 0; i < n; i++){
    const t = i / sr;
    const x = Math.random()*2 - 1;
    hp = 0.72 * (hp + x - x1); x1 = x;
    ph += 190 / sr; if(ph >= 1) ph -= 1;
    const tone = SINE[(ph * TSZ) & TMASK] * Math.exp(-t / 0.055) * 0.4;
    out[i] = (hp * Math.exp(-t / 0.09) + tone) * 0.6;
  }
  return out;
}
function renderHat(sr, open){
  const dec = open ? 0.22 : 0.045;
  const n = Math.ceil((open ? 0.4 : 0.12) * sr), out = new Float32Array(n);
  let hp = 0, x1 = 0;
  for(let i = 0; i < n; i++){
    const x = Math.random()*2 - 1;
    hp = 0.92 * (hp + x - x1); x1 = x;
    out[i] = hp * Math.exp(-(i/sr) / dec) * 0.34;
  }
  return out;
}

/* --- mixing -------------------------------------------------------
   `place` is where the release lives: the cached tone is held, and the
   note that uses it is cut and faded here. That is why a few dozen
   rendered tones can serve a few hundred notes. */
function place(L, R, buf, startSec, holdSec, relSec, gain, pan, sr){
  const s0 = Math.round(startSec * sr);
  if(s0 >= L.length) return;
  const gl = gain * Math.cos((pan + 1) * Math.PI / 4);
  const gr = gain * Math.sin((pan + 1) * Math.PI / 4);
  const hold = Math.max(1, Math.round(holdSec * sr));
  const fade = Math.max(1, Math.round(relSec * sr));
  const n = Math.min(buf.length, hold + fade, L.length - s0);
  for(let i = 0; i < n; i++){
    let e = 1;
    if(i > hold){ e = 1 - (i - hold) / fade; if(e <= 0) break; }
    const v = buf[i] * e;
    L[s0+i] += v * gl;
    R[s0+i] += v * gr;
  }
}
/* Schroeder reverb — four damped combs into two allpasses, the right
   channel offset so the room has a width. Generated, like everything
   else here, rather than convolved with somebody's impulse response. */
function reverbTail(x, sr, offset){
  const sc = sr / 44100;
  const combs = [1116, 1188, 1277, 1356].map(d => Math.round((d + offset) * sc));
  const aps   = [556, 441].map(d => Math.round((d + offset) * sc));
  const n = x.length, wet = new Float32Array(n);
  for(const dl of combs){
    const buf = new Float32Array(dl);
    let i = 0, store = 0;
    for(let s = 0; s < n; s++){
      const y = buf[i];
      wet[s] += y;
      store = y * 0.72 + store * 0.28;
      buf[i] = x[s] + store * 0.79;
      if(++i >= dl) i = 0;
    }
  }
  for(let s = 0; s < n; s++) wet[s] *= 0.25;
  for(const dl of aps){
    const buf = new Float32Array(dl);
    let i = 0;
    for(let s = 0; s < n; s++){
      const y = buf[i];
      const o = -wet[s] + y;
      buf[i] = wet[s] + y * 0.5;
      if(++i >= dl) i = 0;
      wet[s] = o;
    }
  }
  return wet;
}
function finishMix(L, R, sr, wetAmt){
  const wl = reverbTail(L, sr, 0), wr = reverbTail(R, sr, 23);
  let peak = 0;
  for(let i = 0; i < L.length; i++){
    L[i] += wl[i] * wetAmt;
    R[i] += wr[i] * wetAmt;
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if(a > peak) peak = a;
    if(b > peak) peak = b;
  }
  // normalise, then a gentle saturation that lifts the quiet middle
  // without letting the loudest hit clip: 0.95 in maps to 0.95 out
  const g = peak > 0 ? 0.95 / peak : 1;
  const drive = 1.2, k = 0.95 / Math.tanh(drive * 0.95);
  for(let i = 0; i < L.length; i++){
    L[i] = Math.tanh(L[i] * g * drive) * k;
    R[i] = Math.tanh(R[i] * g * drive) * k;
  }
}

/* --- WAV (16-bit PCM stereo) --------------------------------------- */
function wavBlob(L, R, sr){
  const n = L.length, bytes = 44 + n * 4;
  const ab = new ArrayBuffer(bytes), dv = new DataView(ab);
  const str = (o, s) => { for(let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF");  dv.setUint32(4, bytes - 8, true);  str(8, "WAVE");
  str(12, "fmt "); dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true); dv.setUint16(22, 2, true);
  dv.setUint32(24, sr, true); dv.setUint32(28, sr * 4, true);
  dv.setUint16(32, 4, true);  dv.setUint16(34, 16, true);
  str(36, "data"); dv.setUint32(40, n * 4, true);
  let o = 44;
  for(let i = 0; i < n; i++){
    let l = L[i]; if(l > 1) l = 1; else if(l < -1) l = -1;
    let r = R[i]; if(r > 1) r = 1; else if(r < -1) r = -1;
    dv.setInt16(o, l * 32767 | 0, true); o += 2;
    dv.setInt16(o, r * 32767 | 0, true); o += 2;
  }
  return new Blob([ab], { type: "audio/wav" });
}

/* --- MIDI (format 1) -----------------------------------------------
   The same arrangement as notes rather than sound, so the person can
   drop it into any DAW and swap the instruments for their own. */
function vlq(v){
  const b = [v & 0x7f];
  v >>>= 7;
  while(v > 0){ b.unshift((v & 0x7f) | 0x80); v >>>= 7; }
  return b;
}
function midiTrack(events, name){
  const data = [];
  const push = a => { for(const v of a) data.push(v); };
  push(vlq(0)); push([0xFF, 0x03, name.length]);
  for(let i = 0; i < name.length; i++) data.push(name.charCodeAt(i) & 0x7f);
  events.sort((a, b) => a.t - b.t || a.o - b.o);
  let last = 0;
  for(const e of events){
    push(vlq(Math.max(0, e.t - last)));
    push(e.d);
    last = e.t;
  }
  push(vlq(0)); push([0xFF, 0x2F, 0x00]);
  const head = [0x4D, 0x54, 0x72, 0x6B,
    (data.length >>> 24) & 255, (data.length >>> 16) & 255, (data.length >>> 8) & 255, data.length & 255];
  return head.concat(data);
}
function midiBlob(parts, bpm){
  const TPQ = 480;
  const bytes = [0x4D, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1,
    ((parts.length + 1) >> 8) & 255, (parts.length + 1) & 255, (TPQ >> 8) & 255, TPQ & 255];
  const us = Math.round(60000000 / bpm);
  const tempo = [{ t: 0, o: 0, d: [0xFF, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] },
                 { t: 0, o: 1, d: [0xFF, 0x58, 0x04, 4, 2, 24, 8] }];
  for(const b of midiTrack(tempo, "Caiet vocal")) bytes.push(b);
  for(const p of parts){
    const ev = [];
    if(p.ch !== 9) ev.push({ t: 0, o: 0, d: [0xC0 | p.ch, p.gm & 0x7f] });
    for(const n of p.notes){
      const on = Math.round(n.start / (60 / bpm) * TPQ);
      const off = Math.max(on + 1, Math.round((n.start + n.dur) / (60 / bpm) * TPQ));
      const v = clampN(Math.round(n.vel * 110) + 12, 1, 127);
      ev.push({ t: on,  o: 1, d: [0x90 | p.ch, clampN(n.midi, 0, 127), v] });
      ev.push({ t: off, o: 0, d: [0x80 | p.ch, clampN(n.midi, 0, 127), 64] });
    }
    for(const b of midiTrack(ev, p.name)) bytes.push(b);
  }
  return new Blob([new Uint8Array(bytes)], { type: "audio/midi" });
}

function fitRange(m, sp){
  while(m < sp.lo) m += 12;
  while(m > sp.hi) m -= 12;
  return clampN(m, 0, 127);
}
function chordVoicing(c){
  const base = 55;                                   // just under middle C
  const root = base + ((((c.root - base) % 12) + 12) % 12);
  return QUAL[c.q].map(iv => root + iv);
}

root.ScuLaSynthesis=Object.freeze({version:1,reverbTail,midiTrack,INSTR,LEAD_ORDER,CHORD_ORDER,NOTE_RO,NOTE_EN,SCALES,snapMidi,chordsFor,fitRange,chordVoicing,renderInstrument,renderKick,renderSnare,renderHat,place,finishMix,wavBlob,midiBlob});
})(typeof window==='undefined'?globalThis:window);
