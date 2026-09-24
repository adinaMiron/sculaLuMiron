/* Chapter Gantt. Read the editor directly so unsaved edits are represented. */
const GANTT_TASK = /^[ \t]*[-*+][ \t]+\[([ xX])\](?:[ \t]+|$)(.*)$/;
const GANTT_FLAG = /(^|[\s(\[{])([#$])(\d+)(?=$|[\s)\]},;.!?])/g;
const GANTT_DATE = /(^|[ \t(])(start|end)@[ \t]*((?:\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})(?:[ \t]+(?:[01]?\d|2[0-3]):[0-5]\d)?|(?:[01]?\d|2[0-3]):[0-5]\d)(?=$|[ \t),;.!?])/giu;
const GANTT_OWNER_WORD = "[\\p{L}\\p{N}][\\p{L}\\p{N}._'-]{0,20}";
const GANTT_OWNER_PREFIX = new RegExp('^(' + GANTT_OWNER_WORD + '(?:[ \\t]+' + GANTT_OWNER_WORD + '){0,3})[ \\t]?>>(?=[ \\t])', 'u');
const GANTT_OWNER_INLINE = new RegExp('>>(' + GANTT_OWNER_WORD + ')(?![\\p{L}\\p{N}._\'-])', 'gu');
const GANTT_PRIORITY = /(^|[\s(\[{])!(nice|important|vital)(?![\p{L}\p{N}_-])/u;
const GANTT_DAY_MS = 86400000;
const ganttEl = id => document.getElementById(id);
const ganttNode = (tag, cls, value) => { const el = document.createElement(tag); if (cls) el.className = cls; if (value != null) el.textContent = value; return el; };

function ganttDay(value) {
  if (!value) return null;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const local = value.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  const parts = iso ? [+iso[1], +iso[2], +iso[3]] : local ? [+local[3], +local[2], +local[1]] : null;
  if (!parts) return null;
  const day = Date.UTC(parts[0], parts[1]-1, parts[2]);
  const check = new Date(day);
  return check.getUTCFullYear() === parts[0] && check.getUTCMonth()+1 === parts[1] && check.getUTCDate() === parts[2] ? day : null;
}
function ganttFormat(day) {
  return new Date(day).toLocaleDateString(UI === 'ro' ? 'ro-RO' : 'en-US', { timeZone:'UTC', day:'numeric', month:'short', year:'numeric' });
}
function ganttParse(text) {
  const tasks = [], definitions = new Map(), problems = [];
  let fence = '';
  text.split('\n').forEach((line, lineIndex) => {
    const marker = line.match(/^[ \t]*(`{3,}|~{3,})/);
    if (marker) { if (!fence) fence = marker[1][0]; else if (marker[1][0] === fence) fence = ''; return; }
    if (fence) return;
    const match = line.match(GANTT_TASK);
    if (!match) return;
    let body = match[2].replace(/^~(?:inwork|onhold|blocked)(?:[ \t]+|$)/, '');
    const refs = [], deps = [], owners = [], dates = {};
    body = body.replace(GANTT_FLAG, (all, lead, kind, number) => { (kind === '#' ? refs : deps).push(number); return lead; });
    const leadOwner = body.match(GANTT_OWNER_PREFIX);
    if (leadOwner) { owners.push(leadOwner[1].replace(/[ \t]+/g, ' ')); body = body.slice(leadOwner[0].length).trimStart(); }
    body = body.replace(GANTT_OWNER_INLINE, (all, name) => { if (!owners.includes(name)) owners.push(name); return ' '; });
    const importance = (body.match(GANTT_PRIORITY) || [])[2] || '';
    body = body.replace(GANTT_PRIORITY, '$1');
    body = body.replace(GANTT_DATE, (all, lead, kind, value) => { dates[kind.toLowerCase()] = value; return lead; });
    if (window.ScuLaCal) {
      const marks = ScuLaCal.findMarks(body);
      for (const hit of marks) {
        const m = hit.mark, interval = m.endDate !== m.date || !!m.endTime;
        if (interval && !dates.start) dates.start = m.date + (m.allDay ? '' : ' ' + m.time);
        if (!dates.end && (interval || m.allDay)) dates.end = m.endDate || m.date;
        if (!interval && !m.allDay && !dates.start) dates.start = m.date + ' ' + m.time;
      }
      for (let i=marks.length-1; i>=0; i--) body = body.slice(0, marks[i].index) + body.slice(marks[i].index + marks[i].length);
    }
    const plain = [...body.matchAll(/(^|[ \t(])(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})(?=$|[ \t),;.!?])/g)];
    if (plain.length > 1 && !dates.start) dates.start = plain[0][2];
    if (plain.length && !dates.end) dates.end = plain[plain.length-1][2];
    body = body.replace(/(^|[ \t(])(\d{4}-\d{2}-\d{2}|\d{1,2}[./]\d{1,2}[./]\d{4})(?=$|[ \t),;.!?])/g, '$1');
    const title = body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, alias) => alias || target)
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_`]/g, '').replace(/\s+/g, ' ').trim() || line.trim();
    const task = { lineIndex, title, owners, importance, dates, refs:[...new Set(refs)], deps:[...new Set(deps)], done:match[1].toLowerCase()==='x' };
    tasks.push(task);
    for (const number of task.refs) {
      if (definitions.has(number)) problems.push(t('ganttDuplicate', number));
      else definitions.set(number, task);
    }
  });
  for (const task of tasks) for (const number of task.deps) if (!definitions.has(number)) problems.push(t('ganttMissing', number));
  return { tasks, definitions, problems:[...new Set(problems)] };
}
function ganttOpenLine(index) {
  closeGantt(); setView('source');
  const start = editor.value.split('\n').slice(0, index).reduce((n, line) => n + line.length + 1, 0);
  editor.focus(); editor.setSelectionRange(start, start + (editor.value.split('\n')[index] || '').length);
  editor.scrollTop = Math.max(0, editor.scrollHeight * start / Math.max(1, editor.value.length) - editor.clientHeight / 2);
}
function paintGantt() {
  const { tasks, definitions, problems } = ganttParse(editor.value);
  const labels = ganttEl('gantt-labels'), chart = ganttEl('gantt-chart');
  labels.replaceChildren(); chart.replaceChildren(); chart.style.width = '';
  ganttEl('gantt-notice').textContent = problems.join(' ');
  labels.append(ganttNode('div', 'gantt-label-head', t('ganttTasks') + ' (' + tasks.length + ')'));
  if (!tasks.length) { chart.append(ganttNode('div', 'gantt-empty', t('ganttEmpty'))); return; }
  const today = ganttDay(new Date().toISOString().slice(0,10));
  for (const task of tasks) {
    task.start = ganttDay(task.dates.start);
    task.end = ganttDay(task.dates.end);
    task.inferred = task.start == null && task.end == null;
    if (task.start == null) task.start = task.end == null ? today : task.end;
    if (task.end == null) task.end = task.start;
    if (task.end < task.start) task.end = task.start;
  }
  const min = Math.min(...tasks.map(x => x.start)) - GANTT_DAY_MS;
  const max = Math.max(...tasks.map(x => x.end)) + GANTT_DAY_MS;
  const count = Math.round((max-min)/GANTT_DAY_MS) + 1;
  const step = count <= 60 ? 38 : count <= 180 ? 23 : Math.max(7, Math.floor(3600/count));
  const width = count * step;
  chart.style.width = width + 'px';
  const days = ganttNode('div', 'gantt-days');
  days.style.width = width + 'px';
  for (let i=0; i<count; i++) {
    const day = min + i*GANTT_DAY_MS, cell = ganttNode('div', 'gantt-day', step >= 20 || i % Math.ceil(55/step) === 0 ? ganttFormat(day) : '');
    cell.style.width = step + 'px'; cell.title = ganttFormat(day); days.append(cell);
  }
  chart.append(days);
  const rows = [];
  for (const [index, task] of tasks.entries()) {
    const label = ganttNode('div', 'gantt-label');
    const link = ganttNode('a', '', task.title); link.href = '#'; link.title = task.title; link.addEventListener('click', e => { e.preventDefault(); ganttOpenLine(task.lineIndex); });
    label.append(link);
    const metadata = [task.owners.join(', '), task.importance && '!' + task.importance, task.dates.start && t('ganttStart') + ': ' + task.dates.start, task.dates.end && t('ganttEnd') + ': ' + task.dates.end, task.inferred && t('ganttNoDate'), task.deps.length && t('ganttDepends') + ': ' + task.deps.map(n => '#' + n).join(', ')].filter(Boolean).join(' · ');
    label.append(ganttNode('small', '', metadata)); label.title = metadata; labels.append(label);
    const row = ganttNode('div', 'gantt-row'); row.style.width = width + 'px'; row.style.backgroundSize = step + 'px 100%';
    const bar = ganttNode('div', 'gantt-bar' + (task.done ? ' done' : '') + (task.importance ? ' ' + task.importance : '') + (task.inferred ? ' inferred' : ''));
    const left = (task.start-min)/GANTT_DAY_MS*step, barWidth = ((task.end-task.start)/GANTT_DAY_MS+1)*step;
    bar.style.left = left + 'px'; bar.style.width = barWidth + 'px'; bar.title = task.title + '\n' + metadata;
    if (barWidth >= 70) bar.append(ganttNode('span', '', task.title));
    row.append(bar); chart.append(row); rows.push({ left, right:left+barWidth, y:44+index*68+29 });
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.classList.add('gantt-arrows'); svg.setAttribute('width', width); svg.setAttribute('height', tasks.length*68);
  const marker = document.createElementNS(svg.namespaceURI, 'marker'); marker.id = 'gantt-arrowhead'; marker.setAttribute('viewBox','0 0 8 8'); marker.setAttribute('refX','7'); marker.setAttribute('refY','4'); marker.setAttribute('markerWidth','8'); marker.setAttribute('markerHeight','8'); marker.setAttribute('orient','auto');
  const tip = document.createElementNS(svg.namespaceURI, 'path'); tip.setAttribute('d','M0 0 L8 4 L0 8 Z'); tip.setAttribute('fill','var(--accent-2)'); marker.append(tip);
  const defs = document.createElementNS(svg.namespaceURI, 'defs'); defs.append(marker); svg.append(defs);
  tasks.forEach((task, index) => task.deps.forEach(number => {
    const source = definitions.get(number), from = tasks.indexOf(source);
    if (from < 0 || from === index) return;
    const a = rows[from], b = rows[index], sx = a.right, ex = b.left, sy = a.y-44, ey = b.y-44;
    const path = document.createElementNS(svg.namespaceURI, 'path');
    const bend = ex > sx+20 ? sx + Math.max(12, (ex-sx)/2) : sx+14;
    path.setAttribute('d', `M${sx} ${sy} H${bend} V${ey} H${ex}`);
    path.setAttribute('fill','none'); path.setAttribute('stroke','var(--accent-2)'); path.setAttribute('stroke-width','2'); path.setAttribute('marker-end','url(#gantt-arrowhead)');
    svg.append(path);
  }));
  chart.append(svg);
}
function openGantt() { paintGantt(); ganttEl('gantt-modal').classList.add('open'); ganttEl('gantt-close').focus(); }
function closeGantt() { ganttEl('gantt-modal').classList.remove('open'); }
ganttEl('gantt-modal').addEventListener('click', e => { if (e.target === e.currentTarget) closeGantt(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && ganttEl('gantt-modal').classList.contains('open')) closeGantt(); });
window.addEventListener('scula-ui-lang', () => { if (ganttEl('gantt-modal').classList.contains('open')) paintGantt(); });
