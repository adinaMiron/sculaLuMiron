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

test('Gantt excludes tasks inside a longer enclosing code fence', async ({ page }) => {
  const titles = await page.evaluate(() => ganttParse('````markdown\n```\n- [ ] Example, not a task\n```\n````\n- [ ] Real task').tasks.map(t => t.title));
  expect(titles).toEqual(['Real task']);
});

test('Gantt large ranges use bounded ticks instead of one element per day', async ({ page }) => {
  await edit(page, '- [ ] History start@1900-01-01 end@2100-01-01');
  const result = await page.evaluate(() => {
    const start = performance.now();
    paintGantt();
    return { ticks: document.querySelectorAll('.gantt-day').length,
      width: document.querySelector('.gantt-chart').style.width, ms: performance.now() - start };
  });
  expect(result.ticks, JSON.stringify(result)).toBeLessThanOrEqual(1000);
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

test('garden respects leap-day validity in its calendar markers', async ({ page }) => {
  const result = await page.evaluate(() => ['2024-02-29', '2026-02-29', '2026-04-31', '2026-13-01']
    .map(date => ({ date, calendar: ScuLaCal.findMarks('@' + date).length,
      garden: gdScan('@' + date + '\nudat sm 10 l apa').map(r => r.date) })));
  expect(result[0]).toMatchObject({ calendar: 1, garden: ['2024-02-29'] });
  for (const row of result.slice(1)) {
    expect(row.calendar).toBe(0);
    expect(row.garden, JSON.stringify(row)).not.toContain(row.date);
  }
});

test('garden ignores examples inside fenced code', async ({ page }) => {
  const records = await page.evaluate(() => gdScan('@2026-10-01\n```text\nudat sm 100 l apa\n```\nudat sm 5 l apa'));
  expect(records.reduce((n, r) => n + (r.litres || 0), 0)).toBe(5);
});

test('garden does not reinterpret a negative quantity as positive harvest', async ({ page }) => {
  const items = await page.evaluate(() => gdParseHarvest('cules din sm: -2 kg rosii').items);
  expect(items.reduce((n, item) => n + item.grams, 0)).toBeLessThanOrEqual(0);
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
