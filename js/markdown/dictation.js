/* ============================================================
   Voice dictation — the Caiet vocal transcriber writing into the
   open chapter. It reads the API / engine settings saved on the
   Caiet vocal page (the shared "caiet-vocal:settings" blob) and has
   no settings UI of its own. Transcribed text lands at the caret;
   when the editor has no caret it is appended on a fresh line after
   the last one.
   The API engine cuts the recording at pauses and sends each phrase
   on its own, with no `language` and no `prompt`, so every phrase is
   written in the language it was spoken (Romanian / English, never
   translated) and lands as soon as it returns, in spoken order. It
   always uses whisper-large-v3 on Groq and ignores the Caiet vocal
   language, hint and segment settings. The browser "live" engine
   still follows the saved language.
   Mirrors voice.html §§ 2, 9–11 for the settings and the live engine.
   ============================================================ */
(function(){
  const SETTINGS_KEY = "caiet-vocal:settings";
  const PROVIDERS = {
    groq:{ url:"https://api.groq.com/openai/v1/audio/transcriptions",
           chatUrl:"https://api.groq.com/openai/v1/chat/completions" },
    openai:{ url:"https://api.openai.com/v1/audio/transcriptions",
             chatUrl:"https://api.openai.com/v1/chat/completions" },
    custom:{ url:"", chatUrl:"" }
  };
  const DEFAULTS = {
    engine:"api", provider:"groq", key:"", model:"whisper-large-v3",
    endpoint:"", hint:"", lang:"ro", segMin:5, tidy:false,
    tidyModel:"llama-3.3-70b-versatile"
  };
  let S = Object.assign({}, DEFAULTS);

  async function loadSettings(){
    let raw = null;
    try{ raw = await store.get(SETTINGS_KEY); }catch(e){}
    S = Object.assign({}, DEFAULTS);
    if(raw){ try{ Object.assign(S, JSON.parse(raw)); }catch(e){} }
    if(!(S.provider in PROVIDERS)) S.provider = "groq";
    return S;
  }

  /* ── where dictated text goes ──
     Defaults to the main editor textarea, but toggleDictation() accepts an
     override target — the 💡 idea modal points it at #idea-text so the same
     engine/queue/pill machinery can dictate into either box. Every 🎤 press
     is a session with its own target and insertion point. */
  let lastCaret = null;   // editor selection captured the moment focus leaves it
  editor.addEventListener("blur", () => {
    lastCaret = { start: editor.selectionStart, end: editor.selectionEnd };
  });
  function newSession(target){
    return { target, ins:{ mode:"append", pos:0, emitted:false, started:false },
             next:0, slots:[], cancelled:false, recording:true, ctrls:new Set() };
  }
  function beginInsert(session){
    const ins = session.ins, target = session.target;
    ins.emitted = false; ins.started = true;
    if(document.activeElement === target){
      ins.mode = "cursor"; ins.pos = target.selectionEnd;
    } else if(target === editor && lastCaret){
      ins.mode = "cursor"; ins.pos = Math.min(lastCaret.end, editor.value.length);
    } else {
      ins.mode = "append"; ins.pos = target.value.length;
    }
  }
  function emit(session, raw){
    const text = (raw || "").replace(/\s+/g, " ").trim();
    if(!text) return;
    if(!session.ins.started) beginInsert(session);   // lazy: right before the first insertion
    const ins = session.ins, target = session.target;
    const val = target.value;
    const at = (ins.mode === "cursor" && document.activeElement === target)
      ? target.selectionEnd
      : Math.min(ins.pos, val.length);
    const advanceCaret = target === editor && document.activeElement !== editor &&
      ins.mode === "cursor" && lastCaret && lastCaret.end === at;
    const before = val.slice(0, at);
    let prefix = "";
    if(ins.mode === "append" && !ins.emitted && before && !/\n\n$/.test(before)){
      prefix = before.endsWith("\n") ? "\n" : "\n\n";
    } else if(before && !/\s$/.test(before)){
      prefix = " ";
    }
    const chunk = prefix + text;
    target.setRangeText(chunk, at, at, "end");
    ins.pos = at + chunk.length;
    if(advanceCaret) lastCaret = { start:ins.pos, end:ins.pos };
    ins.emitted = true;
    target.selectionStart = target.selectionEnd = ins.pos;
    target.scrollTop = target.scrollHeight;
    if(target === editor){ updatePreview(); updateStatus(); scheduleAutosave(); }
    else { target.dispatchEvent(new Event("input", { bubbles:true })); }
  }

  /* ── status pill + button state ── */
  function showPill(state, interim){
    document.getElementById("dictate-pill-state").textContent = state || "";
    document.getElementById("dictate-pill-interim").textContent = interim || "";
    document.getElementById("dictate-pill").hidden = false;
  }
  function hidePill(){ document.getElementById("dictate-pill").hidden = true; }
  function setBtn(targetEl, on){
    const id = targetEl === editor ? "btn-dictate" : "btn-idea-dictate";
    const b = document.getElementById(id);
    if(!b) return;
    b.classList.toggle("active", on);
    /* Keep the label, title and accessible name in sync with recording state. */
    b.setAttribute("data-i", on ? "dictateStopBtn" : "dictateBtn");
    b.setAttribute("data-i-title", on ? "dictateStopTip" : "dictateTip");
    if(on) b.setAttribute("data-i-aria", "dictateStopAria");
    else { b.removeAttribute("data-i-aria"); b.removeAttribute("aria-label"); }
    b.textContent = t(b.getAttribute("data-i"));
    b.title = t(b.getAttribute("data-i-title"));
    if(on) b.setAttribute("aria-label", t("dictateStopAria"));
  }
  function toast(msg){ try{ if(window.ScuLaFolder) window.ScuLaFolder.toast(msg); }catch(e){} }
  function fail(msg, targetEl){
    hidePill(); setBtn(targetEl || editor, false); toast(msg);
    if(pendingCount()) refreshPill();
  }

  /* ── Phrase cutter: PCM in, one call per phrase out. Pure — no DOM, no
     Web Audio — so it can be driven with synthetic samples. ── */
  const PH_FRAME_MS   = 20;     // analysis frame
  const PH_START_DB   = -50;    // absolute floor for "speech starts"
  const PH_START_OVER = 10;     // dB above noise floor to count as speech
  const PH_KEEP_DB    = -55;    // absolute floor for "still speaking" (hysteresis)
  const PH_KEEP_OVER  = 6;      // dB above noise floor to count as still speaking
  const PH_ONSET      = 3;      // consecutive speech frames that start a phrase (60 ms)
  const PH_PREROLL_MS = 300;    // audio kept before the onset
  const PH_PAUSE_MS   = 700;    // silence that ends a phrase
  const PH_TAIL_MS    = 200;    // silence kept after the last voiced frame
  const PH_MIN_MS     = 500;    // shorter voiced span → not sent
  const PH_SOFT_MS    = 25000;  // after this, end at the first 200 ms pause
  const PH_HARD_MS    = 30000;  // never longer than this

  function makePhraser(opts){
    const sampleRate = opts.sampleRate, onPhrase = opts.onPhrase;
    const F = Math.max(1, Math.round(sampleRate * PH_FRAME_MS / 1000));
    const preFrames = Math.ceil(PH_PREROLL_MS / PH_FRAME_MS);
    const pauseFrames = Math.ceil(PH_PAUSE_MS / PH_FRAME_MS);
    const tailFrames = Math.ceil(PH_TAIL_MS / PH_FRAME_MS);
    const softFrames = Math.round(PH_SOFT_MS / PH_FRAME_MS);
    const hardFrames = Math.round(PH_HARD_MS / PH_FRAME_MS);
    let carry = new Float32Array(0);
    let idx = 0;                 // index of the next frame
    let floor = -60;
    let ring = [];               // outside a phrase: recent frames { d, i }
    let run = 0;                 // consecutive speech frames outside a phrase
    let inPhrase = false;
    let frames = [], voiceStartI = 0, lastVoicedI = 0, silent = 0;
    let count = 0;

    function endPhrase(hard){
      const firstI = frames[0].i;
      const keep = Math.min(frames.length, lastVoicedI + tailFrames - firstI + 1);
      const sent = frames.slice(0, keep);
      const rest = frames.slice(keep);
      inPhrase = false; frames = []; silent = 0; run = 0;
      ring = hard ? [] : rest.slice(-(preFrames + PH_ONSET));
      const voicedSec = (lastVoicedI + 1 - voiceStartI) * F / sampleRate;
      if(voicedSec * 1000 < PH_MIN_MS) return;
      const samples = new Float32Array(sent.length * F);
      sent.forEach((f, k) => samples.set(f.d, k * F));
      count++;
      onPhrase(samples, { index:count, startSec: firstI * F / sampleRate, voicedSec });
    }
    function frame(d){
      const i = idx++;
      let sum = 0;
      for(let k = 0; k < d.length; k++) sum += d[k] * d[k];
      const db = 20 * Math.log10(Math.sqrt(sum / d.length) + 1e-10);
      if(inPhrase){
        frames.push({ d, i });
        if(db > Math.max(PH_KEEP_DB, floor + PH_KEEP_OVER)){ lastVoicedI = i; silent = 0; }
        else silent++;
        if(frames.length >= hardFrames) endPhrase(true);
        else if(silent >= pauseFrames || (frames.length >= softFrames && silent >= 10)) endPhrase(false);
        return;
      }
      const speech = db > Math.max(PH_START_DB, floor + PH_START_OVER);
      ring.push({ d, i });
      if(ring.length > preFrames + PH_ONSET) ring.shift();
      if(!speech){
        floor = Math.min(-35, Math.max(-75, floor * 0.95 + db * 0.05));
        run = 0;
        return;
      }
      if(++run < PH_ONSET) return;
      inPhrase = true; silent = 0; run = 0;
      frames = ring; ring = [];
      voiceStartI = frames[frames.length - PH_ONSET].i;
      lastVoicedI = i;
    }
    return {
      push(chunk){
        let buf = chunk;
        if(carry.length){
          buf = new Float32Array(carry.length + chunk.length);
          buf.set(carry, 0); buf.set(chunk, carry.length);
        }
        let o = 0;
        while(buf.length - o >= F){ frame(buf.slice(o, o + F)); o += F; }
        carry = buf.slice(o);
      },
      flush(){
        carry = new Float32Array(0);
        if(inPhrase) endPhrase(false);
        ring = []; run = 0;
      }
    };
  }

  /* ── 16 kHz / 16-bit mono WAV of one phrase ── */
  async function encodeWav16k(samples, sampleRate){
    let data = samples, rate = sampleRate;
    if(sampleRate !== 16000 && window.OfflineAudioContext){
      const oc = new OfflineAudioContext(1, Math.ceil(samples.length * 16000 / sampleRate), 16000);
      const buf = oc.createBuffer(1, samples.length, sampleRate);
      buf.copyToChannel(samples, 0);
      const srcNode = oc.createBufferSource();
      srcNode.buffer = buf; srcNode.connect(oc.destination); srcNode.start();
      const out = await oc.startRendering();
      data = out.getChannelData(0); rate = 16000;
    }
    const n = data.length;
    const ab = new ArrayBuffer(44 + n * 2), v = new DataView(ab);
    const str = (o, s) => { for(let k = 0; k < s.length; k++) v.setUint8(o + k, s.charCodeAt(k)); };
    str(0, "RIFF"); v.setUint32(4, 36 + n * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, n * 2, true);
    for(let k = 0; k < n; k++){
      const x = Math.max(-1, Math.min(1, data[k]));
      v.setInt16(44 + k * 2, x < 0 ? x * 0x8000 : x * 0x7fff, true);
    }
    return new Blob([ab], { type:"audio/wav" });
  }
  function modelFor(){ return S.provider === "groq" ? "whisper-large-v3" : (S.model || "whisper-large-v3"); }
  window.ScuLaDictation = Object.freeze({ makePhraser, encodeWav16k, modelFor });

  /* ── API engine: Web Audio PCM → phrases → one request each ── */
  const rec = { session:null, stream:null, ctx:null, src:null, node:null, phraser:null, t0:0, timer:null };
  const chain = [];          // every accepted phrase of every session, in capture order
  const sessions = [];
  const MAX_INFLIGHT = 2;
  let inflight = 0;

  function pendingCount(){ return chain.filter(s => s.state === "pending").length; }
  function refreshPill(){
    const k = pendingCount();
    const interim = k ? t("dictatePending", k) : "";
    if(rec.session){
      const s = Math.floor((Date.now() - rec.t0) / 1000);
      const clock = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
      showPill(t("dictateRecording", clock), interim);
    } else if(k) showPill(t("dictateTranscribing"), interim);
    else if(!live.active) hidePill();
  }

  async function cleanupApiStart(stream, ctx, src, node){
    if(node){
      try{ node.onaudioprocess = null; }catch(e){}
      try{ node.disconnect(); }catch(e){}
    }
    if(src){ try{ src.disconnect(); }catch(e){} }
    try{ stream.getTracks().forEach(tr => { try{ tr.stop(); }catch(e){} }); }catch(e){}
    if(ctx){ try{ await ctx.close(); }catch(e){} }
  }

  async function startApi(target, startup){
    if(startup.cancelled) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC){ fail(t("dictateNoRecorder"), target); return; }
    if(S.provider === "custom" ? !S.endpoint : !S.key){ fail(t("dictateNoSetup"), target); return; }
    let stream;
    try{
      stream = await navigator.mediaDevices.getUserMedia({
        audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }
      });
    }catch(e){ if(!startup.cancelled) fail(t("dictateNoMic"), target); return; }
    if(startup.cancelled || opening !== startup){
      stream.getTracks().forEach(tr => tr.stop());
      return;
    }
    const session = newSession(target);
    let ctx = null, src = null, node = null, phraser;
    try{
      ctx = new AC();
      src = ctx.createMediaStreamSource(stream);
      node = ctx.createScriptProcessor(2048, 1, 1);
      src.connect(node); node.connect(ctx.destination);
      if(ctx.state === "suspended") await ctx.resume();
      if(startup.cancelled || opening !== startup){
        await cleanupApiStart(stream, ctx, src, node);
        return;
      }
      phraser = makePhraser({ sampleRate: ctx.sampleRate, onPhrase: (samples, info) => {
        const slot = { session, idx:info.index, state:"pending", text:"", err:"", samples, rate:ctx.sampleRate, started:false };
        session.slots.push(slot); chain.push(slot);
        pumpPool(); refreshPill();
      }});
      node.onaudioprocess = ev => phraser.push(new Float32Array(ev.inputBuffer.getChannelData(0)));
    }catch(e){
      await cleanupApiStart(stream, ctx, src, node);
      if(!startup.cancelled && opening === startup) fail(t("dictateNoRecorder"), target);
      return;
    }
    sessions.push(session);
    Object.assign(rec, { session, stream, ctx, src, node, phraser, t0:Date.now() });
    setBtn(target, true);
    refreshPill(); rec.timer = setInterval(refreshPill, 1000);
  }
  function stopApi(){
    const session = rec.session;
    if(!session) return;
    rec.phraser.flush();
    clearInterval(rec.timer);
    try{ rec.node.onaudioprocess = null; rec.src.disconnect(); rec.node.disconnect(); }catch(e){}
    try{ rec.ctx.close(); }catch(e){}
    if(rec.stream) rec.stream.getTracks().forEach(tr => tr.stop());
    session.recording = false;
    Object.assign(rec, { session:null, stream:null, ctx:null, src:null, node:null, phraser:null });
    setBtn(session.target, false);
    refreshPill();
  }

  /* at most MAX_INFLIGHT requests at once; results are released from the head
     of the chain so text lands in the order it was spoken */
  function pumpPool(){
    for(const slot of chain){
      if(inflight >= MAX_INFLIGHT) return;
      if(slot.state === "pending" && !slot.started) runSlot(slot);
    }
  }
  async function runSlot(slot){
    slot.started = true; inflight++;
    const session = slot.session, ctrl = new AbortController();
    session.ctrls.add(ctrl);
    try{
      const blob = await encodeWav16k(slot.samples, slot.rate);
      if(ctrl.signal.aborted) throw new Error("aborted");
      let text = await transcribe(blob, ctrl.signal);
      if(text && S.tidy && !session.cancelled){
        showPill(t("dictateTidying"), "");
        text = await tidyUp(text, ctrl.signal);
      }
      if(slot.state === "pending"){ slot.text = text; slot.state = "done"; }
    }catch(e){
      if(slot.state === "pending"){
        if(session.cancelled || ctrl.signal.aborted) slot.state = "dropped";
        else { slot.state = "failed"; slot.err = e && e.message ? e.message : String(e); }
      }
    }
    slot.samples = null;
    session.ctrls.delete(ctrl); inflight--;
    release(); pumpPool(); refreshPill();
  }
  function release(){
    while(chain.length && chain[0].state !== "pending"){
      const slot = chain.shift(), session = slot.session;
      if(session.cancelled || slot.state === "dropped") continue;
      if(slot.state === "done") emit(session, slot.text);
      else if(slot.state === "failed"){
        emit(session, "[🎤 ?]");
        toast(t("dictatePhraseFailed", slot.idx, slot.err));
      }
    }
    for(let k = sessions.length - 1; k >= 0; k--){
      const s = sessions[k];
      if(!s.recording && !chain.some(sl => sl.session === s)) sessions.splice(k, 1);
    }
  }
  function sleep(ms, signal){
    return new Promise((resolve, reject) => {
      if(signal.aborted){ reject(new Error("aborted")); return; }
      const timer = setTimeout(() => { signal.removeEventListener("abort", abort); resolve(); }, ms);
      function abort(){ clearTimeout(timer); reject(new Error("aborted")); }
      signal.addEventListener("abort", abort, { once:true });
    });
  }

  async function transcribe(blob, signal){
    const p = PROVIDERS[S.provider] || PROVIDERS.groq;
    const url = S.provider === "custom" ? S.endpoint : p.url;
    if(!url) throw new Error(t("dictateNoSetup"));
    // no `language` and no `prompt`: Whisper detects the language per phrase,
    // and a prompt in one language would pull the other one towards it
    const fd = new FormData();
    fd.append("file", blob, "dictation.wav");
    fd.append("model", modelFor());
    fd.append("response_format", "json");
    fd.append("temperature", "0");
    const headers = {};
    if(S.key) headers.Authorization = "Bearer " + S.key;
    let res;
    for(let attempt = 0; ; attempt++){
      try{ res = await fetch(url, { method:"POST", headers, body:fd, signal }); }
      catch(e){ throw new Error(t("dictateNetwork")); }
      if(res.status === 429 && attempt === 0){
        const ra = Number(res.headers.get("Retry-After"));
        await sleep(Math.min(10, res.headers.get("Retry-After") && isFinite(ra) ? ra : 2) * 1000, signal);
        continue;
      }
      break;
    }
    if(!res.ok){
      let msg = "HTTP " + res.status;
      try{ const j = await res.json(); if(j && j.error) msg = j.error.message || (typeof j.error === "string" ? j.error : msg); }catch(_){}
      throw new Error(msg);
    }
    const data = await res.json();
    return String(data.text || "").trim();
  }
  async function tidyUp(text, signal){
    const p = PROVIDERS[S.provider] || PROVIDERS.groq;
    const url = S.provider === "custom" ? "" : p.chatUrl;
    if(!url || !S.tidyModel) return text;
    const sys = "You edit raw speech-to-text output. The text may be Romanian, English, or a mix of both. " +
                "Keep every word in the language it is written in — never translate, never rephrase, never add or remove words. " +
                "Fix punctuation and capitalisation, and add missing diacritics to Romanian words only. Reply with the corrected text only.";
    try{
      const res = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer " + S.key },
        signal,
        body: JSON.stringify({
          model:S.tidyModel, temperature:0,
          messages:[{ role:"system", content:sys }, { role:"user", content:text }]
        })
      });
      if(!res.ok) return text;
      const j = await res.json();
      const out = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      return out ? String(out).trim() : text;
    }catch(e){ if(signal && signal.aborted) throw e; return text; }
  }

  /* ── Live engine: Web Speech API ── */
  const live = { active:false, sr:null, wantOn:false, session:null };
  function startLive(target){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ fail(t("dictateNoLive"), target); return; }
    try{ live.sr = new SR(); }catch(e){ fail(t("dictateNoLive"), target); return; }
    live.sr.lang = S.lang === "en" ? "en-US" : "ro-RO";
    live.sr.continuous = true;
    live.sr.interimResults = true;
    live.wantOn = true; live.active = true;
    const session = live.session = newSession(target);
    beginInsert(session); setBtn(target, true);
    showPill(t("dictateListening"));
    live.sr.onresult = ev => {
      let interim = "";
      for(let i = ev.resultIndex; i < ev.results.length; i++){
        const r = ev.results[i];
        if(r.isFinal) emit(session, String(r[0].transcript));
        else interim += r[0].transcript;
      }
      showPill(t("dictateListening"), interim);
    };
    live.sr.onerror = ev => {
      if(ev.error === "not-allowed" || ev.error === "service-not-allowed"){ live.wantOn = false; fail(t("dictateNoMic"), target); }
      else if(ev.error === "language-not-supported"){ live.wantOn = false; fail(t("dictateNoLive"), target); }
    };
    live.sr.onend = () => {
      if(live.wantOn){ try{ live.sr.start(); }catch(e){} }
      else { live.active = false; setBtn(target, false); hidePill(); }
    };
    try{ live.sr.start(); }
    catch(e){ live.wantOn = false; live.active = false; setBtn(target, false); hidePill(); fail(t("dictateNoLive"), target); }
  }
  function stopLive(){
    live.wantOn = false;
    try{ if(live.sr) live.sr.stop(); }catch(e){}
    live.active = false; setBtn(live.session ? live.session.target : editor, false); hidePill();
  }

  /* ── the one entry point, wired to the toolbar button and the 💡 idea
     modal alike — an optional target textarea points dictated text at
     something other than the main editor. ── */
  let opening = null;  // cancellable startup, created before settings and permission awaits
  window.toggleDictation = async function(targetEl){
    if(rec.session || live.active){
      if(rec.session) stopApi();
      if(live.active) stopLive();
      return;
    }
    if(opening) return;
    if(!window.isSecureContext){ fail(t("dictateInsecure"), targetEl); return; }
    const target = targetEl || editor;
    const startup = opening = { target, cancelled:false };
    try{
      await loadSettings();
      if(startup.cancelled || opening !== startup) return;
      if(S.engine === "live") startLive(target);
      else await startApi(target, startup);
    } finally { if(opening === startup) opening = null; }
  };
  window.toggleIdeaDictation = function(){
    window.toggleDictation(document.getElementById("idea-text"));
  };
  /* stop dictating into one box; with { discard:true } also throw away what
     is still being transcribed for it (the 💡 modal closing) */
  window.stopDictation = function(targetEl, opts){
    if(opts && opts.discard && opening && opening.target === targetEl){
      opening.cancelled = true;
      opening = null;
    }
    if(rec.session && rec.session.target === targetEl) stopApi();
    if(opts && opts.discard){
      sessions.forEach(s => {
        if(s.target !== targetEl) return;
        s.cancelled = true;
        s.ctrls.forEach(c => { try{ c.abort(); }catch(e){} });
        s.slots.forEach(sl => { if(sl.state === "pending") sl.state = "dropped"; });
      });
      release(); pumpPool();
    }
    if(live.active && live.session && live.session.target === targetEl) stopLive();
    refreshPill();
  };
})();

updatePreview();
updateStatus();
updateNav();
