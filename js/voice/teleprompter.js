/* Voice-following reader. Plain script, no dependencies; source chapters are read-only. */
(function(root){
  'use strict';
  const normalize = text => String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const tokens = text => normalize(text).match(/[\p{L}\p{N}]+/gu) || [];

  function plainText(markdown){
    return String(markdown || '').replace(/\r\n?/g, '\n')
      .replace(/^---\n[\s\S]*?\n---(?:\n|$)/, '')
      .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[^\n]*(?:\n|$)/gm, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2').replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/<[^>]*>/g, '')
      .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+(?:\[[ xX]\]\s*)?|\d+[.)]\s+)/gm, '')
      .replace(/^\s*(?:[-*_]\s*){3,}$/gm, '')
      .replace(/([*_`~])\1*/g, '').replace(/\n{3,}/g, '\n\n').trim();
  }

  // Local sequence alignment: substitutions, extra spoken words and short skips
  // are tolerated. Search stays near the utterance's ORIGINAL anchor so revised
  // interim results cannot consume a repeated phrase a second time.
  function follow(script, heard, anchor){
    if(!heard.length) return anchor;
    const skipped = Math.max(0, heard.length - 64);
    const speech = heard.slice(skipped), start = Math.max(0, anchor + skipped - 2);
    const end = Math.min(script.length, anchor + heard.length + 24);
    let best = {score:0, end:anchor};
    for(let offset = start; offset < Math.min(end, start + 18); offset++){
      const width = Math.min(end - offset, speech.length + 8);
      let row = Array.from({length:width + 1}, (_, j) => ({score:-j * 1.5, matches:0}));
      for(let i = 1; i <= speech.length; i++){
        const next = [{score:-i * 1.5, matches:0}];
        for(let j = 1; j <= width; j++){
          const same = speech[i - 1] === script[offset + j - 1];
          const choices = [
            {score:row[j - 1].score + (same ? 3 : -2), matches:row[j - 1].matches + Number(same)},
            {score:row[j].score - 1.5, matches:row[j].matches},
            {score:next[j - 1].score - 1.5, matches:next[j - 1].matches}
          ];
          next[j] = choices.reduce((a,b) => b.score > a.score ? b : a);
          const cell = next[j], position = offset + j;
          const single = speech.length === 1 && offset === anchor && j === 1;
          if(i === speech.length && same && position > anchor &&
             (single || cell.matches >= 2 && cell.matches / speech.length >= 0.6)){
            const score = cell.score - Math.abs(offset - (anchor + skipped)) * 0.35;
            if(score > best.score) best = {score, end:position};
          }
        }
        row = next;
      }
    }
    return best.end;
  }

  function readChapters(){
    return new Promise((resolve, reject) => {
      let request;
      try{ request = indexedDB.open('scula-md'); }catch(e){ reject(e); return; }
      let missing = false;
      request.onupgradeneeded = () => { missing = true; request.transaction.abort(); };
      request.onerror = () => missing ? resolve([]) : reject(request.error);
      request.onblocked = () => reject(new Error('blocked'));
      request.onsuccess = () => {
        const db = request.result;
        if(!db.objectStoreNames.contains('workbooks') || !db.objectStoreNames.contains('chapters')){
          db.close(); resolve([]); return;
        }
        const tx = db.transaction(['workbooks', 'chapters'], 'readonly'), chapters = [];
        const books = tx.objectStore('workbooks').getAll();
        books.onsuccess = () => {
          books.result.filter(b => normalize(b.name).trim() === 'subtitrare').forEach(book => {
            const req = tx.objectStore('chapters').index('byWorkbook').getAll(book.id);
            req.onsuccess = () => chapters.push(...req.result);
          });
        };
        tx.oncomplete = () => {
          db.close();
          resolve(chapters.sort((a,b) => (a.order || 0) - (b.order || 0) || (a.created || 0) - (b.created || 0)));
        };
        tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
      };
    });
  }

  function mount({t, getLanguage, isRecording}){
    const $ = id => document.getElementById(id);
    const panel = $('tpPanel'), dialog = $('tpDialog'), reader = $('tpReader');
    const editor = $('tpScript'), select = $('tpChapter'), toggle = $('tpToggle');
    let chapters = [], words = [], spans = [], position = 0, painted = 0;
    let sr = null, listening = false, generation = 0, restartTimer = 0, restarts = 0;
    let statusKey = 'tpReady', sourceKey = '', wake = null;
    const supported = () => !!(root.SpeechRecognition || root.webkitSpeechRecognition);

    function labels(){
      $('tpListen').textContent = t(listening ? 'tpPause' : 'tpListen');
      $('tpListen').setAttribute('aria-pressed', String(listening));
      $('tpListen').disabled = !supported() || !words.length;
      $('tpStatus').textContent = t(statusKey);
      $('tpSourceStatus').textContent = sourceKey ? t(sourceKey) : '';
      $('tpProgress').textContent = t('tpProgress', {current:position, total:words.length});
      if(select.options[0]) select.options[0].textContent = t(chapters.length ? 'tpChoose' : 'tpNoChapters');
    }
    function status(key){ statusKey = key; labels(); }
    function sourceStatus(key){ sourceKey = key; labels(); }
    async function refresh(){
      $('tpRefresh').disabled = true;
      sourceStatus('tpLoading');
      try{
        chapters = await readChapters();
        select.replaceChildren(new Option('', ''));
        chapters.forEach(ch => select.add(new Option(ch.title || ch.file, ch.id)));
        sourceStatus(chapters.length ? '' : 'tpNoChapters');
      }catch(e){ sourceStatus('tpStorageError'); }
      finally{ $('tpRefresh').disabled = false; labels(); }
    }
    function loadChapter(){
      const chapter = chapters.find(ch => ch.id === select.value);
      if(!chapter) return;
      let content = chapter.content || '';
      try{
        const draft = JSON.parse(localStorage.getItem('scula:md:draft') || 'null');
        if(draft && draft.id === chapter.id && typeof draft.text === 'string' && draft.at > (chapter.updated || 0)) content = draft.text;
      }catch(e){}
      editor.value = plainText(content);
      sourceStatus(editor.value ? 'tpLoaded' : 'tpEmpty');
    }
    function center(smooth = true){
      const span = spans[Math.min(position, spans.length - 1)];
      if(!span) return;
      const top = span.getBoundingClientRect().top - reader.getBoundingClientRect().top + reader.scrollTop - reader.clientHeight * 0.3;
      if(Math.abs(top - reader.scrollTop) > 6) reader.scrollTo({top:Math.max(0, top), behavior:smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant'});
    }
    function paint(){
      for(let i = Math.min(painted, position); i < Math.max(painted, position); i++) spans[i]?.classList.toggle('tp-read', i < position);
      spans[painted]?.classList.remove('tp-current');
      spans[position]?.classList.add('tp-current');
      painted = position;
      labels(); center();
    }
    async function keepAwake(){
      if(!navigator.wakeLock || wake) return;
      try{
        const lock = await navigator.wakeLock.request('screen');
        if(!listening){ await lock.release(); return; }
        wake = lock;
        lock.addEventListener('release', () => { if(wake === lock) wake = null; });
      }catch(e){}
    }
    function pause(key = 'tpPaused'){
      listening = false; generation++; clearTimeout(restartTimer);
      const old = sr; sr = null;
      if(old){ old.onend = old.onresult = old.onerror = old.onstart = null; try{ old.abort(); }catch(e){} }
      if(wake){ wake.release().catch(() => {}); wake = null; }
      status(key);
    }
    function recognize(){
      const ticket = ++generation;
      const anchors = new Map();
      try{
        const SR = root.SpeechRecognition || root.webkitSpeechRecognition;
        const current = sr = new SR();
        current.lang = $('tpLanguage').value;
        current.continuous = true; current.interimResults = true;
        current.onstart = () => { if(ticket === generation && listening) status('tpFollowing'); };
        current.onresult = event => {
          if(ticket !== generation || !listening) return;
          restarts = 0;
          for(let i = event.resultIndex; i < event.results.length; i++){
            if(!anchors.has(i)) anchors.set(i, position);
            const heard = String(event.results[i][0].transcript || '');
            $('tpHeard').textContent = heard;
            const next = follow(words, tokens(heard), anchors.get(i));
            position = Math.max(position, next);
          }
          paint();
          if(position >= words.length) pause('tpFinished');
        };
        current.onerror = event => {
          if(ticket !== generation || !listening) return;
          if(event.error === 'no-speech') return;
          pause(event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'tpDenied' :
            event.error === 'network' ? 'tpNetwork' : 'tpSpeechError');
        };
        current.onend = () => {
          if(ticket !== generation || !listening) return;
          if(++restarts > 5){ pause('tpSpeechError'); return; }
          status('tpReconnecting');
          restartTimer = setTimeout(() => { if(listening && ticket === generation) recognize(); }, Math.min(1200, restarts * 200));
        };
        current.start();
      }catch(e){ pause('tpSpeechError'); }
    }
    function listen(){
      if(listening){ pause(); return; }
      if(!supported()){ status('tpUnsupported'); return; }
      if(isRecording()){ status('tpBusy'); return; }
      if(position >= words.length){ position = 0; paint(); }
      listening = true; restarts = 0; status('tpStarting'); recognize();
      if(listening) keepAwake();
    }
    function seek(next){
      const resume = listening;
      pause(); position = Math.max(0, Math.min(words.length, next)); paint();
      if(resume && position < words.length) listen();
    }
    function open(){
      if(isRecording()){ sourceStatus('tpBusy'); return; }
      const text = plainText(editor.value);
      if(!tokens(text).length){ sourceStatus('tpEmpty'); return; }
      pause('tpReady'); words = []; spans = []; position = painted = 0;
      reader.replaceChildren();
      for(const paragraph of text.split(/\n\s*\n/)){
        const p = document.createElement('p');
        // Keep the exact punctuation/spacing in the script, tokenize only speech.
        for(const chunk of paragraph.split(/(\s+)/)){
          const parts = tokens(chunk);
          if(!parts.length){ p.append(document.createTextNode(chunk)); continue; }
          const span = document.createElement('span');
          span.textContent = chunk; span.dataset.position = words.length;
          for(const word of parts){ words.push(word); spans.push(span); }
          p.append(span);
        }
        reader.append(p);
      }
      dialog.showModal(); document.body.classList.add('tp-open');
      status(supported() ? 'tpReady' : 'tpUnsupported');
      $('tpHeard').textContent = ''; reader.focus({preventScroll:true}); paint(); center(false);
    }
    function close(){
      pause(); dialog.close(); document.body.classList.remove('tp-open'); $('tpOpen').focus();
    }
    toggle.addEventListener('click', () => {
      panel.hidden = !panel.hidden;
      toggle.setAttribute('aria-expanded', String(!panel.hidden));
      if(!panel.hidden){ $('tpLanguage').value = getLanguage() === 'en' ? 'en-US' : 'ro-RO'; refresh(); }
    });
    select.addEventListener('change', loadChapter);
    $('tpRefresh').addEventListener('click', refresh);
    $('tpOpen').addEventListener('click', open);
    $('tpExit').addEventListener('click', close);
    $('tpListen').addEventListener('click', listen);
    $('tpBack').addEventListener('click', () => seek(position - 8));
    $('tpNext').addEventListener('click', () => seek(position + 8));
    $('tpReset').addEventListener('click', () => seek(0));
    $('tpSize').addEventListener('input', () => { reader.style.fontSize = $('tpSize').value + 'rem'; center(false); });
    reader.addEventListener('click', event => {
      const span = event.target.closest('[data-position]');
      if(span) seek(Number(span.dataset.position));
    });
    reader.addEventListener('keydown', event => {
      if(event.key === ' '){ event.preventDefault(); listen(); }
      else if(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)){
        event.preventDefault(); seek(position + ({ArrowLeft:-1, ArrowRight:1, ArrowUp:-8, ArrowDown:8})[event.key]);
      }
    });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    dialog.addEventListener('close', () => { pause(); document.body.classList.remove('tp-open'); });
    document.addEventListener('visibilitychange', () => { if(document.hidden && listening) pause(); });
    root.addEventListener('pagehide', () => pause());
    root.addEventListener('resize', () => { if(dialog.open) center(false); });
    labels();
    return {labels};
  }
  root.ScuLaTeleprompter = {mount, plainText, tokens, follow};
})(typeof window === 'undefined' ? globalThis : window);
