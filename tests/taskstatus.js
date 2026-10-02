// Task status editing, preview and Markdown round trips in index.html.
const path = require('path');
const { chromium } = require('playwright');

const URL = process.env.MD_URL || 'file://' + path.join(__dirname, '..', 'index.html');
let failed = 0;
function check(name, ok, detail) {
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : ' -> ' + JSON.stringify(detail)));
  if (!ok) failed++;
}

(async () => {
  const browser = await chromium.launch(process.env.PW_CHROME_PATH ? { executablePath: process.env.PW_CHROME_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(URL);
  await page.waitForTimeout(300);
  const source = () => page.evaluate(() => editor.value);
  const pick = status => page.selectOption('#task-status-select', status);
  const place = (md, needle, last) => page.evaluate(([text, first, final]) => {
    editor.value = text;
    undoReset();
    const start = text.indexOf(first) + 1;
    editor.setSelectionRange(start, final ? text.indexOf(final) + final.length : start);
    updatePreview(); updateStatus();
  }, [md, needle, last || '']);

  await place('Call Ana\n', 'Call');
  await pick('inwork');
  check('status creates a task from plain Markdown', (await source()).startsWith('- [ ] ~inwork Call Ana'), await source());
  await place('  - Call Ana\n', 'Call');
  await pick('done');
  check('status keeps an existing list bullet and indentation', (await source()).startsWith('  - [x] Call Ana'), await source());
  await place('', '');
  await pick('blocked');
  check('status creates a task on an empty line', await source() === '- [ ] ~blocked', await source());
  await place('Call Ana\n\nBuy milk', 'Call', 'milk');
  await pick('todo');
  check('status turns selected plain lines into tasks without filling blank lines',
    await source() === '- [ ] Call Ana\n\n- [ ] Buy milk', await source());

  await place('- [ ] Call Ana\n- [ ] Buy milk\n', 'Call');
  await pick('inwork');
  check('in work writes an unchecked task marker', (await source()).startsWith('- [ ] ~inwork Call Ana'), await source());
  check('in work renders a readable badge', (await page.locator('#preview .task-status-inwork').textContent()).includes('În lucru'));
  check('a bare checkbox can receive a status', await page.evaluate(() => taskSetLineStatus('- [ ]', 'blocked')) === '- [ ] ~blocked');
  await page.evaluate(() => editor.setSelectionRange(8, 8));
  await pick('onhold');
  check('changing status replaces the marker', (await source()).startsWith('- [ ] ~onhold Call Ana'), await source());
  await page.evaluate(() => editor.setSelectionRange(8, 8));
  await pick('blocked');
  check('blocked replaces on hold', (await source()).startsWith('- [ ] ~blocked Call Ana'), await source());
  check('blocked renders a badge', await page.locator('#preview .task-status-blocked').count() === 1);
  await page.locator('#preview .task-checkbox').first().click();
  check('clicking the box finishes and clears the marker', (await source()).startsWith('- [x] Call Ana'), await source());
  await page.locator('#preview .task-checkbox').first().click();
  check('unchecking a done task returns it to to do', (await source()).startsWith('- [ ] Call Ana'), await source());

  await place('- [x] Ana>> !vital Call Ana\n- [ ] Buy milk\nPlain text', 'Call', 'milk');
  await pick('inwork');
  const multi = await source();
  check('selection changes both tasks but leaves prose', multi === '- [ ] ~inwork Ana>> !vital Call Ana\n- [ ] ~inwork Buy milk\nPlain text', multi);
  check('assignee and importance still render', await page.locator('#preview li').first().evaluate(li => !!li.querySelector('.md-assignee') && !!li.querySelector('.md-imp-vital')));
  const markers = await page.evaluate(() => {
    const line = '- [ ] ~inwork Ana>> Call Ana @2026-09-24';
    const date = '@2026-09-24';
    return {
      names: [...wbNamesIn(line).values()],
      importance: impSetLine('- [ ] ~inwork Ana>> Call Ana', 'vital'),
      calendarTitle: calTitleOf(line, { index: line.indexOf(date), length: date.length })
    };
  });
  check('assignee filter sees status tasks', markers.names.length === 1 && markers.names[0] === 'Ana', markers);
  check('importance stays after status and assignee', markers.importance === '- [ ] ~inwork Ana>> !vital Call Ana', markers);
  check('calendar title omits task status', markers.calendarTitle === 'Call Ana', markers);
  const anywhere = await page.evaluate(() => {
    const text = 'Discuss with >>Ana and >>Ion.\n# Review >>Mara\n- [ ] Call >>Ana\n```\n>>Hidden\n```';
    const html = parseMarkdown(text);
    const names = [...wbNamesIn(text).values()];
    const filtered = wbPreviewFilteredText;
    const oldFilter = wbResponsibleFilter;
    wbResponsibleFilter = wbResponsibleKey('Ion');
    const matchingText = filtered(text).text;
    wbResponsibleFilter = oldFilter;
    return { html, names, matchingText };
  });
  check('inline responsible renders in prose, headings and tasks',
    (anywhere.html.match(/class="md-assignee"/g) || []).length === 4, anywhere);
  check('responsible names are found outside tasks and fences are ignored',
    anywhere.names.join(',') === 'Ana,Ion,Mara', anywhere);
  check('responsible filter finds a prose line',
    anywhere.matchingText === 'Discuss with >>Ana and >>Ion.', anywhere);
  await page.evaluate(() => { editor.setSelectionRange(8, 8); });
  await pick('todo');
  check('to do clears only the chosen task marker', (await source()).startsWith('- [ ] Ana>> !vital Call Ana\n- [ ] ~inwork'), await source());
  await page.evaluate(() => { editor.setSelectionRange(8, 8); });
  await page.keyboard.press('Control+z');
  check('status change is one undo step', (await source()).startsWith('- [ ] ~inwork Ana>>'), await source());

  await place('- [ ] ~blocked Fix this\n- [x] Done already', 'Fix');
  // The tasks-only toggle became the state filter (#btn-filter-todo, a <select>).
  await page.selectOption('#btn-filter-todo', 'blocked');
  check('the state filter keeps a blocked open task', await page.locator('#preview .task-status-blocked').count() === 1);
  check('and leaves out the done one', await page.locator('#preview .task-checkbox').count() === 1);
  const html = await page.evaluate(() => parseMarkdown(editor.value, { forExport: true }));
  check('export contains readable status, not marker text', html.includes('task-status-blocked') && !html.includes('~blocked'), html.slice(0, 350));
  await page.evaluate(() => { UI = 'en'; applyUILang(); });
  check('badge translates when UI changes', await page.locator('#preview .task-status-blocked').textContent() === '⛔ Blocked');
  await page.locator('#preview .task-checkbox').click();
  check('filtered checkbox updates the original line', (await source()).startsWith('- [x] Fix this\n- [x] Done already'), await source());
  await page.selectOption('#btn-filter-todo', '');

  // ---- Ctrl+Shift+7 / 8 / 9 — the three everyday states from the keyboard --
  await page.evaluate(() => { UI = 'ro'; applyUILang(); });
  const caret = () => page.evaluate(() => [editor.selectionStart, editor.selectionEnd]);
  await place('# Plan\nSună la instalator azi\nAltă idee\n', 'instalator');
  await page.focus('#editor');
  const at = (await caret())[0];
  await page.keyboard.press('Control+Shift+Digit7');
  check('Ctrl+Shift+7 makes the paragraph a to-do task',
    await source() === '# Plan\n- [ ] Sună la instalator azi\nAltă idee\n', await source());
  check('and the caret stays on the same word', (await caret())[0] === at + 6, { at, now: await caret() });
  await page.keyboard.press('Control+Shift+Digit8');
  check('Ctrl+Shift+8 puts it in work',
    await source() === '# Plan\n- [ ] ~inwork Sună la instalator azi\nAltă idee\n', await source());
  check('the caret follows the marker', (await caret())[0] === at + 6 + 8, await caret());
  await page.keyboard.press('Control+Shift+Digit9');
  check('Ctrl+Shift+9 finishes it and drops the marker',
    await source() === '# Plan\n- [x] Sună la instalator azi\nAltă idee\n', await source());
  await page.keyboard.press('Control+Shift+Digit7');
  check('Ctrl+Shift+7 opens a done task again', (await source()).includes('- [ ] Sună la'), await source());
  check('the other lines are untouched', (await source()).startsWith('# Plan\n') && (await source()).endsWith('Altă idee\n'), await source());
  await page.keyboard.press('Control+z');
  check('a shortcut is one undo step', (await source()).includes('- [x] Sună la'), await source());
  await place('# Plan\n- [ ] Ana>> !vital Sună @2026-10-05\n', 'Sună');
  await page.focus('#editor');
  await page.keyboard.press('Control+Shift+Digit8');
  check('assignee, importance and date stay after the state',
    await source() === '# Plan\n- [ ] ~inwork Ana>> !vital Sună @2026-10-05\n', await source());
  await place('unu\ndoi\n\ntrei', 'unu', 'trei');
  await page.focus('#editor');
  await page.keyboard.press('Control+Shift+Digit7');
  check('a selection makes every non-empty line a task',
    await source() === '- [ ] unu\n- [ ] doi\n\n- [ ] trei', await source());
  check('and stays selected for the next state', (await caret()).join() === '0,' + (await source()).length, await caret());
  await page.keyboard.press('Control+Shift+Digit9');
  check('the next state reaches every selected task',
    await source() === '- [x] unu\n- [x] doi\n\n- [x] trei', await source());
  check('the toolbar tip names the shortcuts', (await page.getAttribute('#task-status-select', 'title')).includes('Ctrl+Shift+7'));
  // a field elsewhere keeps its own keys
  await place('Plain\n', 'Plain');
  await page.evaluate(() => { const i = document.createElement('input'); i.id = 'tmp-field'; document.body.appendChild(i); i.focus(); });
  await page.keyboard.press('Control+Shift+Digit7');
  check('another focused field leaves the chapter alone', await source() === 'Plain\n', await source());
  await page.evaluate(() => document.getElementById('tmp-field').remove());

  // ---- the tasks in the navigation panel --------------------------------
  const DOC = '- [ ] Before any heading\n# Casa\n- [ ] Vopsește gardul\n- [ ] ~inwork **Repară** robinetul ^rob\n'
    + '  - [x] Cumpără garnituri\nProză obișnuită\n## Grădina\n- [ ] ~blocked Udă roșiile\n- [ ] \n'
    + '```\n- [ ] in a fence\n```\n- [x] Tunde iarba\n';
  await page.evaluate(doc => {
    try { localStorage.removeItem('scula:navTaskHidden'); } catch (e) {}
    navTaskHidden.clear();
    editor.value = doc; undoReset(); updatePreview(); updateStatus();
    if (document.getElementById('nav-panel').classList.contains('collapsed')) toggleNav();
  }, DOC);
  const navState = () => page.evaluate(() => ({
    items: [...document.querySelectorAll('#nav-tree .nav-item')].map(n =>
      (n.classList.contains('nav-task') ? [...n.classList].find(c => /^nav-task-/.test(c)).slice(9) + ':' : 'h:') + n.title),
    chips: [...document.querySelectorAll('#nav-tasks .nav-task-chip')].map(c => c.textContent + (c.classList.contains('off') ? ' off' : '')),
    sum: (document.querySelector('#nav-tasks .nav-tasks-sum') || {}).textContent || '',
    barHidden: document.getElementById('nav-tasks').hidden,
    active: [...document.querySelectorAll('#nav-tree .nav-item.active')].map(n => n.title)
  }));
  let nav = await navState();
  check('the panel lists headings and tasks in source order', nav.items.join('|') ===
    'todo:Before any heading|h:Casa|todo:Vopsește gardul|inwork:Repară robinetul|done:Cumpără garnituri|h:Grădina|blocked:Udă roșiile|done:Tunde iarba', nav.items);
  check('one chip per state in use, with its count', nav.chips.join('|') === '☐ 2|◐ 1|⛔ 1|☑ 2', nav.chips);
  check('and the share done', nav.sum === 'Sarcini: 2 din 6 terminate', nav.sum);
  const indents = await page.evaluate(() => [...document.querySelectorAll('#nav-tree .nav-task')].map(n => parseInt(n.style.paddingLeft, 10)));
  check('a task sits under its heading, a subtask further in', indents[1] > indents[0] && indents[3] > indents[2] && indents[5] > indents[1], indents);

  await page.locator('#nav-tasks .nav-task-chip.nav-task-done').click();
  nav = await navState();
  check('a chip hides its state', !nav.items.some(i => i.startsWith('done:')) && nav.chips.includes('☑ 2 off'), nav);
  check('and it is remembered', await page.evaluate(() => localStorage.getItem('scula:navTaskHidden')) === '["done"]');
  await page.locator('#nav-tasks .nav-task-chip.nav-task-done').click();
  check('pressed again it shows them', (await navState()).items.some(i => i.startsWith('done:')));

  // click a task: source line selected, preview <li> flashed
  const jump = await page.evaluate(async () => {
    const item = [...document.querySelectorAll('#nav-tree .nav-task')].find(n => n.title === 'Udă roșiile');
    item.click();
    await new Promise(r => setTimeout(r, 200));
    return {
      picked: editor.value.slice(editor.selectionStart, editor.selectionEnd),
      flashed: (preview.querySelector('.md-target') || {}).textContent || '',
      active: item.classList.contains('active')
    };
  });
  check('clicking a task selects its line in the source', jump.picked === '- [ ] ~blocked Udă roșiile', jump);
  check('and flashes it in the preview', jump.flashed.includes('Udă roșiile'), jump);
  check('and marks it active', jump.active, jump);

  // the icon walks the states, one undo step each, the caret untouched
  await page.evaluate(() => editor.setSelectionRange(3, 3));
  const icon = title => page.locator('#nav-tree .nav-task', { hasText: title }).locator('.nav-task-icon');
  await icon('Vopsește gardul').click();
  check('the icon moves to do → in work', (await source()).includes('- [ ] ~inwork Vopsește gardul'), await source());
  await icon('Vopsește gardul').click();
  check('in work → done', (await source()).includes('- [x] Vopsește gardul'), await source());
  await icon('Vopsește gardul').click();
  check('done → to do', (await source()).includes('\n- [ ] Vopsește gardul'), await source());
  check('the caret was left where it was', (await caret()).join() === '3,3', await caret());
  await icon('Udă roșiile').click();
  check('blocked goes back to work', (await source()).includes('- [ ] ~inwork Udă roșiile'), await source());
  await page.keyboard.press('Control+z');
  check('an icon click is one undo step', (await source()).includes('- [ ] ~blocked Udă roșiile'), await source());

  // a shortcut shows up in the panel at once, highlighted
  await page.evaluate(() => { const at = editor.value.indexOf('Proză'); editor.focus(); editor.setSelectionRange(at, at); });
  await page.keyboard.press('Control+Shift+Digit8');
  nav = await navState();
  check('a paragraph made a task appears in the panel', nav.items.includes('inwork:Proză obișnuită'), nav.items);
  check('highlighted as the one just changed', nav.active.join() === 'Proză obișnuită', nav.active);
  await page.keyboard.type('x');
  check('typing lets the highlight go', (await navState()).active.length === 0);

  await page.evaluate(() => { UI = 'en'; applyUILang(); });
  nav = await navState();
  check('the summary follows the language', /^Tasks: \d+ of \d+ done$/.test(nav.sum), nav.sum);
  check('and the icon tip', (await icon('Tunde iarba').getAttribute('title')).startsWith('Click: next state'));
  await page.evaluate(() => { UI = 'ro'; applyUILang(); editor.value = '# Doar titlu\n'; updatePreview(); });
  nav = await navState();
  check('no tasks, no task bar', nav.barHidden && nav.items.join() === 'h:Doar titlu', nav);
  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
