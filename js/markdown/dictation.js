/* ============================================================
   Voice dictation — the Caiet vocal transcriber writing into the
   open chapter. It reads the API / engine / spoken-language
   settings saved on the Caiet vocal page (the shared
   "caiet-vocal:settings" blob) and has no settings UI of its own.
   Transcribed text lands at the caret; when the editor has no
   caret it is appended on a fresh line after the last one.
   Mirrors voice.html §§ 2, 9–11.
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

  function pickMime(){
    if(typeof MediaRecorder === "undefined") return { mime:"", ext:"webm" };
    const cand = [
      ["audio/webm;codecs=opus","webm"], ["audio/ogg;codecs=opus","ogg"],
      ["audio/mp4;codecs=mp4a.40.2","m4a"], ["audio/mp4","m4a"], ["audio/aac","m4a"]
    ];
    for(const [m,e] of cand){
      try{ if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) return { mime:m, ext:e }; }catch(_){}
    }
    return { mime:"", ext:"webm" };
  }

  /* ── where dictated text goes ──
     Defaults to the main editor textarea, but toggleDictation() accepts an
     override target — the 💡 idea modal points it at #idea-text so the same
     engine/queue/pill machinery can dictate into either box. */
  const ins = { mode:"append", pos:0, emitted:false };
  let lastCaret = null;   // editor selection captured the moment focus leaves it
  let target = editor;
  editor.addEventListener("blur", () => {
    lastCaret = { start: editor.selectionStart, end: editor.selectionEnd };
  });
  function beginInsert(){
    ins.emitted = false;
    if(document.activeElement === target){
      ins.mode = "cursor"; ins.pos = target.selectionEnd;
    } else if(target === editor && lastCaret){
      ins.mode = "cursor"; ins.pos = Math.min(lastCaret.end, editor.value.length);
    } else {
      ins.mode = "append"; ins.pos = target.value.length;
    }
  }
  function emit(raw){
    const text = (raw || "").replace(/\s+/g, " ").trim();
    if(!text) return;
    const val = target.value;
    const at = (ins.mode === "cursor" && document.activeElement === target)
      ? target.selectionEnd
      : Math.min(ins.pos, val.length);
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
  function setBtn(on){
    const id = target === editor ? "btn-dictate" : "btn-idea-dictate";
    const b = document.getElementById(id);
    if(!b) return;
    b.classList.toggle("active", on);
    /* swap the data-i* keys so applyUILang() repaints the right label on a language switch */
    b.setAttribute("data-i", on ? "dictateStopBtn" : "dictateBtn");
    b.setAttribute("data-i-title", on ? "dictateStopTip" : "dictateTip");
    if(on) b.setAttribute("data-i-aria", "dictateStopAria");
    else { b.removeAttribute("data-i-aria"); b.removeAttribute("aria-label"); }
    b.textContent = t(b.getAttribute("data-i"));
    b.title = t(b.getAttribute("data-i-title"));
    if(on) b.setAttribute("aria-label", t("dictateStopAria"));
  }
  function toast(msg){ try{ if(window.ScuLaFolder) window.ScuLaFolder.toast(msg); }catch(e){} }
  function fail(msg){ hidePill(); setBtn(false); toast(msg); }

  /* ── API engine: MediaRecorder + segment rotation + queue ── */
  const rec = { active:false, stream:null, mr:null, chunks:[], fmt:null, rot:null, rotating:false, t0:0, timer:null };
  const queue = { items:[], busy:false };

  async function startApi(){
    if(typeof MediaRecorder === "undefined"){ fail(t("dictateNoRecorder")); return; }
    if(S.provider === "custom" ? !S.endpoint : !S.key){ fail(t("dictateNoSetup")); return; }
    try{
      rec.stream = await navigator.mediaDevices.getUserMedia({
        audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }
      });
    }catch(e){ fail(t("dictateNoMic")); return; }
    rec.fmt = pickMime();
    rec.active = true; rec.t0 = Date.now();
    beginInsert(); setBtn(true);
    tickApi(); rec.timer = setInterval(tickApi, 1000);
    startSegment();
  }
  function tickApi(){
    const s = Math.floor((Date.now() - rec.t0) / 1000);
    const clock = String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
    showPill(t("dictateRecording", clock));
  }
  function startSegment(){
    const opts = { audioBitsPerSecond:64000 };
    if(rec.fmt.mime) opts.mimeType = rec.fmt.mime;
    try{ rec.mr = new MediaRecorder(rec.stream, opts); }
    catch(e){ try{ rec.mr = new MediaRecorder(rec.stream); }catch(e2){ fail(t("dictateNoRecorder")); return; } }
    rec.chunks = [];
    rec.mr.ondataavailable = ev => { if(ev.data && ev.data.size) rec.chunks.push(ev.data); };
    rec.mr.onstop = () => {
      const type = rec.chunks.length ? (rec.chunks[0].type || rec.fmt.mime) : rec.fmt.mime;
      const blob = new Blob(rec.chunks, { type: type || "audio/webm" });
      rec.chunks = [];
      if(blob.size > 1200) enqueue(blob, rec.fmt.ext);
      if(rec.rotating && rec.active){ rec.rotating = false; startSegment(); armRotation(); }
    };
    rec.mr.start();
    armRotation();
  }
  function armRotation(){
    clearTimeout(rec.rot);
    if(!S.segMin) return;
    rec.rot = setTimeout(() => {
      if(rec.active && rec.mr && rec.mr.state === "recording"){ rec.rotating = true; rec.mr.stop(); }
    }, S.segMin * 60000);
  }
  function stopApi(){
    rec.active = false; rec.rotating = false;
    clearTimeout(rec.rot); clearInterval(rec.timer);
    try{ if(rec.mr && rec.mr.state !== "inactive") rec.mr.stop(); }catch(e){}
    setBtn(false);
    if(queue.busy || queue.items.length) showPill(t("dictateTranscribing"));
    else hidePill();
    setTimeout(() => {
      if(rec.stream){ rec.stream.getTracks().forEach(tr => tr.stop()); rec.stream = null; }
    }, 400);
  }
  function enqueue(blob, ext){ queue.items.push({ blob, ext }); pump(); }
  async function pump(){
    if(queue.busy || !queue.items.length) return;
    queue.busy = true;
    const item = queue.items.shift();
    showPill(t("dictateTranscribing"));
    try{
      if(item.blob.size > 25 * 1024 * 1024) throw new Error(t("dictateTooBig"));
      let text = await transcribe(item.blob, item.ext);
      if(text && S.tidy){ showPill(t("dictateTidying")); text = await tidyUp(text); }
      emit(text);
    }catch(e){
      toast(t("dictateError") + " " + (e && e.message ? e.message : e));
    }
    queue.busy = false;
    if(queue.items.length) pump();
    else if(rec.active) tickApi();
    else hidePill();
  }

  /* Whisper auto-detects language once per request when it isn't told one.
     An English-only saved model cannot write Romanian, so swap it for the
     provider's multilingual default rather than let it silently mistranscribe. */
  function pickModel(){
    const m = S.model || "whisper-large-v3";
    if(/(^|[-.])en$/i.test(m) || /^distil-whisper/i.test(m)){
      return S.provider === "openai" ? "whisper-1" : "whisper-large-v3";
    }
    return m;
  }
  /* Never send a prompt, and never force one language up front: either
     biases Whisper towards one language and turns the other language's
     speech into a translation. But Whisper's own detection picks among ~100
     languages and, on a few seconds of Romanian, often settles on Russian
     (then writes Cyrillic, or a runaway hallucination that the service
     rejects as too long). Speech here is only ever Romanian or English, so:
     detect first; keep the answer when it is ro or en; otherwise transcribe
     the clip as each of the two and keep the one Whisper was surer of. */
  const LANGS = ["ro", "en"];
  const LANG_NAMES = { romanian:"ro", english:"en", moldavian:"ro", moldovan:"ro" };
  /* "Romanian" / "romanian" / "ro" → "ro"; any other language keeps its own
     name, and "" means the service did not say. */
  function langCode(l){
    const k = String(l || "").trim().toLowerCase();
    return LANG_NAMES[k] || k;
  }
  /* Mean per-segment log-probability, weighted by segment length — Whisper's
     own confidence in what it wrote. -Infinity when there is nothing to score. */
  function confidence(data){
    const segs = data && Array.isArray(data.segments) ? data.segments : [];
    let sum = 0, w = 0;
    for(const sg of segs){
      if(typeof sg.avg_logprob !== "number") continue;
      const d = Math.max(0.1, (+sg.end || 0) - (+sg.start || 0));
      sum += sg.avg_logprob * d; w += d;
    }
    return w ? sum / w : -Infinity;
  }
  /* The gpt-4o transcribe models only answer plain json (no detected
     language, no segments); everything Whisper answers verbose_json. */
  function verboseOk(model){ return !/^gpt-4o/i.test(model); }
  async function request(blob, ext, model, lang, verbose){
    const p = PROVIDERS[S.provider] || PROVIDERS.groq;
    const url = S.provider === "custom" ? S.endpoint : p.url;
    if(!url) throw new Error(t("dictateNoSetup"));
    const fd = new FormData();
    fd.append("file", blob, "dictation." + (ext || "webm"));
    fd.append("model", model);
    fd.append("response_format", verbose ? "verbose_json" : "json");
    fd.append("temperature", "0");
    if(lang) fd.append("language", lang);
    const headers = {};
    if(S.key) headers.Authorization = "Bearer " + S.key;
    let res;
    try{ res = await fetch(url, { method:"POST", headers, body:fd }); }
    catch(e){ const err = new Error(t("dictateNetwork")); err.status = 0; throw err; }
    if(!res.ok){
      let msg = "HTTP " + res.status;
      try{ const j = await res.json(); if(j && j.error) msg = j.error.message || (typeof j.error === "string" ? j.error : msg); }catch(_){}
      const err = new Error(msg); err.status = res.status; throw err;
    }
    const data = await res.json();
    return { text:String((data && data.text) || "").trim(), lang:langCode(data && data.language), score:confidence(data) };
  }
  /* Errors a second try with a forced language cannot fix. */
  function fatal(e){ return !e || [0, 401, 403, 413, 429].includes(e.status); }
  async function transcribe(blob, ext){
    const model = pickModel();
    const verbose = verboseOk(model);
    let first = null, firstErr = null;
    try{ first = await request(blob, ext, model, "", verbose); }
    catch(e){
      if(fatal(e)) throw e;
      firstErr = e;
      /* a custom endpoint may refuse verbose_json: if plain json works, it
         cannot report a language, so take its answer as it is */
      if(verbose && e.status === 400 && S.provider === "custom"){
        try{ return (await request(blob, ext, model, "", false)).text; }
        catch(e2){ if(fatal(e2)) throw e2; }
      }
    }
    if(first && (!verbose || !first.lang || LANGS.includes(first.lang))) return first.text;
    /* detected something other than ro/en (or failed): try both, keep the surer */
    const pref = S.lang === "en" ? ["en", "ro"] : ["ro", "en"];
    const tries = await Promise.all(pref.map(l =>
      request(blob, ext, model, l, verbose).catch(e => ({ err:e }))));
    const ok = tries.filter(r => !r.err && r.text);
    if(!ok.length){
      if(first && first.text) return first.text;
      throw (tries[0] && tries[0].err) || firstErr || new Error(t("dictateNetwork"));
    }
    return ok.reduce((best, r) => r.score > best.score ? r : best).text;
  }
  /* Folds a string into comparable word tokens: casefold, strip diacritics,
     split on anything that isn't a letter or digit. */
  function foldWords(s){
    return String(s).toLowerCase().normalize("NFD").replace(/\p{M}/gu, "")
      .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }
  /* True when out plausibly keeps raw's words rather than translating them:
     at least 80% of raw's word tokens (with repeats) show up in out, and
     out's token count stays within 0.8x-1.25x of raw's. A diacritics or
     punctuation fix passes this; a translation does not. */
  function keepsWords(raw, out){
    const rawWords = foldWords(raw);
    if(!rawWords.length) return true;
    const outWords = foldWords(out);
    const outSet = new Set(outWords);
    const kept = rawWords.filter(w => outSet.has(w)).length;
    if(kept / rawWords.length < 0.8) return false;
    const ratio = outWords.length / rawWords.length;
    return ratio >= 0.8 && ratio <= 1.25;
  }
  /* The text may be Romanian, English or both mixed: never translate it,
     only fix punctuation/capitalisation/diacritics, and discard the model's
     output (keeping the raw transcript) if it doesn't keep the words. */
  async function tidyUp(text){
    const p = PROVIDERS[S.provider] || PROVIDERS.groq;
    const url = S.provider === "custom" ? "" : p.chatUrl;
    if(!url || !S.tidyModel) return text;
    const sys = "You edit raw speech-to-text output. It may be Romanian, English, or both mixed. " +
                "Keep every word in the language it was spoken in. Never translate, never rephrase, " +
                "never add or remove words. Fix only punctuation and capitalisation, and add diacritics " +
                "only to Romanian words. Reply with the corrected text only.";
    try{
      const res = await fetch(url, {
        method:"POST",
        headers:{ "Content-Type":"application/json", Authorization:"Bearer " + S.key },
        body: JSON.stringify({
          model:S.tidyModel, temperature:0,
          messages:[{ role:"system", content:sys }, { role:"user", content:text }]
        })
      });
      if(!res.ok) return text;
      const j = await res.json();
      const out = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
      const trimmed = out ? String(out).trim() : "";
      return trimmed && keepsWords(text, trimmed) ? trimmed : text;
    }catch(e){ return text; }
  }

  /* ── Live engine: Web Speech API ── */
  const live = { active:false, sr:null, wantOn:false };
  function startLive(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ fail(t("dictateNoLive")); return; }
    try{ live.sr = new SR(); }catch(e){ fail(t("dictateNoLive")); return; }
    live.sr.lang = S.lang === "en" ? "en-US" : "ro-RO";
    live.sr.continuous = true;
    live.sr.interimResults = true;
    live.wantOn = true; live.active = true;
    beginInsert(); setBtn(true);
    showPill(t("dictateListening"));
    live.sr.onresult = ev => {
      let interim = "";
      for(let i = ev.resultIndex; i < ev.results.length; i++){
        const r = ev.results[i];
        if(r.isFinal) emit(String(r[0].transcript));
        else interim += r[0].transcript;
      }
      showPill(t("dictateListening"), interim);
    };
    live.sr.onerror = ev => {
      if(ev.error === "not-allowed" || ev.error === "service-not-allowed"){ live.wantOn = false; fail(t("dictateNoMic")); }
      else if(ev.error === "language-not-supported"){ live.wantOn = false; fail(t("dictateNoLive")); }
    };
    live.sr.onend = () => {
      if(live.wantOn){ try{ live.sr.start(); }catch(e){} }
      else { live.active = false; setBtn(false); hidePill(); }
    };
    try{ live.sr.start(); }
    catch(e){ live.wantOn = false; live.active = false; setBtn(false); hidePill(); fail(t("dictateNoLive")); }
  }
  function stopLive(){
    live.wantOn = false;
    try{ if(live.sr) live.sr.stop(); }catch(e){}
    live.active = false; setBtn(false); hidePill();
  }

  /* ── the one entry point, wired to the toolbar button and the 💡 idea
     modal alike — an optional target textarea points dictated text at
     something other than the main editor. ── */
  let opening = false;
  window.toggleDictation = async function(targetEl){
    if(rec.active || live.active){
      if(rec.active) stopApi();
      if(live.active) stopLive();
      return;
    }
    if(opening) return;
    if(!window.isSecureContext){ fail(t("dictateInsecure")); return; }
    target = targetEl || editor;
    opening = true;
    try{ await loadSettings(); } finally { opening = false; }
    if(S.engine === "live") startLive();
    else startApi();
  };
  window.toggleIdeaDictation = function(){
    window.toggleDictation(document.getElementById("idea-text"));
  };
})();

updatePreview();
updateStatus();
updateNav();

