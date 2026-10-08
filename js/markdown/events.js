/* ── Event listeners ── */
document.getElementById('image-modal').addEventListener('click', function(e) {
  if (e.target === this) closeImageModal();
});
document.getElementById('link-modal').addEventListener('click', function(e) {
  if (e.target === this) closeLinkModal();
});
document.getElementById('table-modal').addEventListener('click', function(e) {
  if (e.target === this) closeTableModal();
});
document.getElementById('help-modal').addEventListener('click', function(e) {
  if (e.target === this) closeHelpModal();
});
document.getElementById('wiki-modal').addEventListener('click', function(e) {
  if (e.target === this) closeWikiModal();
});
document.getElementById('idea-modal').addEventListener('click', function(e) {
  if (e.target === this) closeIdeaModal();
});
/* The idea box swallows the editor's own chords while it has the caret —
   Ctrl+S, Ctrl+I, Alt+↑ and friends are all bound on `document`, and would
   otherwise act on the chapter behind the modal. Ctrl+Enter files the idea. */
document.getElementById('idea-text').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeIdeaModal(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault(); e.stopPropagation(); saveIdea(); return;
  }
  if (e.ctrlKey || e.metaKey || e.altKey) e.stopPropagation();
});
/* The chapter picker's input: arrows move through the list, Enter picks. */
document.getElementById('idea-chapter').addEventListener('keydown', function(e) {
  if (e.key === 'Escape') { e.stopPropagation(); closeIdeaModal(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault(); e.stopPropagation(); saveIdea(); return;
  }
  if (!e.ctrlKey && !e.metaKey && !e.altKey) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (document.querySelector('#idea-chapter-list .ws-item')) {
        e.preventDefault(); ideaChapterMove(e.key === 'ArrowDown' ? 1 : -1);
      }
      return;
    }
    if (e.key === 'Enter') { e.preventDefault(); ideaChapterEnter(); return; }
    return;
  }
  e.stopPropagation();
});
document.addEventListener('keydown', e => {
  // A fullscreen dialog may have just closed while handling this Escape.
  // Do not also dismiss the ordinary dialog underneath it.
  if (e.key === 'Escape' && e.defaultPrevented) return;
  if (typeof dgIsOpen === 'function' && dgIsOpen()) return;   // the diagram modal owns every key
  if (typeof skIsOpen === 'function' && skIsOpen()) return;   // so does the sketch modal
  if (e.key === 'Escape') {
    // Innermost first: the graph and the garden toolbox cover everything,
    // so they close on their own
    if (gv.open) { closeGraph(); return; }
    if (gdOpen) { closeGarden(); return; }
    if (mbOpen) { closeMedia(); return; }
    closeImageModal(); closeLinkModal(); closeTableModal(); closeWikiModal(); closeIdeaModal(); closeHelpModal(); closeWorkbookModal();
    if (isSmallScreen()) closeAllPanels();
  }
  // Dialogs own their keys, even if focus escapes to the background editor.
  // Other editable fields keep native shortcuts instead of editing the chapter.
  const el = document.activeElement;
  if (document.querySelector('.image-modal.open') ||
      (el && el !== editor && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable))) return;
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === 'KeyH') {
    e.preventDefault(); highlightPageMatches(e.altKey); return;
  }
  // Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y → the editor's own history (undoMark).
  // Another field's focus is left alone — a modal's inputs keep the
  // browser's undo, which is the only one they have.
  if ((e.ctrlKey || e.metaKey) && !e.altKey && /^[zyZY]$/.test(e.key)) {
    const el = document.activeElement;
    if (el && el !== editor && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
    e.preventDefault();
    if (e.shiftKey || e.key === 'y' || e.key === 'Y') redoEdit(); else undoEdit();
    return;
  }
  // Ctrl+Alt+1/2/3 → the three importance levels, Ctrl+Alt+0 clears. e.code
  // for the same reason the heading shortcuts use it, and because Ctrl+Alt is
  // AltGr on a Romanian layout — the digits are unmapped there, the letters
  // are not, which is why this is a digit shortcut and not a letter one.
  // It runs *before* the panel shortcuts below, and returns: Alt does not
  // change e.key on every layout, so otherwise Ctrl+Alt+3 also opens the graph.
  if ((e.ctrlKey||e.metaKey) && e.altKey && /^Digit[0-3]$/.test(e.code)) {
    e.preventDefault();
    setImportance(e.code === 'Digit0' ? 'none' : IMP_LEVELS[+e.code.slice(5) - 1]);
    return;
  }
  // Ctrl+Shift+7/8/9 → the task at the caret (or the paragraph there, made
  // into one) is to do / in work / done: the three states in the order a
  // task moves through them, right after Ctrl+Shift+1..6 changed the line
  // into a heading — and the same 7/8/9 run Docs uses for its lists. e.code
  // because Shift turns the digit into "&", "*", "(" on most layouts. Another
  // field's focus is left alone; the shortcut is for the text being written.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && !e.altKey && /^Digit[7-9]$/.test(e.code)) {
    const el = document.activeElement;
    if (el && el !== editor && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    setTaskStatus(TASK_SHORTCUTS[e.code]);
    navRevealLine(editor.value.slice(0, editor.selectionStart).split('\n').length - 1);
    return;
  }
  // Ctrl+Shift+. / Ctrl+Shift+, → next / previous heading or task, in the
  // source, the preview and the navigation panel together (navStep). Ctrl+Shift+6
  // is already H6, so the pair sits on the angle-bracket keys. e.code because
  // Shift turns the key into ">" / "<". Another field's focus is left alone.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && !e.altKey && (e.code === 'Period' || e.code === 'Comma')) {
    const el = document.activeElement;
    if (el && el !== editor && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    navStep(e.code === 'Period' ? 1 : -1);
    return;
  }
  // Ctrl+Shift+/ copies the caret's whole block without its opening heading prefix,
  // task checkbox or task status. e.code survives Shift and keyboard layouts.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && !e.altKey && e.code === 'Slash') {
    const el = document.activeElement;
    if (el && el !== editor && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
    e.preventDefault();
    selectAndCopySectionText();
    return;
  }
  // Ctrl+Alt+I — the idea box. Ctrl+I is italic and Ctrl+Shift+I is the
  // browser's own devtools, so Ctrl+Alt is what is left; e.code and an early
  // return for the same reason the importance chords above use them.
  if ((e.ctrlKey||e.metaKey) && e.altKey && e.code === 'KeyI') { e.preventDefault(); openIdeaModal(); return; }
  if ((e.ctrlKey||e.metaKey) && e.altKey && e.code === 'KeyD') { e.preventDefault(); calSyncAll(); return; }
  if ((e.ctrlKey||e.metaKey) && e.altKey && e.code === 'KeyM') { e.preventDefault(); openMap(); return; }
  if ((e.ctrlKey||e.metaKey) && e.key === '3') { e.preventDefault(); toggleGraph(); }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'L') { e.preventDefault(); openWikiModal(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '1') { e.preventDefault(); toggleNav(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '2') { e.preventDefault(); toggleWorkbooks(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '4') { e.preventDefault(); toggleFind(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '5') { e.preventDefault(); toggleGarden(); }
  if ((e.ctrlKey||e.metaKey) && e.key === '6') { e.preventDefault(); toggleMedia(); }
  // Ctrl+Shift+F as well, the way every editor spells "search everything".
  // Plain Ctrl+F is left alone: the browser's own find still has a job here.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'F') { e.preventDefault(); toggleFind(); }
  if ((e.ctrlKey||e.metaKey) && e.altKey && e.code === 'KeyS') { e.preventDefault(); saveAllModifiedChapters(); return; }
  if ((e.ctrlKey||e.metaKey) && e.key === 's') { e.preventDefault(); saveToWorkbook(); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'b') { e.preventDefault(); wrapSelection('**','**'); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'i') { e.preventDefault(); wrapSelection('*','*'); }
  if ((e.ctrlKey||e.metaKey) && e.key === 'k') { e.preventDefault(); openLinkModal(); }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'K') { e.preventDefault(); insertCodeBlock(); }
  // Ctrl+Shift+1..6 → H1..H6. e.code (not e.key) because Shift+digit
  // produces a punctuation character ("!", "@", …) on US layouts.
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && /^Digit[1-6]$/.test(e.code)) {
    e.preventDefault(); insertHeading(e.code.slice(5));
  }
  if ((e.ctrlKey||e.metaKey) && e.shiftKey && e.key === 'Enter') { e.preventDefault(); insertLineAbove(); }
  else if ((e.ctrlKey||e.metaKey) && e.key === 'Enter') { e.preventDefault(); insertLineBelow(); }
  if ((e.ctrlKey||e.metaKey) && !e.altKey && !e.shiftKey && e.key === 'l' && document.activeElement === editor) { e.preventDefault(); selectLineOrParagraph(); return; }
  if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); moveLineDown(); }
  else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); moveLineUp(); }
});
