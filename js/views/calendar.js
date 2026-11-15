// Календар: день, тиждень (на вузькому екрані — 3 дні), місяць.
import * as store from '../store.js';
import { t, fmtDate, monthName, fmtDow } from '../i18n.js';
import { todayYmd, addDays, addMonths, startOfWeek, startOfMonth, timeToMin, minToTime, nowMin, diffDays, isoDow } from '../util.js';
import { itemsIn, itemsOn, layoutDay, rowHtml, colorOf } from '../cal.js';
import { esc, icon, isNarrow, fmtRange, dayLabel, $, $$ } from '../ui.js';

const HH = 48; // висота години в пікселях

function range(view, cursor) {
  const ws = store.settings.weekStart;
  if (view === 'day') return [cursor, cursor];
  if (view === 'week') {
    if (isNarrow()) return [cursor, addDays(cursor, 2)];
    const s = startOfWeek(cursor, ws); return [s, addDays(s, 6)];
  }
  const s = startOfWeek(startOfMonth(cursor), ws); return [s, addDays(s, 41)];
}

export function title(view, cursor) {
  const [a, b] = range(view, cursor);
  if (view === 'month') return monthName(cursor);
  if (view === 'day') return dayLabel(cursor);
  if (a.slice(0, 7) === b.slice(0, 7)) return `${+a.slice(8)}–${+b.slice(8)} ${fmtDate(b, { month: 'long' })}`;
  return `${fmtDate(a, { day: 'numeric', month: 'short' })} – ${fmtDate(b, { day: 'numeric', month: 'short' })}`;
}

export function step(view, cursor, dir) {
  if (view === 'day') return addDays(cursor, dir);
  if (view === 'week') return addDays(cursor, dir * (isNarrow() ? 3 : 7));
  return addMonths(startOfMonth(cursor), dir);
}

export function render(el, st, ctx) {
  const view = st.calView, cursor = st.cursor;
  const [from, to] = range(view, cursor);
  const items = itemsIn(from, to);
  const bar = `<div class="cal-bar">
    <button class="btn" data-cal="today">${t('cal.today')}</button>
    <div class="seg-nav"><button class="icon-btn" data-cal="prev" aria-label="${t('cal.prev')}" title="←">${icon('left')}</button><button class="icon-btn" data-cal="next" aria-label="${t('cal.next')}" title="→">${icon('right')}</button></div>
    <h2 class="cal-title">${esc(title(view, cursor))}</h2>
    <div class="seg" role="tablist">${['day', 'week', 'month'].map(v => `<button role="tab" class="${v === view ? 'on' : ''}" data-view="${v}" title="${v[0].toUpperCase()}">${t('view.' + v)}</button>`).join('')}</div>
  </div>`;
  el.innerHTML = bar + (view === 'month' ? monthHtml(cursor, from, items, st) : gridHtml(from, to, items));
  if (view !== 'month') {
    const body = $('.tg-body', el);
    const target = st.scrollMin ?? (store.settings.startHour * 60);
    body.scrollTop = Math.max(0, (target / 60) * HH - 8);
    bindGrid(el, ctx);
  } else bindMonth(el, ctx, st);
}

function gridHtml(from, to, items) {
  const days = []; for (let d = from; d <= to; d = addDays(d, 1)) days.push(d);
  const today = todayYmd();
  let head = '<div class="tg-head"><div class="tg-gutter"></div>';
  let all = `<div class="tg-all"><div class="tg-gutter"><span>${t('cal.allday')}</span></div>`;
  let cols = '';
  for (const d of days) {
    const list = itemsOn(d, items);
    head += `<button class="tg-day ${d === today ? 'today' : ''} ${isoDow(d) >= 6 ? 'we' : ''}" data-goday="${d}"><span class="tg-dow">${esc(fmtDow(d))}</span><span class="tg-num">${+d.slice(8)}</span></button>`;
    const allDay = list.filter(it => !it.e.time);
    all += `<div class="tg-allcell" data-day="${d}">${allDay.map(it => `<div class="chip-ev ${it.done ? 'done' : ''} ${it.e.task ? 'task' : ''}" data-open="${esc(it.key)}" style="--c:${colorOf(it.e)}">${it.e.task ? `<span class="mini-check ${it.done ? 'on' : ''}" data-check="${esc(it.key)}"></span>` : ''}${esc(it.e.title || t('entry.untitled'))}</div>`).join('')}</div>`;
    const evs = layoutDay(list);
    let col = `<div class="tg-col ${d === today ? 'today' : ''} ${isoDow(d) >= 6 ? 'we' : ''}" data-day="${d}">`;
    for (const ev of evs) {
      const short = ev.e - ev.s < 45;
      col += `<div class="ev ${short ? 'short' : ''} ${ev.it.done ? 'done' : ''} ${ev.it.e.repeat ? 'rep' : ''}" data-open="${esc(ev.it.key)}" data-s="${ev.s}" data-e="${ev.e}"
        style="--c:${colorOf(ev.it.e)};top:${ev.s / 60 * HH}px;height:${Math.max(18, (ev.e - ev.s) / 60 * HH - 2)}px;left:calc(${ev.col} * 100% / ${ev.n});width:calc(100% / ${ev.n} - 3px)">
        <span class="ev-t">${esc(ev.it.e.title || t('entry.untitled'))}</span><span class="ev-m">${esc(fmtRange(ev.it.e.time, ev.it.e.end))}${ev.it.e.location ? ' · ' + esc(ev.it.e.location) : ''}</span>
        ${ev.it.note ? `<span class="ev-note">${icon('notes')}</span>` : ''}${ev.it.e.repeat ? '' : '<span class="ev-resize"></span>'}</div>`;
    }
    if (d === today) col += `<div class="now-line" style="top:${nowMin() / 60 * HH}px"></div>`;
    cols += col + '</div>';
  }
  let gut = '<div class="tg-hours">';
  for (let hr = 1; hr < 24; hr++) gut += `<span style="top:${hr * HH}px">${String(hr).padStart(2, '0')}:00</span>`;
  gut += '</div>';
  return `<div class="tg" style="--cols:${days.length};--hh:${HH}px">${head}</div>${all}</div><div class="tg-body"><div class="tg-grid">${gut}${cols}</div></div></div>`;
}

function snap(min, step = 15) { return Math.max(0, Math.min(24 * 60 - step, Math.round(min / step) * step)); }
function minAt(col, clientY) { const r = col.getBoundingClientRect(); return ((clientY - r.top) / HH) * 60; }

function bindGrid(el, ctx) {
  const grid = $('.tg-grid', el);
  grid.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    const evEl = e.target.closest('.ev');
    const col = e.target.closest('.tg-col');
    if (!col) return;
    if (evEl) return dragEvent(e, evEl, el, ctx);
    if (e.pointerType !== 'mouse') return; // на дотику: просто тап
    e.preventDefault();
    const s0 = snap(minAt(col, e.clientY), 15);
    let s1 = s0 + 60;
    const ghost = document.createElement('div'); ghost.className = 'ev ghost';
    const draw = () => { const a = Math.min(s0, s1), b = Math.max(s0, s1); ghost.style.cssText = `top:${a / 60 * HH}px;height:${(b - a) / 60 * HH}px;left:0;width:calc(100% - 3px)`; ghost.textContent = `${minToTime(a)}–${minToTime(b)}`; };
    let moved = false;
    draw(); col.appendChild(ghost);
    const mv = ev => { const m = snap(minAt(col, ev.clientY), 15); if (m !== s0) moved = true; s1 = m === s0 ? s0 + 15 : (m > s0 ? m + 15 : m); draw(); };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      const a = Math.min(s0, s1), b = Math.max(s0, s1);
      setTimeout(() => ghost.remove(), 0);
      ctx.newAt({ date: col.dataset.day, time: minToTime(a), end: minToTime(moved ? b : a + 60) });
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  grid.addEventListener('click', e => {
    if (e.target.closest('.ev')) return;
    const col = e.target.closest('.tg-col');
    if (!col || e.pointerType === 'mouse' || (e.detail === 0 && false)) return;
    if (matchMedia('(pointer: fine)').matches) return;
    const s = snap(minAt(col, e.clientY) - 30, 30);
    ctx.newAt({ date: col.dataset.day, time: minToTime(s), end: minToTime(s + 60) });
  });
}

function dragEvent(e, evEl, root, ctx) {
  const key = evEl.dataset.open;
  const [space, id] = key.split('|');
  const entry = store.entry(space, id);
  if (e.pointerType !== 'mouse' || !entry || entry.repeat) return; // відкриється по кліку
  e.preventDefault();
  const resize = e.target.classList.contains('ev-resize');
  const s0 = +evEl.dataset.s, e0 = +evEl.dataset.e, y0 = e.clientY;
  const col0 = evEl.closest('.tg-col');
  let moved = false, day = col0.dataset.day, ns = s0, ne = e0;
  const mv = ev => {
    const dy = ev.clientY - y0;
    if (!moved && Math.abs(dy) < 4 && Math.abs(ev.clientX - e.clientX) < 4) return;
    moved = true; evEl.classList.add('dragging');
    const dm = snap(dy / HH * 60, 15);
    if (resize) { ne = Math.max(s0 + 15, Math.min(24 * 60, e0 + dm)); }
    else {
      const dur = e0 - s0; ns = Math.max(0, Math.min(24 * 60 - dur, s0 + dm)); ne = ns + dur;
      const under = document.elementsFromPoint(ev.clientX, ev.clientY).find(x => x.classList && x.classList.contains('tg-col'));
      if (under && under !== evEl.parentElement) { under.appendChild(evEl); day = under.dataset.day; }
    }
    evEl.style.top = ns / 60 * HH + 'px'; evEl.style.height = Math.max(18, (ne - ns) / 60 * HH - 2) + 'px';
    evEl.style.left = '0'; evEl.style.width = 'calc(100% - 3px)';
    evEl.querySelector('.ev-m').textContent = `${minToTime(ns)}–${minToTime(ne)}`;
  };
  const up = async () => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
    if (!moved) return; // звичайний клік відкриє запис
    // Після перетягування браузер усе одно надішле click — гасимо його
    addEventListener('click', ev => { ev.stopPropagation(); ev.preventDefault(); }, { capture: true, once: true });
    const patch = { time: minToTime(ns), end: minToTime(ne) };
    if (day !== entry.date) {
      patch.date = day;
      if (entry.endDate) patch.endDate = addDays(entry.endDate, diffDays(entry.date, day));
    }
    ctx.keepScroll(); await store.updateEntry(space, id, patch);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}

function monthHtml(cursor, from, items, st) {
  const ws = store.settings.weekStart;
  const today = todayYmd();
  const narrow = isNarrow();
  const sel = st.selDay || (cursor.slice(0, 7) === today.slice(0, 7) ? today : startOfMonth(cursor));
  let html = '<div class="mg"><div class="mg-head">';
  for (let i = 0; i < 7; i++) html += `<span>${t('dow.short.' + (((ws - 1 + i) % 7) + 1))}</span>`;
  html += '</div><div class="mg-body">';
  let d = from;
  for (let w = 0; w < 6; w++) {
    html += '<div class="mg-w">';
    for (let i = 0; i < 7; i++) {
      const list = itemsOn(d, items);
      const out = d.slice(0, 7) !== cursor.slice(0, 7);
      const max = 3;
      html += `<div class="mg-d ${out ? 'out' : ''} ${d === today ? 'today' : ''} ${narrow && d === sel ? 'sel' : ''} ${isoDow(d) >= 6 ? 'we' : ''}" data-day="${d}">
        <button class="mg-n" data-goday="${d}">${+d.slice(8)}</button>`;
      if (narrow) html += `<div class="mg-dots">${list.slice(0, 4).map(it => `<i style="--c:${colorOf(it.e)}"></i>`).join('')}</div>`;
      else {
        html += list.slice(0, max).map(it => `<div class="chip-ev ${it.done ? 'done' : ''} ${it.e.time ? 'timed' : ''}" draggable="${!it.e.repeat}" data-open="${esc(it.key)}" style="--c:${colorOf(it.e)}">${it.e.time ? `<b>${it.e.time}</b> ` : ''}${esc(it.e.title || t('entry.untitled'))}</div>`).join('');
        if (list.length > max) html += `<button class="mg-more" data-goday="${d}">${t('cal.more', { n: list.length - max })}</button>`;
      }
      html += '</div>';
      d = addDays(d, 1);
    }
    html += '</div>';
  }
  html += '</div></div>';
  if (narrow) {
    const list = itemsOn(sel, itemsIn(sel, sel));
    html += `<section class="day mg-list" data-day="${sel}"><h3>${esc(dayLabel(sel))}</h3>${list.length ? list.map(it => rowHtml(it, { now: true })).join('') : `<p class="empty-t">${t('agenda.emptyDay')}</p>`}</section>`;
  }
  return html;
}

function bindMonth(el, ctx, st) {
  const body = $('.mg-body', el);
  body.addEventListener('click', e => {
    if (e.target.closest('[data-open],[data-goday]')) return;
    const cell = e.target.closest('.mg-d'); if (!cell) return;
    if (isNarrow()) { st.selDay = cell.dataset.day; ctx.rerender(); return; }
    ctx.newAt({ date: cell.dataset.day });
  });
  if (isNarrow()) {
    body.addEventListener('click', e => {
      const n = e.target.closest('[data-goday]'); if (!n) return;
      e.stopPropagation(); e.preventDefault(); st.selDay = n.dataset.goday; ctx.rerender();
    }, true);
  }
  let dragKey = null;
  body.addEventListener('dragstart', e => { const c = e.target.closest('.chip-ev'); if (!c) return; dragKey = c.dataset.open; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragKey); });
  body.addEventListener('dragover', e => { const c = e.target.closest('.mg-d'); if (c && dragKey) { e.preventDefault(); $$('.mg-d.drop', body).forEach(x => x.classList.remove('drop')); c.classList.add('drop'); } });
  body.addEventListener('drop', async e => {
    const c = e.target.closest('.mg-d'); if (!c || !dragKey) return;
    e.preventDefault();
    const [space, id] = dragKey.split('|'); dragKey = null;
    const en = store.entry(space, id); if (!en || en.date === c.dataset.day) return;
    const patch = { date: c.dataset.day };
    if (en.endDate) patch.endDate = addDays(en.endDate, diffDays(en.date, c.dataset.day));
    await store.updateEntry(space, id, patch);
  });
  body.addEventListener('dragend', () => { dragKey = null; $$('.mg-d.drop', body).forEach(x => x.classList.remove('drop')); });
}
