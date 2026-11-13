/* A chart drawn from a table — docs/FEATURES.md § W.

   A table whose first column holds dates and whose other columns hold
   numbers is drawn as a line chart right above the table. Nothing new to
   write: the table is the data, so it still reads, edits and copies into a
   spreadsheet the way any table does.

     | Data       | Greutate (kg) | Notă        |
     |------------|---------------|-------------|
     | 2026-11-08 | 91.5          | după Paște  |

   A date may carry a time and the calendar's "@" (§ L) — "@2026-11-13 10:28"
   — so readings taken several times a day are spaced by the hour.

   Each number column is a line; every other column is a note shown with the
   point. Rows may be in any order — the chart sorts them by date. Loaded
   right after markdown.js, whose tlDateValue/tlPlain it reuses. */

// Whole dates and months only. A bare year or a plain number in the first
// column is more often a quantity than a date, so it never makes a chart.
// An "@" before it and a time after it ("@2026-11-13 10:28", the end of an
// interval ignored) are allowed, so a calendar-flagged row draws too.
const CH_DATE_RE = /^@?(\d{4}-\d{1,2}(?:-\d{1,2})?|\d{1,2}[./]\d{1,2}[./]\d{4}|\d{1,2}[./]\d{4})(?:[ T]+([01]?\d|2[0-3]):([0-5]\d)(?:\s*-\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)?$/;
// One day in the years of tlDateValue, whose months are 31 days each.
const CH_DAY = 1 / 372;
// A number, with an optional short unit after it: "91.5", "89,7 kg", "12 %".
const CH_NUM_RE = /^([-+]?\d+(?:[.,]\d+)?)(?:\s*[^\d\s]{1,4})?$/;
const CH_SERIES_MAX = 5;                  // one colour each, ch-s0 … ch-s4
const CH_H = 200, CH_TOP = 16, CH_BOTTOM = 172;   // px
const CH_X0 = 1.5, CH_X1 = 98.5;                  // %

// The text is escaped already (parseMarkdown escapes & < > first); inside an
// attribute a quote has to be escaped as well.
const chAttr = s => String(s).replace(/"/g, '&quot;');

function chNumber(cell) {
  const m = cell.match(CH_NUM_RE);
  return m ? parseFloat(m[1].replace(',', '.')) : null;
}

// Where the cell sits in time, or null: tlDateValue's place for the day, plus
// the time of day as a fraction of it.
function chDateValue(raw) {
  const m = raw.match(CH_DATE_RE);
  const v = m ? tlDateValue(m[1]) : null;
  if (v === null) return null;
  return m[2] ? v + (+m[2] * 60 + +m[3]) / 1440 * CH_DAY : v;
}

// The table, read as a chart, or null when it isn't one.
function chModel(headers, rows) {
  if (headers.length < 2 || rows.length < 2) return null;
  const points = [];
  for (const cells of rows) {
    const raw = (cells[0] || '').trim();
    const v = chDateValue(raw);
    if (v === null) return null;
    points.push({ raw: raw.replace(/^@/, ''), v, cells: cells.map(c => (c || '').trim()) });
  }
  const series = [], notes = [];
  for (let c = 1; c < headers.length; c++) {
    const filled = points.map(p => p.cells[c] || '').filter(Boolean);
    if (filled.length >= 2 && filled.every(s => chNumber(s) !== null)) series.push(c);
    else notes.push(c);
  }
  if (!series.length) return null;
  points.sort((a, b) => a.v - b.v);       // stable, so same-day rows keep their order
  return {
    points,
    series: series.slice(0, CH_SERIES_MAX).map(c => ({ col: c, name: tlPlain(headers[c]) || String(c) })),
    notes: notes.map(c => ({ col: c, name: tlPlain(headers[c]) }))
  };
}

// Round steps for the value axis: 1, 2 or 5 times a power of ten.
function chValueTicks(lo, hi) {
  if (lo === hi) { lo -= 1; hi += 1; }
  const raw = (hi - lo) / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 5, 10].map(k => k * mag).find(s => s >= raw - 1e-12);
  const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step;
  const dec = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  const ticks = [];
  for (let k = 0; a + k * step <= b + step / 2; k++) ticks.push((a + k * step).toFixed(dec));
  return { a, b, ticks };
}

// Labels along the time axis: years for a long stretch, months for a shorter
// one, then days, then hours, and just the two ends when the points are
// minutes apart. Values are in the years of tlDateValue, where a month starts
// exactly at (m - 1) / 12 and a day lasts CH_DAY.
function chTimeTicks(lo, hi) {
  const span = hi - lo, out = [];
  const locale = UI === 'en' ? 'en-GB' : 'ro-RO';
  if (span >= 2) {
    const step = Math.ceil(span / 6);
    for (let y = Math.ceil(lo - 1e-9); y <= hi + 1e-9; y += step) out.push({ v: y, label: String(y) });
  } else if (span >= 2 / 12) {
    const step = [1, 2, 3, 6].find(s => span * 12 / s <= 6) || 12;
    let first = true;
    for (let m = Math.ceil(lo * 12 - 1e-9); m <= hi * 12 + 1e-9; m += step) {
      const y = Math.floor(m / 12), mo = m - y * 12;
      const name = new Date(y, mo, 1).toLocaleDateString(locale, { month: 'short' }).replace('.', '');
      out.push({ v: m / 12, label: first || mo === 0 ? name + ' ' + y : name });
      first = false;
    }
  } else if (span > 0) {
    // Counted in minutes of tlDateValue's calendar, so a tick lands on a
    // whole day or hour; the 31st of a shorter month is skipped.
    const at = v => v / CH_DAY * 1440;
    const minutes = at(hi) - at(lo);
    const step = [10, 15, 30, 60, 120, 180, 360, 720, 1440, 2880, 10080, 20160]
      .find(s => minutes / s <= 5);         // fewer than months: the first label is longer
    if (minutes < 30 || !step) return out;
    let first = true;
    for (let k = Math.ceil(at(lo) / step - 1e-9); k * step <= at(hi) + 1e-6; k++) {
      const m = k * step, days = Math.floor(m / 1440), min = m - days * 1440;
      const y = Math.floor(days / 372), mo = Math.floor((days % 372) / 31), d = days % 31 + 1;
      const date = new Date(y, mo, d);
      if (date.getMonth() !== mo) continue;
      const day = date.toLocaleDateString(locale, { day: 'numeric', month: 'short' }).replace('.', '');
      const hm = String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
      out.push({ v: m / 1440 * CH_DAY, label: step >= 1440 ? day : first || min === 0 ? day + ' ' + hm : hm });
      first = false;
    }
  }
  return out;
}

/* The block: a legend, then the drawing. Like the timeline (§ R), every x is
   a percentage and every y a pixel, so the drawing stretches with the pane
   while its type and dots keep their size. A line can't take a percentage
   in a <polyline>, so each stretch between two points is its own <line>.
   The points are buttons over the drawing: each carries its own tooltip,
   which shows on hover and focus even in the exported page, with no script. */
function chTableHtml(headers, rows, opts) {
  const model = chModel(headers, rows);
  if (!model) return '';
  const { points, series, notes } = model;
  const r2 = n => Math.round(n * 100) / 100;
  const lo = points[0].v, hi = points[points.length - 1].v, span = hi - lo;
  const xOf = v => span > 0 ? CH_X0 + ((v - lo) / span) * (CH_X1 - CH_X0) : 50;

  const nums = [];
  points.forEach(p => series.forEach(s => {
    const n = p.cells[s.col] ? chNumber(p.cells[s.col]) : null;
    p['n' + s.col] = n;
    if (n !== null) nums.push(n);
  }));
  const vt = chValueTicks(Math.min.apply(null, nums), Math.max.apply(null, nums));
  const yOf = n => CH_BOTTOM - ((n - vt.a) / (vt.b - vt.a)) * (CH_BOTTOM - CH_TOP);

  const svg = [];
  vt.ticks.forEach(label => {
    const y = r2(yOf(+label));
    svg.push(`<line class="ch-grid" x1="0" y1="${y}" x2="100%" y2="${y}"/>`
      + `<text class="ch-ylab" x="0" y="${y - 4}">${label}</text>`);
  });
  let ticks = chTimeTicks(lo, hi).map(k => ({ x: xOf(k.v), label: k.label }));
  if (!ticks.length) ticks = span > 0
    ? [{ x: CH_X0, label: points[0].raw }, { x: CH_X1, label: points[points.length - 1].raw }]
    : [{ x: 50, label: points[0].raw }];
  ticks.forEach(k => {
    const anchor = k.x < 6 ? 'start' : k.x > 94 ? 'end' : 'middle';
    svg.push(`<line class="ch-xtick" x1="${r2(k.x)}%" y1="${CH_BOTTOM}" x2="${r2(k.x)}%" y2="${CH_BOTTOM + 5}"/>`
      + `<text class="ch-xlab" x="${r2(k.x)}%" y="${CH_H - 8}" text-anchor="${anchor}">${k.label}</text>`);
  });

  const dots = [];
  let lastS0 = 0;               // the newest point of the first line is the one Tab reaches
  series.forEach((s, si) => {
    let prev = null;
    points.forEach(p => {
      const n = p['n' + s.col];
      if (n === null) return;              // an empty cell: the line goes on to the next point
      const x = r2(xOf(p.v)), y = r2(yOf(n));
      if (prev) svg.push(`<line class="ch-line ch-s${si}" x1="${prev.x}%" y1="${prev.y}" x2="${x}%" y2="${y}"/>`);
      prev = { x, y };
      const values = series.filter(o => p['n' + o.col] !== null)
        .map(o => `<span class="ch-tip-row"><i class="ch-swatch ch-s${series.indexOf(o)}"></i>${o.name}: <strong>${p.cells[o.col]}</strong></span>`);
      const said = notes.map(o => tlPlain(p.cells[o.col] || '')).filter(Boolean)
        .map(text => `<span class="ch-tip-note">${text}</span>`);
      // The tooltip leans away from the edge it would run off.
      const side = x < 22 ? ' ch-tip-l' : x > 78 ? ' ch-tip-r' : '';
      const below = y < 70 ? ' ch-tip-b' : '';
      // A row with a note is a blue dot: something happened there.
      const noted = said.length ? ' ch-noted' : '';
      if (si === 0) lastS0 = dots.length;
      dots.push(`<button type="button" class="ch-dot ch-s${si}${noted}" data-s="${si}" tabindex="-1"`
        + ` style="left:${x}%;top:${y}px" data-x="${x}" data-y="${y}"`
        + ` aria-label="${chAttr(p.raw + ' — ' + s.name + ': ' + p.cells[s.col])}">`
        + `<span class="ch-tip${side}${below}"><b class="ch-tip-date">${p.raw}</b>${values.join('')}${said.join('')}</span></button>`);
    });
  });

  dots[lastS0] = dots[lastS0].replace('tabindex="-1"', 'tabindex="0"');

  // The legend says what each line is, and where it stands now.
  const legend = series.map((s, si) => {
    const have = points.filter(p => p['n' + s.col] !== null);
    let min = have[0], max = have[0];
    have.forEach(p => {
      if (p['n' + s.col] < min['n' + s.col]) min = p;
      if (p['n' + s.col] > max['n' + s.col]) max = p;
    });
    const last = have[have.length - 1];
    return `<span class="ch-key"><i class="ch-swatch ch-s${si}"></i><b>${s.name}</b>`
      + `<span class="ch-stat">${t('chartLast')} ${last.cells[s.col]} · ${t('chartMin')} ${min.cells[s.col]}`
      + ` · ${t('chartMax')} ${max.cells[s.col]}</span></span>`;
  }).join('');
  // …and that a blue dot is a row with a note.
  const noteCols = notes.filter(o => points.some(p => tlPlain(p.cells[o.col] || '')));
  const notedKey = noteCols.length ? `<span class="ch-key"><i class="ch-swatch ch-noted"></i>`
    + `<b>${noteCols.map(o => o.name).filter(Boolean).join(', ') || '…'}</b></span>` : '';

  const aria = t('chartAria') + ': ' + series.map(s => s.name).join(', ')
    + ', ' + points[0].raw + (span > 0 ? ' – ' + points[points.length - 1].raw : '');
  return `<figure class="md-chart" role="group" aria-label="${chAttr(aria)}">`
    + `<figcaption class="ch-legend">${legend}${notedKey}</figcaption>`
    + `<div class="ch-plot" style="height:${CH_H}px">`
    + `<svg class="ch-svg" height="${CH_H}" aria-hidden="true">${svg.join('')}</svg>`
    + `<span class="ch-guide" aria-hidden="true"></span>`
    + dots.join('') + `</div></figure>`;
}

/* In the preview, the point under the pointer is the nearest one along the
   time axis, so a finger on a crowded chart still lands on a point without
   aiming for its dot. Delegated, because the preview is rebuilt on every
   keystroke. The arrows walk the points from the keyboard. */
function chShow(plot, dot) {
  plot.querySelectorAll('.ch-dot.ch-on').forEach(d => { if (d !== dot) d.classList.remove('ch-on'); });
  const guide = plot.querySelector('.ch-guide');
  if (!dot) { guide.classList.remove('ch-on'); return; }
  dot.classList.add('ch-on');
  guide.style.left = dot.dataset.x + '%';
  guide.classList.add('ch-on');
}

function chNearest(plot, e) {
  const box = plot.getBoundingClientRect();
  const px = (e.clientX - box.left) / box.width * 100, py = e.clientY - box.top;
  let best = null, bestDx = Infinity, bestDy = Infinity;
  plot.querySelectorAll('.ch-dot').forEach(d => {
    const dx = Math.abs(+d.dataset.x - px), dy = Math.abs(+d.dataset.y - py);
    if (dx < bestDx - 0.01 || (Math.abs(dx - bestDx) <= 0.01 && dy < bestDy)) { best = d; bestDx = dx; bestDy = dy; }
  });
  return best;
}

['pointermove', 'pointerdown'].forEach(type => preview.addEventListener(type, e => {
  const plot = e.target.closest && e.target.closest('.ch-plot');
  if (plot) chShow(plot, chNearest(plot, e));
}));
preview.addEventListener('pointerout', e => {
  const plot = e.target.closest && e.target.closest('.ch-plot');
  if (plot && !plot.contains(e.relatedTarget) && e.pointerType === 'mouse') chShow(plot, null);
});
preview.addEventListener('keydown', e => {
  const dot = e.target.closest && e.target.closest('.ch-dot');
  if (!dot || !['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape'].includes(e.key)) return;
  const plot = dot.closest('.ch-plot');
  if (e.key === 'Escape') { chShow(plot, null); return; }
  const same = Array.from(plot.querySelectorAll('.ch-dot')).filter(d => d.dataset.s === dot.dataset.s);
  const at = same.indexOf(dot);
  const next = same[e.key === 'Home' ? 0 : e.key === 'End' ? same.length - 1
    : Math.max(0, Math.min(same.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))];
  e.preventDefault();
  if (!next) return;
  dot.tabIndex = -1; next.tabIndex = 0;
  next.focus();
  chShow(plot, next);
});
preview.addEventListener('focusin', e => {
  const dot = e.target.closest && e.target.closest('.ch-dot');
  if (dot) chShow(dot.closest('.ch-plot'), dot);
});
