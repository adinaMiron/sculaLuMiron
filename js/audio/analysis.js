/* Plain, dependency-free audio analysis v1. Work only on derived buffers. */
(function(root){
'use strict';
const AN_SR=22050, HOP=256, TAU2=Math.PI*2;
const yieldUI=()=>new Promise(resolve=>setTimeout(resolve,0));
const clampN=(v,a,b)=>Math.max(a,Math.min(b,v));
/* --- radix-2 FFT, used only by the onset detector --- */
function makeFFT(n){
  const co = new Float32Array(n>>1), si = new Float32Array(n>>1);
  for(let i = 0; i < (n>>1); i++){ co[i] = Math.cos(-TAU2*i/n); si[i] = Math.sin(-TAU2*i/n); }
  let bits = 0; while((1 << bits) < n) bits++;
  const rev = new Uint16Array(n);
  for(let i = 0; i < n; i++){ let r = 0; for(let b = 0; b < bits; b++) if(i & (1<<b)) r |= 1 << (bits-1-b); rev[i] = r; }
  return function(re, im){
    for(let i = 0; i < n; i++){
      const j = rev[i];
      if(j > i){ let s = re[i]; re[i] = re[j]; re[j] = s; s = im[i]; im[i] = im[j]; im[j] = s; }
    }
    for(let size = 2; size <= n; size <<= 1){
      const half = size >> 1, step = n / size;
      for(let i = 0; i < n; i += size){
        for(let j = i, k = 0; j < i + half; j++, k += step){
          const l = j + half;
          const tr = re[l]*co[k] - im[l]*si[k];
          const ti = re[l]*si[k] + im[l]*co[k];
          re[l] = re[j] - tr; im[l] = im[j] - ti;
          re[j] += tr;        im[j] += ti;
        }
      }
    }
  };
}

/* --- decoding: one pass, resampled to AN_SR, mixed to mono --------
   An OfflineAudioContext resamples while it decodes, which is both
   the fastest and the only way that works the same in every browser.
   Safari has historically refused unusual rates, hence the fallback
   through a plain AudioContext plus a linear resample. */
function readArrayBuffer(blob){
  if(blob.arrayBuffer) return blob.arrayBuffer();
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(fr.result);
    fr.onerror = () => rej(fr.error);
    fr.readAsArrayBuffer(blob);
  });
}
function decodeWith(ctx, ab){
  return new Promise((res, rej) => {
    let p = null;
    try{ p = ctx.decodeAudioData(ab, res, rej); }catch(e){ rej(e); return; }
    if(p && typeof p.then === "function") p.then(res, rej);
  });
}
async function decodeMono(blob, rate){
  const ab = await readArrayBuffer(blob);
  const OC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
  const AC = window.AudioContext || window.webkitAudioContext;
  let buf = null;
  if(OC){
    try{ buf = await decodeWith(new OC(1, Math.ceil(rate/10), rate), ab.slice(0)); }
    catch(e){ buf = null; }
  }
  if(!buf){
    if(!AC) throw new Error("no audio context");
    const ac = new AC();
    try{ buf = await decodeWith(ac, ab.slice(0)); }
    finally{ try{ ac.close(); }catch(e){} }
  }
  const ch = buf.numberOfChannels, n = buf.length;
  let mono = new Float32Array(n);
  for(let c = 0; c < ch; c++){
    const d = buf.getChannelData(c);
    for(let i = 0; i < n; i++) mono[i] += d[i];
  }
  if(ch > 1) for(let i = 0; i < n; i++) mono[i] /= ch;
  if(Math.abs(buf.sampleRate - rate) > 1) mono = resample(mono, buf.sampleRate, rate);
  return mono;
}
function resample(x, from, to){
  const n = Math.max(1, Math.round(x.length * to / from));
  const y = new Float32Array(n), r = from / to;
  for(let i = 0; i < n; i++){
    const p = i * r, j = p | 0, f = p - j;
    y[i] = j + 1 < x.length ? x[j]*(1-f) + x[j+1]*f : x[x.length-1];
  }
  return y;
}
/* halve the rate for the pitch tracker, with a 3-tap guard against
   the aliasing a bare "take every second sample" would fold in */
function decimate2(x){
  const n = x.length >> 1, y = new Float32Array(n);
  for(let i = 0; i < n; i++){
    const j = i << 1;
    const a = j > 0 ? x[j-1] : x[j];
    const c = j + 1 < x.length ? x[j+1] : x[j];
    y[i] = .25*a + .5*x[j] + .25*c;
  }
  return y;
}
function normalise(x){
  let dc = 0;
  for(let i = 0; i < x.length; i++) dc += x[i];
  dc /= (x.length || 1);
  let peak = 0;
  for(let i = 0; i < x.length; i++){ x[i] -= dc; const v = Math.abs(x[i]); if(v > peak) peak = v; }
  if(peak > 1e-5){ const g = 1/peak; for(let i = 0; i < x.length; i++) x[i] *= g; }
  return x;
}

/* --- pitch: YIN over 46 ms windows, 23 ms apart -------------------
   Time domain on purpose: at 11 kHz the lag range is only ~170
   samples, which is cheaper than an FFT per frame and far easier to
   read. `clarity` is 1 - the cumulative-mean-normalised difference at
   the winning lag, i.e. how periodic the frame actually was. */
async function trackPitch(x, rate, onStep, cancelled=()=>false){
  const W = 512;
  const tauMin = Math.max(2, Math.floor(rate/1050));
  const tauMax = Math.min(W - 1, Math.floor(rate/62));
  const need = W + tauMax;
  const frames = Math.max(0, Math.floor((x.length - need) / HOP) + 1);
  const f0 = new Float32Array(frames), clar = new Float32Array(frames), rms = new Float32Array(frames);
  const d = new Float32Array(tauMax + 2), cm = new Float32Array(tauMax + 2);
  for(let f = 0; f < frames; f++){
    if((f & 127) === 127){ if(cancelled()) throw new Error('analysisCancelled'); if(onStep) onStep(f / frames); await yieldUI(); if(cancelled()) throw new Error('analysisCancelled'); }
    const o = f * HOP;
    let e = 0;
    for(let i = 0; i < W; i++){ const v = x[o+i]; e += v*v; }
    rms[f] = Math.sqrt(e / W);
    if(rms[f] < 0.004) continue;
    for(let tau = 1; tau <= tauMax; tau++){
      let s = 0;
      for(let j = 0; j < W; j++){ const df = x[o+j] - x[o+j+tau]; s += df*df; }
      d[tau] = s;
    }
    let run = 0; cm[0] = 1;
    for(let tau = 1; tau <= tauMax; tau++){ run += d[tau]; cm[tau] = run > 0 ? d[tau]*tau/run : 1; }
    let tau = -1;
    for(let i = tauMin; i < tauMax; i++){
      if(cm[i] < 0.22 && cm[i] <= cm[i+1] && cm[i] <= cm[i-1]){ tau = i; break; }
    }
    if(tau < 0){
      let bi = tauMin, bv = cm[tauMin];
      for(let i = tauMin + 1; i <= tauMax; i++) if(cm[i] < bv){ bv = cm[i]; bi = i; }
      if(bv < 0.5) tau = bi;
    }
    if(tau < 0) continue;
    let ti = tau;
    if(tau > 1 && tau < tauMax){
      const a = cm[tau-1], b = cm[tau], c = cm[tau+1], den = a - 2*b + c;
      if(den !== 0) ti = tau + 0.5*(a - c)/den;
    }
    f0[f] = rate / ti;
    clar[f] = Math.max(0, 1 - cm[tau]);
  }
  return { f0, clar, rms, fps: rate / HOP };
}

function median(a){
  const s = a.slice().sort((p,q) => p - q);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m-1] + s[m]) / 2;
}

/* --- pitch frames → notes ----------------------------------------
   A note runs while the pitch stays inside ±0.75 semitone of where it
   started; one stray frame is forgiven (`bad`), two end the note. That
   hysteresis is what keeps a wobbling voice from shattering into
   dozens of 25 ms fragments. */
function segmentNotes(pt){
  const { f0, clar, rms, fps } = pt;
  const n = f0.length, dt = 1 / fps;
  let peak = 0;
  for(let i = 0; i < n; i++) if(rms[i] > peak) peak = rms[i];
  const floor = Math.max(0.006, peak * 0.06);
  const midi = new Float32Array(n), voiced = new Uint8Array(n);
  for(let i = 0; i < n; i++){
    if(f0[i] > 0 && clar[i] > 0.62 && rms[i] > floor){
      voiced[i] = 1;
      midi[i] = 69 + 12 * Math.log2(f0[i] / 440);
    }
  }
  // octave repair: YIN halves or doubles the period on breathy frames
  const recent = [];
  for(let i = 0; i < n; i++){
    if(!voiced[i]) continue;
    if(recent.length >= 3){
      const ref = median(recent);
      for(const shift of [12, -12]){
        if(Math.abs(midi[i] - ref) > 7 && Math.abs(midi[i] + shift - ref) < 1.5){ midi[i] += shift; break; }
      }
    }
    recent.push(midi[i]);
    if(recent.length > 5) recent.shift();
  }
  // 5-frame median smoothing across the voiced track
  const sm = Float32Array.from(midi);
  for(let i = 2; i < n - 2; i++){
    if(!voiced[i]) continue;
    const w = [];
    for(let j = i - 2; j <= i + 2; j++) if(voiced[j]) w.push(midi[j]);
    if(w.length >= 3) sm[i] = median(w);
  }

  const notes = [];
  let cur = null, bad = 0;
  const close = end => {
    if(!cur) return;
    const len = (end - cur.s) * dt;
    if(len >= 0.075 && cur.f.length){
      notes.push({ start: cur.s * dt, dur: len, midi: Math.round(median(cur.f)), vel: clampN(0.4 + 0.6 * (cur.a / (peak || 1)), 0.25, 1) });
    }
    cur = null; bad = 0;
  };
  for(let i = 0; i < n; i++){
    if(!voiced[i]){ close(i); continue; }
    const m = sm[i];
    if(!cur){ cur = { s: i, f: [m], ref: m, a: rms[i] }; bad = 0; continue; }
    if(Math.abs(m - cur.ref) < 0.75){
      cur.f.push(m); bad = 0;
      if(rms[i] > cur.a) cur.a = rms[i];
      if(cur.f.length === 3) cur.ref = median(cur.f);
    } else if(++bad >= 2){
      close(i - 1);
      cur = { s: i - 1, f: [m], ref: m, a: rms[i] }; bad = 0;
    }
  }
  close(n);
  // glue neighbours that landed on the same semitone
  const out = [];
  for(const nt of notes){
    const p = out[out.length - 1];
    if(p && p.midi === nt.midi && nt.start - (p.start + p.dur) < 0.07){
      p.dur = nt.start + nt.dur - p.start;
      p.vel = Math.max(p.vel, nt.vel);
    } else out.push(nt);
  }
  return out;
}

/* --- the beat ----------------------------------------------------
   Spectral flux gives an onset curve; its autocorrelation gives the
   period. The log-normal prior around 110 BPM is what stops a waltz
   being read as a very fast march (and vice versa). */
function onsetEnvelope(x){
  const N = 512, fft = makeFFT(N);
  const win = new Float32Array(N);
  for(let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(TAU2 * i / N);
  const frames = Math.max(1, Math.floor((x.length - N) / HOP) + 1);
  const env = new Float32Array(frames);
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array((N>>1) + 1), cur = new Float32Array((N>>1) + 1);
  for(let f = 0; f < frames; f++){
    const o = f * HOP;
    for(let i = 0; i < N; i++){ re[i] = (x[o+i] || 0) * win[i]; im[i] = 0; }
    fft(re, im);
    let flux = 0;
    for(let k = 1; k <= (N>>1); k++){
      const m = Math.sqrt(re[k]*re[k] + im[k]*im[k]);
      cur[k] = m;
      const dd = m - prev[k];
      if(dd > 0) flux += dd;
    }
    env[f] = flux;
    const sw = prev; prev = cur; cur = sw;
  }
  // subtract a local mean, keep what is left above it
  const out = new Float32Array(frames);
  const w = 10;
  for(let i = 0; i < frames; i++){
    let s = 0, c = 0;
    for(let j = Math.max(0, i-w); j <= Math.min(frames-1, i+w); j++){ s += env[j]; c++; }
    out[i] = Math.max(0, env[i] - s/c);
  }
  let mx = 0;
  for(let i = 0; i < frames; i++) if(out[i] > mx) mx = out[i];
  if(mx > 0) for(let i = 0; i < frames; i++) out[i] /= mx;
  return out;
}
/* Same onset kernel for Song, with cooperative checkpoints. Voice keeps the
   synchronous entry point above and its existing timing. */
async function onsetEnvelopeCooperative(x,check=()=>{},progress=()=>{}){
  const N=512,fft=makeFFT(N),win=new Float32Array(N);
  for(let i=0;i<N;i++)win[i]=.5-.5*Math.cos(TAU2*i/N);
  const frames=Math.max(1,Math.floor((x.length-N)/HOP)+1),env=new Float32Array(frames);
  const re=new Float32Array(N),im=new Float32Array(N);
  let prev=new Float32Array((N>>1)+1),cur=new Float32Array((N>>1)+1);
  for(let f=0;f<frames;f++){
    if((f&63)===0){check();progress(f/frames);await yieldUI();check();}
    const o=f*HOP;for(let i=0;i<N;i++){re[i]=(x[o+i]||0)*win[i];im[i]=0;}
    fft(re,im);let flux=0;
    for(let k=1;k<=(N>>1);k++){const m=Math.sqrt(re[k]*re[k]+im[k]*im[k]);cur[k]=m;const dd=m-prev[k];if(dd>0)flux+=dd;}
    env[f]=flux;const sw=prev;prev=cur;cur=sw;
  }
  const out=new Float32Array(frames),w=10;
  for(let i=0;i<frames;i++){
    let s=0,c=0;for(let j=Math.max(0,i-w);j<=Math.min(frames-1,i+w);j++){s+=env[j];c++;}
    out[i]=Math.max(0,env[i]-s/c);
  }
  let mx=0;for(let i=0;i<frames;i++)if(out[i]>mx)mx=out[i];
  if(mx>0)for(let i=0;i<frames;i++)out[i]/=mx;
  check();progress(1);return out;
}
function detectTempo(env, fps){
  const minLag = Math.max(2, Math.round(fps * 60 / 200));
  const maxLag = Math.min(env.length - 2, Math.round(fps * 60 / 55));
  // Starting the best score at 0 rather than -1 means a signal with no onsets
  // at all - a held hum, a sine - keeps the plain 100 BPM default instead of
  // being handed whichever lag happened to come first.
  let bestLag = Math.round(fps * 60 / 100), bestScore = 0;
  for(let lag = minLag; lag <= maxLag; lag++){
    let s = 0, c = 0;
    for(let i = 0; i + lag < env.length; i++){ s += env[i] * env[i+lag]; c++; }
    if(!c) continue;
    const bpm = 60 * fps / lag;
    const prior = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 110) / 0.5, 2));
    const score = (s / c) * prior;
    if(score > bestScore){ bestScore = score; bestLag = lag; }
  }
  return bestLag;
}
function beatPhase(env, lag){
  let best = 0, bestS = -1;
  for(let p = 0; p < lag; p++){
    let s = 0, c = 0;
    for(let i = p; i < env.length; i += lag){
      s += env[i] + 0.5*(env[i-1] || 0) + 0.5*(env[i+1] || 0);
      c++;
    }
    if(c && s/c > bestS){ bestS = s/c; best = p; }
  }
  return best;
}

/* --- key, scale, chords ------------------------------------------- */
const PROF_MAJ = [6.35,2.23,3.48,2.33,4.38,4.09,2.52,5.19,2.39,3.66,2.29,2.88];
const PROF_MIN = [6.33,2.68,3.52,5.38,2.60,3.53,2.54,4.75,3.98,2.69,3.34,3.17];
function pcWeights(notes){
  const w = new Float64Array(12);
  for(const n of notes) w[((n.midi % 12) + 12) % 12] += n.dur;
  return w;
}
/* Krumhansl-Schmuckler, and the correlation matters: a bare dot product
   reads a C major phrase as its relative E minor, because the minor profile
   simply carries larger numbers. Centring both sides first is what makes the
   F natural - absent from E minor - count against it. */
function keyCorr(w, prof, r){
  let mw = 0, mp = 0;
  for(let i = 0; i < 12; i++){ mw += w[i]; mp += prof[i]; }
  mw /= 12; mp /= 12;
  let num = 0, dw = 0, dp = 0;
  for(let i = 0; i < 12; i++){
    const a = w[(i + r) % 12] - mw, b = prof[i] - mp;
    num += a * b; dw += a * a; dp += b * b;
  }
  return (dw > 0 && dp > 0) ? num / Math.sqrt(dw * dp) : -1;
}
function detectKey(notes){
  const w = pcWeights(notes);
  let total = 0;
  for(let i = 0; i < 12; i++) total += w[i];
  if(total <= 0) return { tonic: 0, mode: "major" };
  let best = { tonic: 0, mode: "major", score: -Infinity };
  for(let r = 0; r < 12; r++){
    for(const [mode, prof] of [["major", PROF_MAJ], ["minor", PROF_MIN]]){
      const s = keyCorr(w, prof, r);
      if(s > best.score) best = { tonic: r, mode, score: s };
    }
  }
  return best;
}

root.ScuLaAnalysis=Object.freeze({version:1,AN_SR,HOP,decodeMono,resample,normalise,decimate2,trackPitch,segmentNotes,onsetEnvelope,onsetEnvelopeCooperative,detectTempo,beatPhase,detectKey,median});
})(typeof window==='undefined'?globalThis:window);
