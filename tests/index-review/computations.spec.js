const { test, expect, edit } = require('./helpers');

test('Gantt calendar boundaries: leap days, year rollover and invalid dates', async ({ page }) => {
  const got = await page.evaluate(() => Object.fromEntries([
    '2024-02-29', '2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01',
    '2026-01-00', '2026-12-31', '2027-01-01', '29.02.2024'
  ].map(value => [value, ganttDay(value)])));
  expect(got).toEqual({
    '2024-02-29': Date.UTC(2024, 1, 29), '2026-02-29': null, '2026-04-31': null,
    '2026-00-01': null, '2026-13-01': null, '2026-01-00': null,
    '2026-12-31': Date.UTC(2026, 11, 31), '2027-01-01': Date.UTC(2027, 0, 1),
    '29.02.2024': Date.UTC(2024, 1, 29)
  });
});

test('Gantt inclusive duration is three days across a leap day and DST boundary', async ({ page }) => {
  for (const [start, end] of [['2024-02-28', '2024-03-01'], ['2026-03-28', '2026-03-30'], ['2026-10-24', '2026-10-26']]) {
    await edit(page, `- [ ] Task start@${start} end@${end}`);
    const geometry = await page.evaluate(() => {
      paintGantt();
      return { step: parseFloat(document.querySelector('.gantt-day').style.width),
        bar: parseFloat(document.querySelector('.gantt-bar').style.width),
        count: document.querySelectorAll('.gantt-day').length };
    });
    expect(geometry.bar / geometry.step).toBe(3);
    expect(geometry.count).toBe(5);
  }
});

test('Gantt empty input and duplicate/missing references are handled', async ({ page }) => {
  expect(await page.evaluate(() => ganttParse('').tasks.length)).toBe(0);
  const result = await page.evaluate(() => {
    const x = ganttParse('- [ ] First #1\n- [x] Second #1 $99\n```\n- [ ] Example #99\n```');
    return { count: x.tasks.length, problems: x.problems };
  });
  expect(result.count).toBe(2);
  expect(result.problems).toHaveLength(2);
  expect(result.problems.join(' ')).toContain('#99');
});

for (const [timezoneId, cases] of [
  ['Europe/Bucharest', [
    ['before midnight', '2026-10-08T20:30:00Z', '2026-10-08'],
    ['after midnight', '2026-10-08T21:30:00Z', '2026-10-09'],
  ]],
  ['America/Los_Angeles', [
    ['before midnight', '2026-10-08T06:30:00Z', '2026-10-07'],
    ['after midnight', '2026-10-08T07:30:00Z', '2026-10-08'],
  ]],
]) {
  test.describe(timezoneId, () => {
    test.use({ timezoneId });
    for (const [boundary, instant, date] of cases) {
      test(`Gantt today uses the local day around midnight: ${boundary}`, { tag: '@idx-gantt-local-today' }, async ({ page }) => {
        await page.clock.setFixedTime(new Date(instant));
        await edit(page, `- [ ] Local today\n- [ ] Explicit today start@${date} end@${date}`);
        const positions = await page.evaluate(() => {
          paintGantt();
          return [...document.querySelectorAll('.gantt-bar')].map(e => parseFloat(e.style.left));
        });
        expect(positions).toHaveLength(2);
        expect(positions[0], 'undated task and explicit local today must align').toBe(positions[1]);
      });
    }
  });
}

test('Gantt reports invalid and reversed ranges instead of inventing valid bars', { tag: '@idx-gantt-invalid-ranges' }, async ({ page }) => {
  await edit(page, '- [ ] Invalid start@2026-02-30\n- [ ] Reversed start@2026-10-10 end@2026-10-01');
  await page.evaluate(() => openGantt());
  await expect(page.locator('#gantt-notice')).not.toBeEmpty();
  await expect(page.locator('.gantt-bar')).toHaveCount(0);
  await expect(page.locator('.gantt-label a')).toHaveText(['Invalid', 'Reversed']);
  await expect(page.locator('.gantt-row')).toHaveCount(2);
  await expect(page.locator('.gantt-label small').nth(0)).toContainText('2026-02-30');
  await expect(page.locator('.gantt-label small').nth(1)).toContainText('2026-10-10');
  await expect(page.locator('.gantt-label small').nth(1)).toContainText('2026-10-01');
  for (const language of ['en', 'ro']) {
    await page.evaluate(language => window.dispatchEvent(new CustomEvent('scula-ui-lang', { detail: language })), language);
    const messages = await page.evaluate(() => [t('ganttInvalidDate', 'Invalid'), t('ganttReversedRange', 'Reversed')]);
    await expect(page.locator('#gantt-notice')).toHaveText(messages.join(' '));
    for (const [index, message] of messages.entries()) {
      await expect(page.locator('.gantt-label small').nth(index)).toContainText(message);
    }
    await expect(page.locator('.gantt-bar')).toHaveCount(0);
  }
  // Invalid tasks remain reachable so their original source can be corrected.
  await page.locator('.gantt-label a').nth(1).click();
  expect(await page.evaluate(() => editor.selectionStart)).toBe(await page.evaluate(() => editor.value.indexOf('- [ ] Reversed')));
  await edit(page, '- [ ] Corrected start@2026-10-01 end@2026-10-10');
  await page.evaluate(() => openGantt());
  await expect(page.locator('#gantt-notice')).toBeEmpty();
  await expect(page.locator('.gantt-bar')).toHaveCount(1);
});

test('Gantt rejects supplied invalid dates even when the other endpoint is valid', { tag: '@idx-gantt-invalid-ranges' }, async ({ page }) => {
  for (const value of ['2026-02-29', '2026-04-31', '2026-00-01', '2026-13-01', '2026-01-00', '30.02.2026', '31/04/2026', '2026-02-30 09:30', '2026-10-08junk', '08/10/2026junk', 'not-a-date', '09:30', '']) {
    for (const endpoint of ['start', 'end']) {
      const other = endpoint === 'start' ? 'end' : 'start';
      await edit(page, `- [ ] Bad ${other}@2026-10-08 ${endpoint}@${value}`);
      const result = await page.evaluate(() => {
        paintGantt();
        return { notice: document.getElementById('gantt-notice').textContent,
          expected: t('ganttInvalidDate', 'Bad'), bars: document.querySelectorAll('.gantt-bar').length,
          metadata: document.querySelector('.gantt-label small').textContent, noDate: t('ganttNoDate') };
      });
      expect(result.notice, `${endpoint}@${value}`).toBe(result.expected);
      expect(result.bars, `${endpoint}@${value}`).toBe(0);
      expect(result.metadata).not.toContain(result.noDate);
    }
  }
  for (const source of ['- [ ] Bad start@) 2026-10-08 2026-10-09', '- [ ] Bad end@) @2026-10-08']) {
    await edit(page, source);
    await page.evaluate(() => paintGantt());
    await expect(page.locator('#gantt-notice')).not.toBeEmpty();
    await expect(page.locator('.gantt-bar')).toHaveCount(0);
  }
});

test('Gantt keeps valid schedules and arrows when invalid ranges share the chart', { tag: '@idx-gantt-invalid-ranges' }, async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-10-09T09:00:00Z'));
  await edit(page, '- [ ] Invalid #1 start@2026-01-01 end@2026-02-30\n- [ ] Valid #2 start@2026-10-08 end@2026-10-10\n- [ ] Reversed #3 $2 start@2026-10-10 end@2026-10-01\n- [ ] End only $1 $2 end@2026-10-09\n- [ ] Undated $3 $2');
  const result = await page.evaluate(() => {
    paintGantt();
    const step = parseFloat(document.querySelector('.gantt-day').style.width);
    return { rows: [...document.querySelectorAll('.gantt-row')].map(row => row.querySelectorAll('.gantt-bar').length),
      durations: [...document.querySelectorAll('.gantt-bar')].map(bar => parseFloat(bar.style.width) / step),
      positions: [...document.querySelectorAll('.gantt-bar')].map(bar => parseFloat(bar.style.left)),
      inferred: [...document.querySelectorAll('.gantt-bar')].map(bar => bar.classList.contains('inferred')),
      days: document.querySelectorAll('.gantt-day').length, paths: document.querySelectorAll('.gantt-arrows > path').length };
  });
  expect(result.rows).toEqual([0, 1, 0, 1, 1]);
  expect(result.durations).toEqual([3, 1, 1]);
  expect(result.positions[1]).toBe(result.positions[2]);
  expect(result.inferred).toEqual([false, false, true]);
  expect(result.days).toBe(5);
  expect(result.paths).toBe(2);
  expect(errors).toEqual([]);
  // Full timestamps and local date syntax remain valid single-day schedules.
  await edit(page, '- [ ] Start only start@08.10.2026 09:30\n- [ ] End only end@2026-10-08 10:30');
  await page.evaluate(() => paintGantt());
  await expect(page.locator('#gantt-notice')).toBeEmpty();
  await expect(page.locator('.gantt-bar')).toHaveCount(2);
});

test('Gantt excludes tasks inside a longer enclosing code fence', { tag: '@idx-gantt-fence-length' }, async ({ page }) => {
  const titles = await page.evaluate(() => ganttParse('````markdown\n```\n- [ ] Example, not a task\n```\n````\n- [ ] Real task').tasks.map(t => t.title));
  expect(titles).toEqual(['Real task']);
});

for (const [name, opening, interior, closing] of [
  ['short backticks', '````markdown', '```', '````'],
  ['short tildes', '~~~~markdown', '~~~', '~~~~'],
  ['different fence character', '```markdown', '~~~~', '```'],
  ['backtick closer with text', '```markdown', '``` trailing text', '```'],
  ['tilde closer with text', '~~~markdown', '~~~~ trailing text', '~~~'],
  ['longer closer with whitespace', '````markdown', '```', '  ````` \t\r'],
  ['tilde info containing backticks', '~~~markdown `example`', '```', '~~~~\t'],
  ['unterminated enclosing block', '````markdown', '```', null],
]) {
  test(`Gantt respects enclosing fence syntax: ${name}`, { tag: '@idx-gantt-fence-length' }, async ({ page }) => {
    const source = [opening, interior, '- [ ] Hidden #99 $404 start@2020-01-01', closing, '- [ ] Real task'].filter(line => line !== null).join('\n');
    const result = await page.evaluate(source => {
      const parsed = ganttParse(source);
      return { titles: parsed.tasks.map(task => task.title), definitions: [...parsed.definitions.keys()], problems: parsed.problems };
    }, source);
    expect(result).toEqual({ titles: closing === null ? [] : ['Real task'], definitions: [], problems: [] });
  });
}

test('Gantt fenced examples do not affect counts, dependencies or dates', { tag: '@idx-gantt-fence-length' }, async ({ page }) => {
  const source = '````markdown\n```\n- [ ] Example #1 #99 $404 start@2020-01-01\n```\n````\n- [ ] First #1 start@2026-10-08\n- [ ] Second $1 $99 end@2026-10-09';
  await edit(page, source);
  await page.evaluate(() => openGantt());
  await expect(page.locator('.gantt-label a')).toHaveText(['First', 'Second']);
  await expect(page.locator('.gantt-label-head')).toHaveText(await page.evaluate(() => t('ganttTasks') + ' (2)'));
  await expect(page.locator('#gantt-notice')).toHaveText(await page.evaluate(() => t('ganttMissing', '99')));
  await expect(page.locator('.gantt-bar')).toHaveCount(2);
  await expect(page.locator('.gantt-day')).toHaveCount(4);
  await expect(page.locator('.gantt-arrows > path')).toHaveCount(1);
  await page.locator('.gantt-label a').nth(1).click();
  expect(await page.evaluate(() => editor.selectionStart)).toBe(source.indexOf('- [ ] Second'));
});

test('Gantt large ranges use bounded ticks instead of one element per day', { tag: '@idx-gantt-range-growth' }, async ({ page }) => {
  const source = '- [ ] History start@1900-01-01 end@2100-01-01';
  await edit(page, source);
  const result = await page.evaluate(() => {
    const start = performance.now();
    paintGantt();
    return { ticks: document.querySelectorAll('.gantt-day').length,
      width: document.querySelector('.gantt-chart').style.width, ms: performance.now() - start };
  });
  expect(result.ticks, JSON.stringify(result)).toBeLessThanOrEqual(1000);
  expect(parseFloat(result.width)).toBeLessThanOrEqual(3600);
  await page.evaluate(() => openGantt());
  await page.locator('#gantt-close').click({ timeout: 3000 });
  await expect(page.locator('#gantt-modal')).not.toHaveClass(/open/);
  await page.evaluate(() => openGantt());
  await page.locator('.gantt-label a').click({ timeout: 3000 });
  await expect(page.locator('#gantt-modal')).not.toHaveClass(/open/);
  expect(await page.evaluate(() => editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe(source);
  await edit(page, '- [ ] Corrected start@2026-10-08 end@2026-10-09');
  await page.evaluate(() => openGantt());
  await expect(page.locator('.gantt-day')).toHaveCount(4);
  await expect(page.locator('.gantt-label a')).toHaveText('Corrected');
});

test('Gantt bounds extreme four-digit ranges and preserves date geometry and arrows', { tag: '@idx-gantt-range-growth' }, async ({ page }) => {
  const source = '- [ ] History #1 start@0100-01-01 end@5000-01-01\n- [x] Future $1 start@5000-01-02 end@9999-12-31';
  await edit(page, source);
  const result = await page.evaluate(() => {
    paintGantt();
    const ticks = [...document.querySelectorAll('.gantt-day')];
    return { ticks: ticks.length, width: parseFloat(document.querySelector('.gantt-chart').style.width),
      tickWidths: ticks.map(tick => parseFloat(tick.style.width)),
      first: ticks[0].title, last: ticks.at(-1).title,
      expectedFirst: ganttFormat(ganttDay('0100-01-01') - GANTT_DAY_MS),
      expectedLast: ganttFormat(ganttDay('9999-12-31') + GANTT_DAY_MS),
      grid: parseFloat(document.querySelector('.gantt-row').style.backgroundSize),
      bars: [...document.querySelectorAll('.gantt-bar')].map(bar => ({ left: parseFloat(bar.style.left), width: parseFloat(bar.style.width) })),
      path: document.querySelector('.gantt-arrows > path').getAttribute('d'),
      svgWidth: Number(document.querySelector('.gantt-arrows').getAttribute('width')) };
  });
  expect(result.ticks).toBeLessThanOrEqual(60);
  expect(result.width).toBeLessThanOrEqual(3600);
  expect(result.tickWidths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(result.width, 2);
  expect(result.grid).toBeCloseTo(result.tickWidths[0], 2);
  expect(result.first).toContain(result.expectedFirst);
  expect(result.last).toContain(result.expectedLast);
  const count = (Date.UTC(9999, 11, 31) - Date.UTC(100, 0, 1)) / 86400000 + 3;
  const step = result.width / count;
  expect(result.bars).toHaveLength(2);
  // CSSOM serializes pixel lengths with limited significant digits.
  expect(result.bars[0].left).toBeCloseTo(step, 2);
  expect(result.bars[0].width).toBeCloseTo(((Date.UTC(5000, 0, 1) - Date.UTC(100, 0, 1)) / 86400000 + 1) * step, 2);
  expect(result.bars[1].left).toBeCloseTo(result.bars[0].left + result.bars[0].width, 2);
  expect(result.bars[1].left + result.bars[1].width).toBeCloseTo(result.width - step, 2);
  expect(result.path).toMatch(/^M[\d.]+ 29 H[\d.]+ V97 H[\d.]+$/);
  expect(result.svgWidth).toBeCloseTo(result.width, 2);
  await page.evaluate(() => openGantt());
  await expect(page.locator('#gantt-notice')).toBeEmpty();
  await expect(page.locator('.gantt-label small').nth(1)).toContainText('9999-12-31');
  await page.locator('.gantt-label a').nth(1).click({ timeout: 3000 });
  expect(await page.evaluate(() => editor.selectionStart)).toBe(source.indexOf('- [x] Future'));
});

test('Gantt keeps daily detail and switches to grouped ticks at the range boundary', { tag: '@idx-gantt-range-growth' }, async ({ page }) => {
  for (const count of [60, 61, 180, 181, 365, 366, 1000]) {
    const end = new Date(Date.UTC(2026, 0, 1) + (count - 3) * 86400000).toISOString().slice(0, 10);
    await edit(page, `- [ ] Task start@2026-01-01 end@${end}`);
    const result = await page.evaluate(() => {
      paintGantt();
      return { ticks: document.querySelectorAll('.gantt-day').length,
        width: parseFloat(document.querySelector('.gantt-chart').style.width),
        bar: parseFloat(document.querySelector('.gantt-bar').style.width),
        left: parseFloat(document.querySelector('.gantt-bar').style.left) };
    });
    if (count <= 365) expect(result.ticks).toBe(count);
    else {
      expect(result.ticks).toBeGreaterThan(0);
      expect(result.ticks).toBeLessThanOrEqual(60);
    }
    expect(result.width).toBeLessThanOrEqual(4140);
    expect(result.left / result.width).toBeCloseTo(1 / count, 4);
    expect(result.bar / result.width).toBeCloseTo((count - 2) / count, 4);
  }
});

test('garden durations: zero, one minute, overnight and 23h59', async ({ page }) => {
  const result = await page.evaluate(() => ['06:00 - 06:00', '06:00 - 06:01', '23:50 - 00:10', '00:00 - 23:59']
    .map(time => gdScan('@2026-10-01\nudat sm ' + time)[0].mins));
  expect(result).toEqual([0, 1, 20, 1439]);
});

test('garden harvest converts decimal commas, grams and pieces and sums filtered rows', async ({ page }) => {
  await edit(page, '@2026-10-01\ncules din sm: 1,5 kg rosii, 250 g ardei, 2 buc dovlecel\n@2026-10-02\ncules din s1: 500 g rosii');
  const result = await page.evaluate(() => {
    Object.assign(gdState, { scope: 'note', tab: 'harvest', from: '', to: '2026-10-02', place: '', plant: '', q: '', group: 'none' });
    const all = structuredClone(gdCompute().totals);
    gdState.place = 'sm';
    const place = structuredClone(gdCompute().totals);
    gdState.plant = 'rosii';
    return { all, place, plant: gdCompute().totals };
  });
  expect(result.all).toMatchObject({ grams: 2250, pieces: 2, n: 4 });
  expect(result.place).toMatchObject({ grams: 1750, pieces: 2, n: 3 });
  expect(result.plant).toMatchObject({ grams: 1500, pieces: 0, n: 1 });
});

test('garden respects leap-day validity in its calendar markers', { tag: '@idx-garden-date-validation' }, async ({ page }) => {
  const cases = [
    ['2024-02-29', '2024-02-29'], ['2000-02-29', '2000-02-29'],
    ['2026-04-30', '2026-04-30'], ['2026-12-31', '2026-12-31'],
    ['29.02.2024', '2024-02-29'], ['29/2/2024', '2024-02-29'],
    ['1.3.2026', '2026-03-01'], ['1/03/2026', '2026-03-01'],
    ...['2026-02-29', '1900-02-29', '2026-04-31', '2026-13-01',
      '2026-00-01', '2026-01-00', '2026-01-32', '29.02.2026',
      '31/4/2026', '1.13.2026'].map(date => [date, null])
  ];
  const result = await page.evaluate(cases => cases.map(([date]) => ({
    calendar: ScuLaCal.findMarks('@' + date).map(hit => hit.mark.date),
    garden: gdScan('@' + date + '\nudat sm 10 l apa').map(r => r.date)
  })), cases);
  for (let i = 0; i < cases.length; i++) {
    const [date, expected] = cases[i];
    expect(result[i], date).toEqual({ calendar: expected ? [expected] : [], garden: [expected] });
  }
});

test('garden clears the inherited date after an invalid header and resumes at a valid one', { tag: '@idx-garden-date-validation' }, async ({ page }) => {
  const result = await page.evaluate(() => {
    Object.assign(gdState, { from: '2024-02-28', to: '2024-03-01' });
    return ['2026-02-29', '2026-04-31', '2026-13-01', '29.02.2026', '31/4/2026'].map(date => {
      const records = gdScan('@2024-02-28\nudat sm 1 l apa\n@' + date +
        '\nudat sm 10 l apa\ncules din sm: 2 kg rosii\ncosit 2 ture gg\n@1/3/2024\nudat sm 3 l apa');
      return { dates: records.map(r => r.date), inRange: records.filter(gdInRange).map(r => r.date) };
    });
  });
  for (const row of result) {
    expect(row.dates).toEqual(['2024-02-28', null, null, null, null, '2024-03-01']);
    expect(row.inRange).toEqual(['2024-02-28', '2024-03-01']);
  }
});

test('garden preserves inline clock intervals when reading shared calendar markers', { tag: '@idx-garden-date-validation' }, async ({ page }) => {
  const result = await page.evaluate(() => ['@2024-02-29', '(@29.2.2024', '[@29/02/2024']
    .map(marker => gdScan(marker + ' 06:02 - 06:30 udat sm 10 l apa')[0]));
  for (const record of result) {
    expect(record).toMatchObject({ date: '2024-02-29', from: '06:02', to: '06:30', mins: 28, litres: 10 });
  }
});

test('garden ignores examples inside fenced code', { tag: '@idx-garden-code-examples' }, async ({ page }) => {
  const records = await page.evaluate(() => gdScan('@2026-10-01\n```text\nudat sm 100 l apa\n```\nudat sm 5 l apa'));
  expect(records.reduce((n, r) => n + (r.litres || 0), 0)).toBe(5);
});

for (const [name, opening, inner, closing] of [
  ['longer backtick fence', '````markdown', '```', '````'],
  ['longer tilde fence', '~~~~text', '~~~', '~~~~'],
  ['different fence character', '```text', '~~~', '```'],
  ['closing fence with trailing text', '```text', '``` udat sm 100 l apa', '```'],
  ['longer closing fence', '~~~text', '', '~~~~~'],
  ['indented CRLF fence', '  ```text\r', '  ``\r', '  ``` \t\r'],
]) {
  test(`garden preserves real dates and rows across fenced examples: ${name}`, { tag: '@idx-garden-code-examples' }, async ({ page }) => {
    const records = await page.evaluate(({ opening, inner, closing }) => gdScan([
      '@2026-10-01', opening, inner, '@2026-10-02',
      'udat sm 100 l apa', 'cules din sm: 10 kg rosii', 'cosit 20 ture gg',
      '@2026-02-29', closing, 'udat sm 5 l apa', 'cules din sm: 250 g rosii', 'cosit 2 ture gg'
    ].join('\n')), { opening, inner, closing });
    expect(records).toHaveLength(4);
    expect(records.map(r => [r.kind, r.date, r.line])).toEqual([
      ['act', '2026-10-01', 9], ['act', '2026-10-01', 10],
      ['harvest', '2026-10-01', 10], ['act', '2026-10-01', 11]
    ]);
    expect(records[0].litres).toBe(5);
    expect(records[2].grams).toBe(250);
    expect(records[3].rounds).toBe(2);
  });
}

test('garden fenced dates do not establish a day and unclosed fences stay excluded', { tag: '@idx-garden-code-examples' }, async ({ page }) => {
  const records = await page.evaluate(() => gdScan([
    '```text', '@2026-10-02', 'udat sm 100 l apa', '```',
    'udat sm 5 l apa', '@2026-10-01', 'udat sm 3 l apa',
    '~~~', '@2026-10-03', 'cules din sm: 10 kg rosii', 'cosit 20 ture gg'
  ].join('\n')));
  expect(records.map(r => [r.date, r.litres, r.line])).toEqual([
    [null, 5, 4], ['2026-10-01', 3, 6]
  ]);
});

test('garden totals and CSV contain only real rows outside fenced examples', { tag: '@idx-garden-code-examples' }, async ({ page }) => {
  await edit(page, [
    '@2026-10-01', '```text', '@2026-10-02', 'udat sm 100 l apa',
    'cules din sm: 10 kg rosii', 'cosit 20 ture gg', '```',
    'udat sm 5 l apa', 'cules din sm: 250 g rosii', 'cosit 2 ture gg'
  ].join('\n'));
  const result = await page.evaluate(async () => {
    Object.assign(gdState, { scope: 'note', from: '', to: '', place: '', plant: '', cat: '', q: '', group: 'none' });
    const realSave = ScuLaFolder.save;
    let blob;
    ScuLaFolder.save = (name, data) => { blob = data; return Promise.resolve(); };
    try {
      const result = {};
      for (const tab of ['act', 'harvest', 'mow']) {
        gdState.tab = tab;
        gdRender();
        const totals = structuredClone(gdLast.totals);
        const dates = gdLast.rows.map(r => r.date);
        gdCsv();
        result[tab] = { totals, dates, csv: await blob.text() };
      }
      return result;
    } finally {
      ScuLaFolder.save = realSave;
    }
  });
  expect(result.act.totals).toMatchObject({ n: 3, litres: 5 });
  expect(result.harvest.totals).toMatchObject({ n: 1, grams: 250 });
  expect(result.mow.totals).toMatchObject({ n: 1, rounds: 2 });
  for (const [tab, rows] of [['act', 3], ['harvest', 1], ['mow', 1]]) {
    expect(result[tab].dates).toEqual(Array(rows).fill('2026-10-01'));
    const lines = result[tab].csv.split('\n');
    // CSV contains a header, data rows, a blank separator and a totals footer.
    expect(lines).toHaveLength(rows + 3);
    expect(lines[rows + 1]).toBe('');
    expect(result[tab].csv).toContain('01.10.2026');
    expect(result[tab].csv).not.toMatch(/02\.10\.2026|100 l apa|10 kg rosii|20 ture/);
  }
});

test('garden does not reinterpret a negative quantity as positive harvest', { tag: '@idx-garden-negative-values' }, async ({ page }) => {
  const items = await page.evaluate(() => gdParseHarvest('cules din sm: -2 kg rosii').items);
  expect(items).toEqual([{ plant: 'rosii', plantLabel: 'Roșii', grams: -2000, pieces: 0 }]);
});

test('garden preserves signs in harvest units, item orders and colonless entries', { tag: '@idx-garden-negative-values' }, async ({ page }) => {
  const cases = [
    ['cules din sm -12,5 kg rosii', 'rosii', -12500, 0],
    ['cules din sm: rosii -250 g', 'rosii', -250, 0],
    ['sm: -2 buc dovlecel', 'dovlecel', 0, -2],
    ['cules din sm: - 1.25 kg rosii', 'rosii', -1250, 0],
    ['cules din sm: −2 kg rosii', 'rosii', -2000, 0],
    ['cules din sm: +2 kg rosii', 'rosii', 2000, 0],
    ['cules din sm: + 2 buc dovlecel', 'dovlecel', 0, 2],
    ['cules din sm: 0 g rosii', 'rosii', 0, 0],
  ];
  const result = await page.evaluate(cases => cases.map(([line]) => gdParseHarvest(line)), cases);
  for (let i = 0; i < cases.length; i++) {
    const [line, plant, grams, pieces] = cases[i];
    expect(result[i].places, line).toEqual([{ key: 'sm', label: 'Solar mare' }]);
    expect(result[i].items, line).toHaveLength(1);
    expect(result[i].items[0], line).toMatchObject({ plant, grams, pieces });
  }
  const items = await page.evaluate(() => gdItems('-2 kg rosii, 250 g ardei; -3 buc dovlecel si +1,5 kg castraveti'));
  expect(items.map(item => [item.plant, item.grams, item.pieces])).toEqual([
    ['rosii', -2000, 0], ['ardei', 250, 0], ['dovlecel', 0, -3], ['castraveti', 1500, 0]
  ]);
});

test('garden preserves signs in water litres and both mowing count forms', { tag: '@idx-garden-negative-values' }, async ({ page }) => {
  const result = await page.evaluate(() => [
    'udat sm -12,5 l apa, 2 l de apa', 'udat sm - 2.5 litri apa',
    'udat sm −2 l apa', 'udat sm + 2 l apa',
    'cosit -12 ture gg', 'cosit - 2 gn', 'cosit −2 rounds gg', 'cosit + 2 gn'
  ].map(line => {
    const row = gdScan(line)[0];
    return [row.litres, row.rounds];
  }));
  expect(result).toEqual([[-10.5, 0], [-2.5, 0], [-2, 0], [2, 0], [0, -12], [0, -2], [0, -2], [0, 2]]);
});

test('garden keeps signed quantities in tables, grouped totals and CSV', { tag: '@idx-garden-negative-values' }, async ({ page }) => {
  await edit(page, [
    '@2026-10-01', 'cules din sm: -2 kg rosii, -3 buc dovlecel',
    'cules din sm 500 g rosii', 'udat sm -12,5 l apa, 2 l de apa', 'cosit -2 ture gg', 'cosit 1 gg'
  ].join('\n'));
  const result = await page.evaluate(async () => {
    Object.assign(gdState, { scope: 'note', from: '', to: '', place: '', plant: '', cat: '', q: '' });
    const realSave = ScuLaFolder.save;
    let blob;
    ScuLaFolder.save = (name, data) => { blob = data; return Promise.resolve(); };
    try {
      const result = {};
      for (const tab of ['act', 'harvest', 'mow']) {
        result[tab] = {};
        for (const group of ['none', 'day']) {
          Object.assign(gdState, { tab, group });
          gdRender();
          gdCsv();
          result[tab][group] = { totals: structuredClone(gdLast.totals),
            groups: structuredClone(gdLast.groups), table: document.getElementById('gd-table').textContent,
            csv: await blob.text() };
        }
      }
      return result;
    } finally {
      ScuLaFolder.save = realSave;
    }
  });
  for (const group of ['none', 'day']) {
    expect(result.act[group].totals).toMatchObject({ n: 5, litres: -10.5 });
    expect(result.harvest[group].totals).toMatchObject({ n: 3, grams: -1500, pieces: -3 });
    expect(result.mow[group].totals).toMatchObject({ n: 2, rounds: -1 });
  }
  expect(result.act.day.groups).toMatchObject([{ litres: -10.5 }]);
  expect(result.harvest.day.groups).toMatchObject([{ grams: -1500, pieces: -3 }]);
  expect(result.mow.day.groups).toMatchObject([{ rounds: -1 }]);
  expect(result.harvest.none.table).toContain('-2000 g');
  expect(result.harvest.day.table).toContain('-1500 g');
  expect(result.act.day.table).toContain('-10.5 l');
  expect(result.harvest.none.csv).toContain(';Roșii;-2;');
  expect(result.harvest.none.csv).toContain(';Dovlecel;-3;');
  expect(result.harvest.day.csv).toContain(';3;-1,5\n');
  expect(result.act.day.csv).toContain(';-10,5\n');
  expect(result.mow.none.csv).toContain(';GG;-2;');
  expect(result.mow.day.csv).toContain(';2;-1\n');
});

test('timeline valid dates stay ordered and duplicate dates share a position', async ({ page }) => {
  const v = await page.evaluate(() => ['2024-02-28', '2024-02-29', '2024-03-01', '01.03.2024'].map(tlDateValue));
  expect(v[0]).toBeLessThan(v[1]);
  expect(v[1]).toBeLessThan(v[2]);
  expect(v[2]).toBe(v[3]);
});

test('timeline rejects nonexistent dates instead of silently clamping them', async ({ page }) => {
  const values = await page.evaluate(() => ['2026-02-30', '2026-13-01', '2026-00-00'].map(tlDateValue));
  expect(values).toEqual([null, null, null]);
});

test('table dimension bounds clamp empty, negative and excessive inputs', async ({ page }) => {
  for (const [rows, cols, expectedRows, expectedCols] of [['', '', 1, 1], ['-1', '0', 1, 1], ['21', '11', 20, 10]]) {
    const result = await page.evaluate(({ rows, cols }) => {
      document.getElementById('tbl-rows').value = rows;
      document.getElementById('tbl-cols').value = cols;
      rebuildTableGrid();
      return { rows: document.querySelectorAll('#table-preview-grid tbody tr:not(.align-row)').length,
        cols: document.querySelectorAll('#table-preview-grid thead input').length };
    }, { rows, cols });
    expect(result).toEqual({ rows: expectedRows, cols: expectedCols });
  }
});
