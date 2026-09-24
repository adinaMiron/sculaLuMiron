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
  await page.evaluate(() => { editor.setSelectionRange(8, 8); });
  await pick('todo');
  check('to do clears only the chosen task marker', (await source()).startsWith('- [ ] Ana>> !vital Call Ana\n- [ ] ~inwork'), await source());
  await page.evaluate(() => { editor.setSelectionRange(8, 8); });
  await page.keyboard.press('Control+z');
  check('status change is one undo step', (await source()).startsWith('- [ ] ~inwork Ana>>'), await source());

  await place('- [ ] ~blocked Fix this\n- [x] Done already', 'Fix');
  await page.locator('#btn-filter-todo').click();
  check('tasks-only filter includes a blocked open task', await page.locator('#preview .task-status-blocked').count() === 1);
  check('tasks-only filter excludes done tasks', await page.locator('#preview .task-checkbox').count() === 1);
  const html = await page.evaluate(() => parseMarkdown(editor.value, { forExport: true }));
  check('export contains readable status, not marker text', html.includes('task-status-blocked') && !html.includes('~blocked'), html.slice(0, 350));
  await page.evaluate(() => { UI = 'en'; applyUILang(); });
  check('badge translates when UI changes', await page.locator('#preview .task-status-blocked').textContent() === '⛔ Blocked');
  await page.locator('#preview .task-checkbox').click();
  check('filtered checkbox updates the original line', (await source()).startsWith('- [x] Fix this\n- [x] Done already'), await source());
  await page.locator('#btn-filter-todo').click();
  check('no page errors', errors.length === 0, errors);

  await browser.close();
  console.log(failed ? `\n${failed} FAILED` : '\nall good');
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
