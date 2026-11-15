// Сторінка предмета: огляд, розклад занять, конспекти, завдання. Плюс форми створення предмета і заняття.
import * as store from '../store.js';
import { t, relTime, locale } from '../i18n.js';
import { itemsIn, rowHtml, openKey, toggleDone } from '../cal.js';
import { describeRepeat } from '../recur.js';
import { parseQuick } from '../parse.js';
import { todayYmd, addDays, isoDow, timeToMin, minToTime } from '../util.js';
import { esc, icon, h, $, $$, cvar, COLORS, modal, popover, menu, confirmBox, toast, spaceLabel, shortDate, dayLabel, pickDate } from '../ui.js';
import { isNote } from './notes.js';
import { plainText } from '../md.js';

export function render(el, st, ctx) {
  const s = store.subjectById(st.subjectId);
  if (!s) { el.innerHTML = `<p class="empty-t big">${t('subj.empty')}</p>`; return; }
  const tab = st.subjTab || 'overview';
  const all = store.entries().filter(e => e.subject === s.id);
  const series = all.filter(e => e.date && !e.task && !e.parent);
  const tasks = all.filter(e => e.task);
  const notes = all.filter(isNote);
  const today = todayYmd();
  const sp = store.space(s.space);
  const openTasks = tasks.filter(e => !e.done).sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const doneTasks = tasks.filter(e => e.done);

  let html = `<div class="subj" style="--c:${cvar(s.color)}">
    <header class="subj-h">
      <div class="subj-title"><i class="subj-sw"></i><h1>${esc(s.name)}</h1>${s.archived ? `<span class="badge">${t('subj.archived')}</span>` : ''}</div>
      <div class="subj-meta">
        ${s.teacher ? `<span>${icon('person')}${esc(s.teacher)}</span>` : ''}${s.room ? `<span>${icon('location')}${esc(s.room)}</span>` : ''}
        ${s.link ? `<a href="${esc(/^https?:/.test(s.link) ? s.link : 'https://' + s.link)}" target="_blank" rel="noopener">${icon('link')}${esc(s.link.replace(/^https?:\/\//, '').slice(0, 40))}</a>` : ''}
        <span>${icon(sp && sp.kind === 'shared' ? 'users' : 'lock')}${esc(spaceLabel(sp))}</span>
        ${tasks.length ? `<span>${icon('todo')}${t('subj.progress', { d: doneTasks.length, n: tasks.length })}</span>` : ''}
      </div>
      <div class="subj-actions">
        <button class="btn" data-sa="class">${icon('calendar')}${t('subj.addClass')}</button>
        <button class="btn" data-sa="note">${icon('notes')}${t('subj.addNote')}</button>
        <button class="btn" data-sa="task">${icon('todo')}${t('subj.addTask')}</button>
        <button class="icon-btn" data-sa="more" aria-label="${t('nav.more')}">${icon('more')}</button>
      </div>
      <div class="seg tabs">${['overview', 'classes', 'notes', 'tasks'].map(k => `<button class="${tab === k ? 'on' : ''}" data-stab="${k}">${t('subj.' + k)}${k === 'tasks' && openTasks.length ? ` <span class="count">${openTasks.length}</span>` : ''}${k === 'notes' && notes.length ? ` <span class="count">${notes.length}</span>` : ''}</button>`).join('')}</div>
    </header>`;

  const noteRow = e => `<div class="row" data-open="${esc(openKey(e))}" tabindex="0" style="--c:${cvar(s.color)}"><span class="row-bar"></span><span class="row-main"><span class="row-title">${esc(e.title || t('entry.untitled'))}</span><span class="row-meta">${e.occurrence ? `<span>${esc(shortDate(e.occurrence))}</span>` : ''}<span>${esc(plainText(e.body || '', true).slice(0, 90))}</span></span></span><span class="muted sm">${esc(relTime(e.updatedAt))}</span></div>`;
  const taskInput = `<form class="inline-add" data-taskform><input placeholder="${esc(t('subj.addTask'))} — ${esc(t('qa.placeholderShort').toLowerCase())}" aria-label="${esc(t('subj.addTask'))}"><button class="btn sm">${t('misc.add')}</button></form>`;

  if (tab === 'overview') {
    const up = itemsIn(today, addDays(today, 30), e => e.subject === s.id && !e.task).slice(0, 6);
    html += `<div class="subj-grid">
      <section class="card"><h3>${t('subj.upcoming')}</h3>${up.length ? up.map(it => rowHtml(it, { date: dayLabel(it.date, 'short') })).join('') : `<p class="empty-t">${t('subj.noClasses')}</p>`}</section>
      <section class="card"><h3>${t('subj.deadlines')}</h3>${openTasks.slice(0, 8).map(e => rowHtml({ e, key: openKey(e) }, { date: e.date ? dayLabel(e.date, 'short') : '' })).join('') || `<p class="empty-t">${t('subj.noTasks')}</p>`}${taskInput}</section>
      <section class="card wide"><h3>${t('subj.notes')}</h3>${notes.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6).map(noteRow).join('') || `<p class="empty-t">${t('subj.noNotes')}</p>`}</section>
    </div>`;
  } else if (tab === 'classes') {
    html += `<section class="card">${series.length ? series.sort((a, b) => (b.repeat ? 1 : 0) - (a.repeat ? 1 : 0) || (a.repeat && b.repeat ? (a.repeat.days || [0])[0] - (b.repeat.days || [0])[0] : 0) || a.date.localeCompare(b.date)).map(e => `<div class="row" data-open="${esc(openKey(e))}" tabindex="0"><span class="row-bar"></span><span class="row-time">${esc(e.time ? e.time + (e.end ? '–' + e.end : '') : t('entry.allDay'))}</span><span class="row-main"><span class="row-title">${esc(e.title || t('entry.untitled'))}</span><span class="row-meta"><span>${esc(e.repeat ? describeRepeat(e.repeat, t, locale()) : dayLabel(e.date, 'short'))}</span>${e.location ? `<span>${esc(e.location)}</span>` : ''}</span></span></div>`).join('') : `<p class="empty-t">${t('subj.noClasses')}</p>`}
      <button class="btn-text" data-sa="class">${icon('plus')}${t('subj.addClass')}</button></section>`;
  } else if (tab === 'notes') {
    html += `<section class="card">${notes.sort((a, b) => (b.occurrence || b.updatedAt || '').localeCompare(a.occurrence || a.updatedAt || '')).map(noteRow).join('') || `<p class="empty-t">${t('subj.noNotes')}</p>`}<button class="btn-text" data-sa="note">${icon('plus')}${t('subj.addNote')}</button></section>`;
  } else {
    html += `<section class="card">${taskInput}${openTasks.map(e => rowHtml({ e, key: openKey(e) }, { date: e.date ? dayLabel(e.date, 'short') : '' })).join('')}
      ${doneTasks.length ? `<details class="done-list"><summary>${t('entry.done')} · ${doneTasks.length}</summary>${doneTasks.map(e => rowHtml({ e, key: openKey(e), done: true })).join('')}</details>` : ''}</section>`;
  }
  el.innerHTML = html + '</div>';

  el.onclick = async ev => {
    const tb = ev.target.closest('[data-stab]'); if (tb) { st.subjTab = tb.dataset.stab; ctx.rerender(); return; }
    const a = ev.target.closest('[data-sa]'); if (!a) return;
    const k = a.dataset.sa;
    if (k === 'class') classForm(s, ctx);
    if (k === 'note') { const n = await store.createEntry({ title: '', subject: s.id }, s.space); ctx.open(openKey(n), { isNew: true, focus: 'title' }); }
    if (k === 'task') { st.subjTab = 'tasks'; ctx.rerender(); setTimeout(() => { const i = $('[data-taskform] input', el); i && i.focus(); }, 0); }
    if (k === 'more') menu(a, [
      { label: t('subj.edit'), icon: 'settings', act: () => subjectForm(s, ctx) },
      { label: s.archived ? t('subj.unarchive') : t('subj.archive'), icon: 'archive', act: () => store.updateSubject(s.space, s.id, { archived: !s.archived }) },
      '-',
      { label: t('subj.delete'), icon: 'trash', danger: true, act: async () => { if (await confirmBox(t('subj.deleteConfirm', { s: s.name }), t('misc.delete'), true)) { await store.deleteSubject(s.space, s.id); ctx.go('#/notes'); } } },
    ], { align: 'right' });
  };
  el.onsubmit = async ev => {
    const f = ev.target.closest('[data-taskform]'); if (!f) return;
    ev.preventDefault();
    const inp = $('input', f); const v = inp.value.trim(); if (!v) return;
    const p = parseQuick(v, { today: todayYmd(), subjects: [] , ignore: new Set(['subject', 'repeat']) });
    await store.createEntry({ title: p.title || v, task: true, date: p.date || null, time: p.time || null, subject: s.id }, s.space);
    inp.value = ''; setTimeout(() => { const i = $('[data-taskform] input', el); i && i.focus(); }, 0);
  };
}

// Список предметів: картки з наступним заняттям і кількістю відкритих завдань
export function renderList(el, st, ctx) {
  const subs = store.subjects({ withArchived: true });
  const today = todayYmd();
  const up = itemsIn(today, addDays(today, 14), e => !!e.subject && !e.task);
  const active = subs.filter(s => !s.archived), arch = subs.filter(s => s.archived);
  const card = s => {
    const next = up.find(it => it.e.subject === s.id);
    const open = store.entries().filter(e => e.subject === s.id && e.task && !e.done).length;
    const notes = store.entries().filter(e => e.subject === s.id && isNote(e)).length;
    return `<button class="subj-card" data-go="#/subject/${s.id}" style="--c:${cvar(s.color)}"><i class="subj-sw"></i><b>${esc(s.name)}</b>
      <span class="muted">${next ? esc(dayLabel(next.date, 'short') + (next.e.time ? ', ' + next.e.time : '')) : esc(t('subj.noClasses'))}</span>
      <span class="subj-stats">${open ? `<span>${icon('todo')}${open}</span>` : ''}<span>${icon('notes')}${notes}</span>${store.space(s.space) && store.space(s.space).kind === 'shared' ? `<span>${icon('users')}</span>` : ''}</span></button>`;
  };
  el.innerHTML = `<div class="subjects">
    <div class="notes-bar"><span class="grow"></span><button class="btn primary" data-newsubj>${icon('plus')}<span>${t('subj.new')}</span></button></div>
    ${active.length ? `<div class="subj-cards">${active.map(card).join('')}</div>` : `<p class="empty-t big">${t('subj.empty')}</p>`}
    ${arch.length ? `<details class="done-list"><summary>${t('subj.archived')} · ${arch.length}</summary><div class="subj-cards">${arch.map(card).join('')}</div></details>` : ''}
  </div>`;
  el.onclick = e => {
    if (e.target.closest('[data-newsubj]')) subjectForm(null, ctx);
    const g = e.target.closest('[data-go]'); if (g) ctx.go(g.dataset.go);
  };
}

// Форма предмета (створення і редагування)
export function subjectForm(s, ctx, onCreated) {
  const isNew = !s;
  s = s || { name: '', color: COLORS[store.subjects({ withArchived: true }).length % COLORS.length], space: store.personalSpace().id };
  const body = h(`<form class="form">
    <label>${t('subj.name')}<input name="name" required value="${esc(s.name)}" autofocus autocomplete="off"></label>
    <div class="field"><span>${t('subj.color')}</span><div class="swatches">${COLORS.map(c => `<button type="button" class="sw ${c === s.color ? 'on' : ''}" data-c="${c}" style="--c:${cvar(c)}" aria-label="${c}"></button>`).join('')}</div></div>
    <div class="form-2"><label>${t('subj.teacher')}<input name="teacher" value="${esc(s.teacher || '')}"></label><label>${t('subj.room')}<input name="room" value="${esc(s.room || '')}"></label></div>
    <label>${t('subj.link')}<input name="link" value="${esc(s.link || '')}" placeholder="moodle, classroom, zoom…"></label>
    ${isNew && store.spaces.length > 1 ? `<div class="field"><span>${t('subj.space')}</span><div class="seg">${store.spaces.map(x => `<button type="button" data-sp="${x.id}" class="${x.id === s.space ? 'on' : ''}">${icon(x.kind === 'shared' ? 'users' : 'lock')}${esc(spaceLabel(x))}</button>`).join('')}</div></div>` : ''}
    <div class="row-end"><button type="button" class="btn" data-cancel>${t('misc.cancel')}</button><button class="btn primary">${isNew ? t('subj.create') : t('misc.save')}</button></div>
  </form>`);
  let color = s.color, space = s.space;
  const m = modal(isNew ? t('subj.new') : s.name, body);
  body.addEventListener('click', ev => {
    const c = ev.target.closest('[data-c]'); if (c) { color = c.dataset.c; $$('.sw', body).forEach(x => x.classList.toggle('on', x === c)); }
    const p = ev.target.closest('[data-sp]'); if (p) { space = p.dataset.sp; $$('[data-sp]', body).forEach(x => x.classList.toggle('on', x === p)); }
    if (ev.target.closest('[data-cancel]')) m.close();
  });
  body.onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(body);
    const data = { name: f.get('name').trim(), color, teacher: f.get('teacher').trim() || null, room: f.get('room').trim() || null, link: f.get('link').trim() || null };
    if (!data.name) return;
    m.close();
    if (isNew) { const n = await store.createSubject(data, space); toast(t('subj.created', { s: n.name })); onCreated ? onCreated(n) : ctx.go('#/subject/' + n.id); }
    else await store.updateSubject(s.space, s.id, data);
  };
}

// Форма заняття: дні тижня, час, повтор, з якої дати і до якої
export function classForm(s, ctx) {
  const today = todayYmd();
  let days = new Set([isoDow(today) <= 5 ? isoDow(today) : 1]);
  let from = today, until = null;
  const body = h(`<form class="form">
    <label>${t('entry.title')}<input name="title" value="${esc(t('subj.classTitle'))}" autocomplete="off"></label>
    <div class="field"><span>${t('rep.days')}</span><div class="r-days">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button type="button" class="chip ${days.has(d) ? 'on' : ''}" data-d="${d}">${t('dow.short.' + d)}</button>`).join('')}</div></div>
    <div class="form-2"><label>${t('entry.time')}<input type="time" name="time" value="08:30" step="300" required></label><label>${t('entry.end')}<input type="time" name="end" value="09:50" step="300"></label></div>
    <div class="field"><span>${t('entry.repeat')}</span><div class="seg"><button type="button" class="on" data-iv="1">${t('rep.weekly')}</button><button type="button" data-iv="2">${t('rep.biweekly')}</button></div></div>
    <div class="form-2"><div class="field"><span>${t('entry.date')}</span><button type="button" class="chip" data-from>${shortDate(from)}</button></div><div class="field"><span>${t('rep.untilLabel')}</span><button type="button" class="chip" data-until>${t('misc.none')}</button></div></div>
    <label>${t('entry.location')}<input name="location" value="${esc(s.room || '')}"></label>
    <div class="row-end"><button type="button" class="btn" data-cancel>${t('misc.cancel')}</button><button class="btn primary">${t('subj.create')}</button></div>
  </form>`);
  let iv = 1;
  const m = modal(`${t('subj.addClass')} · ${s.name}`, body);
  body.addEventListener('click', ev => {
    const d = ev.target.closest('[data-d]'); if (d) { const n = +d.dataset.d; days.has(n) ? days.delete(n) : days.add(n); if (!days.size) days.add(n); d.classList.toggle('on', days.has(n)); }
    const i = ev.target.closest('[data-iv]'); if (i) { iv = +i.dataset.iv; $$('[data-iv]', body).forEach(x => x.classList.toggle('on', x === i)); }
    const f = ev.target.closest('[data-from]'); if (f) pickDate(f, from, x => { if (x) { from = x; f.textContent = shortDate(x); } });
    const u = ev.target.closest('[data-until]'); if (u) pickDate(u, until || addDays(from, 120), x => { until = x; u.textContent = x ? shortDate(x) : t('misc.none'); }, { allowNone: true });
    if (ev.target.closest('[data-cancel]')) m.close();
  });
  const tIn = $('[name=time]', body), eIn = $('[name=end]', body);
  tIn.addEventListener('change', () => { if (tIn.value) eIn.value = minToTime(Math.min(timeToMin(tIn.value) + 80, 23 * 60 + 55)); });
  body.onsubmit = async ev => {
    ev.preventDefault();
    const f = new FormData(body);
    const ds = [...days].sort();
    // Перше заняття — найближчий обраний день, не раніше дати початку
    let start = from; for (let k = 0; k < 7; k++) { if (ds.includes(isoDow(start))) break; start = addDays(start, 1); }
    const repeat = { freq: 'weekly', days: ds }; if (iv > 1) repeat.interval = iv; if (until) repeat.until = until;
    m.close();
    await store.createEntry({ title: f.get('title').trim() || t('subj.classTitle'), date: start, time: f.get('time') || null, end: f.get('end') && f.get('end') > f.get('time') ? f.get('end') : null, repeat, subject: s.id, location: f.get('location').trim() || null }, s.space);
    ctx.rerender();
  };
}
