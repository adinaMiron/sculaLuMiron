/* ── Phone key bar: Ctrl, Shift, Alt, the : - _ keys and the four arrows ──
   A phone keyboard has no modifier keys, so every Ctrl/Alt shortcut in
   events.js was out of reach. The bar shows on touch screens while a text
   field has the caret. Tap a modifier once for the next key, twice to keep
   it on; tap again to release it. The next letter typed on the phone
   keyboard (or an arrow on the bar) becomes a synthetic keydown carrying
   those modifiers, so the existing shortcut handlers run unchanged.

   Phone keyboards rarely send a usable keydown (Android reports
   "Unidentified"), so the typed character is caught at `beforeinput`; when
   that cannot be cancelled (an IME composition), the `input` that follows is
   undone instead. Both are stopped in the capture phase, before the editor's
   undo, preview and autosave hooks see them. */
(function keyBar() {
  const bar = document.getElementById('mobile-keys');
  if (!bar || !window.matchMedia) return;
  const coarse = matchMedia('(pointer: coarse)');
  const mods = { ctrl: 0, shift: 0, alt: 0 };       // 0 off · 1 next key · 2 locked
  let lastField = null, pending = null, hideTimer = 0;

  const CODES = { '.': 'Period', ',': 'Comma', '/': 'Slash', ' ': 'Space', '-': 'Minus',
    '=': 'Equal', ';': 'Semicolon', "'": 'Quote', '[': 'BracketLeft', ']': 'BracketRight',
    '\\': 'Backslash', '`': 'Backquote', '>': 'Period', '<': 'Comma', '?': 'Slash',
    '_': 'Minus', '+': 'Equal', ':': 'Semicolon', '"': 'Quote', '{': 'BracketLeft',
    '}': 'BracketRight', '|': 'Backslash', '~': 'Backquote' };
  ')!@#$%^&*('.split('').forEach((c, i) => { CODES[c] = 'Digit' + i; });
  function codeFor(ch) {
    if (/^[a-z]$/i.test(ch)) return 'Key' + ch.toUpperCase();
    if (/^[0-9]$/.test(ch)) return 'Digit' + ch;
    return CODES[ch] || '';
  }

  function isField(el) {
    if (!el || el.disabled || el.readOnly) return false;
    if (el.tagName === 'TEXTAREA' || el.isContentEditable) return true;
    return el.tagName === 'INPUT' && /^(text|search|url|email|tel|password|number)$/.test(el.type);
  }
  function hasTextCaret(el) {
    return el && (el.tagName === 'TEXTAREA' || (el.tagName === 'INPUT' && el.type !== 'number'));
  }
  const armed = () => !!(mods.ctrl || mods.alt);   // Shift alone is left to the phone keyboard

  function paint() {
    bar.querySelectorAll('[data-mk-mod]').forEach(b => {
      const m = mods[b.dataset.mkMod];
      b.classList.toggle('on', m > 0);
      b.classList.toggle('lock', m === 2);
      b.setAttribute('aria-pressed', m > 0 ? 'true' : 'false');
    });
  }
  function release() {
    Object.keys(mods).forEach(k => { if (mods[k] === 1) mods[k] = 0; });
    paint();
  }

  function fire(key, code) {
    const target = document.activeElement || document.body;
    const ev = new KeyboardEvent('keydown', {
      key, code, bubbles: true, cancelable: true, composed: true,
      ctrlKey: !!mods.ctrl, shiftKey: !!mods.shift, altKey: !!mods.alt
    });
    target.dispatchEvent(ev);
    return ev;
  }
  function fireChar(ch) {
    if (!ch) return;
    const key = /^[a-z]$/i.test(ch) ? (mods.shift ? ch.toUpperCase() : ch.toLowerCase()) : ch;
    fire(key, codeFor(ch));
    release();
  }

  // ":", "-" and "_" sit on the phone keyboard's symbol page. A tap types
  // the character, or completes a shortcut when Ctrl or Alt is on.
  function typeChar(ch) {
    if (armed()) { fireChar(ch); return; }
    const el = document.activeElement;
    if (isField(el) && !document.execCommand('insertText', false, ch) && hasTextCaret(el)) {
      el.setRangeText(ch, el.selectionStart, el.selectionEnd, 'end');
      el.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: ch }));
    }
    release();
  }

  // A synthetic arrow does not move the caret, so do it here when no
  // shortcut claimed the key. Up/down follow source lines, not wrapped rows.
  function moveCaret(el, key) {
    const v = el.value, back = el.selectionDirection === 'backward';
    const anchor = back ? el.selectionEnd : el.selectionStart;
    let focus = back ? el.selectionStart : el.selectionEnd;
    if (!mods.shift && el.selectionStart !== el.selectionEnd && (key === 'ArrowLeft' || key === 'ArrowRight')) {
      const at = key === 'ArrowLeft' ? el.selectionStart : el.selectionEnd;
      el.setSelectionRange(at, at); return;
    }
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const step = key === 'ArrowLeft' ? -1 : 1;
      if (mods.ctrl) {                               // a word at a time
        const re = /[\p{L}\p{N}_]/u;
        if (step < 0) { while (focus > 0 && !re.test(v[focus - 1])) focus--; while (focus > 0 && re.test(v[focus - 1])) focus--; }
        else { while (focus < v.length && !re.test(v[focus])) focus++; while (focus < v.length && re.test(v[focus])) focus++; }
      } else focus = Math.max(0, Math.min(v.length, focus + step));
    } else if (el.tagName === 'TEXTAREA') {
      const start = v.lastIndexOf('\n', focus - 1) + 1, col = focus - start;
      if (key === 'ArrowUp') {
        if (start === 0) focus = 0;
        else { const prev = v.lastIndexOf('\n', start - 2) + 1; focus = Math.min(prev + col, start - 1); }
      } else {
        const next = v.indexOf('\n', focus);
        if (next === -1) focus = v.length;
        else { const after = v.indexOf('\n', next + 1); focus = Math.min(next + 1 + col, after === -1 ? v.length : after); }
      }
    } else focus = key === 'ArrowUp' ? 0 : v.length;
    if (mods.shift) el.setSelectionRange(Math.min(anchor, focus), Math.max(anchor, focus), focus < anchor ? 'backward' : 'forward');
    else el.setSelectionRange(focus, focus);
  }
  function arrow(key) {
    const ev = fire(key, key);
    const el = document.activeElement;
    if (!ev.defaultPrevented && hasTextCaret(el)) moveCaret(el, key);
    release();
  }

  // A hardware key that arrives while a bar modifier is on: re-send it with
  // the modifier. Phone keyboards' "Unidentified" keydowns wait for input.
  window.addEventListener('keydown', e => {
    if (!e.isTrusted || !armed() || e.ctrlKey || e.altKey || e.metaKey || e.isComposing) return;
    if (/^(Unidentified|Process|Dead|Shift|Control|Alt|Meta|CapsLock)$/.test(e.key)) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (e.key.length === 1) fireChar(e.key);
    else { fire(e.key, e.code || e.key); release(); }
  }, true);
  window.addEventListener('beforeinput', e => {
    if (!armed() || !(hasTextCaret(e.target) || e.target.isContentEditable)) return;
    const t = e.inputType;
    const ch = t === 'insertLineBreak' || t === 'insertParagraph' ? 'Enter'
      : (t === 'insertText' || t === 'insertCompositionText') && e.data ? e.data.slice(-1) : '';
    if (!ch) return;
    e.stopImmediatePropagation();
    if (e.cancelable) {
      e.preventDefault();
      if (ch === 'Enter') { fire('Enter', 'Enter'); release(); } else fireChar(ch);
    } else if (hasTextCaret(e.target)) {
      pending = { el: e.target, value: e.target.value, start: e.target.selectionStart, end: e.target.selectionEnd, ch };
    }
  }, true);
  window.addEventListener('input', e => {
    if (!pending || e.target !== pending.el) return;
    const p = pending; pending = null;
    e.stopImmediatePropagation();
    p.el.value = p.value;
    p.el.setSelectionRange(p.start, p.end);
    if (p.ch === 'Enter') { fire('Enter', 'Enter'); release(); } else fireChar(p.ch);
  }, true);

  // Shown only while a text field has the caret: that is when the phone
  // keyboard is up, and the letter half of a shortcut can be typed at all.
  function show(on) {
    clearTimeout(hideTimer);
    bar.hidden = !on;
    document.body.classList.toggle('mk-on', on);
    if (!on) { Object.keys(mods).forEach(k => { mods[k] = 0; }); pending = null; paint(); }
    place();
  }
  document.addEventListener('focusin', e => {
    if (!coarse.matches || !isField(e.target)) return;
    lastField = e.target; show(true);
  });
  document.addEventListener('focusout', () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => { if (!isField(document.activeElement)) show(false); }, 150);
  });

  // Keep the caret where it is: a tap on the bar must not take focus.
  bar.addEventListener('mousedown', e => e.preventDefault());
  let repeat = 0, pressed = false;
  function stopRepeat() { clearTimeout(repeat); clearInterval(repeat); repeat = 0; }
  function refocus() {
    if (!isField(document.activeElement) && lastField && document.contains(lastField)) lastField.focus({ preventScroll: true });
  }
  bar.addEventListener('pointerdown', e => {
    const b = e.target.closest('button');
    e.preventDefault();
    if (!b) return;
    refocus();
    if (b.dataset.mkKey) {                           // arrows repeat while held
      pressed = true;
      const key = b.dataset.mkKey;
      arrow(key);
      stopRepeat();
      repeat = setTimeout(() => { repeat = setInterval(() => arrow(key), 70); }, 400);
    }
  });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach(t => bar.addEventListener(t, stopRepeat));
  bar.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.mkMod) {
      const k = b.dataset.mkMod;
      mods[k] = (mods[k] + 1) % 3;
      paint(); refocus();
    } else if (b.dataset.mkChar) typeChar(b.dataset.mkChar);
    else if (b.dataset.mkKey && !pressed) arrow(b.dataset.mkKey);   // keyboard activation
    pressed = false;
  });

  // iOS ignores interactive-widget=resizes-content: lift the bar above the
  // on-screen keyboard by the part of the layout viewport it covers.
  const vv = window.visualViewport;
  function place() {
    if (bar.hidden) return;
    const covered = vv ? Math.max(0, window.innerHeight - vv.height - vv.offsetTop) : 0;
    bar.style.bottom = covered + 'px';
    document.documentElement.style.setProperty('--mk-h', bar.offsetHeight + 'px');
  }
  if (vv) { vv.addEventListener('resize', place); vv.addEventListener('scroll', place); }
  window.addEventListener('resize', place);
  if (coarse.addEventListener) coarse.addEventListener('change', () => { if (!coarse.matches) show(false); });
})();
