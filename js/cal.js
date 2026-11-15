// Вибірки для календаря: входження подій у діапазоні дат, розкладка подій у сітці часу, рядок списку.
import * as store from './store.js';
import { occurrences } from './recur.js';
import { diffDays, addDays, timeToMin, todayYmd, nowMin } from './util.js';
import { t } from './i18n.js';
import { esc, icon, cvar, fmtRange, spaceLabel } from './ui.js';

export const openKey = (e, occ) => `${e.space}|${e.id}${occ ? '|' + occ : ''}`;

// Конспекти занять: дочірні записи з parent+occurrence
export function childNotes() {
  const m = new Map();
  for (const e of store.entries()) if (e.parent && e.occurrence) m.set(e.parent + '|' + e.occurrence, e);
  return m;
}

export function itemsIn(from, to, filter) {
  const kids = childNotes();
  const out = [];
  for (const e of store.entries()) {
    if (!e.date || e.parent) continue;
    if (filter && !filter(e)) continue;
    for (const d of occurrences(e, from, to)) {
      const span = e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;
      const done = e.task && (e.repeat ? (e.doneDates || []).includes(d) : !!e.done);
      out.push({ e, date: d, endDate: span ? addDays(d, span) : d, done, note: kids.get(e.id + '|' + d), key: openKey(e, e.repeat ? d : null) });
    }
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || (a.e.time ? 1 : 0) - (b.e.time ? 1 : 0) || (a.e.time || '').localeCompare(b.e.time || '') || (a.e.title || '').localeCompare(b.e.title || ''));
  return out;
}
export const itemsOn = (d, items) => items.filter(it => it.date <= d && it.endDate >= d);

// Розкладка подій дня в колонки, щоб ті, що перетинаються в часі, стояли поруч
export function layoutDay(items) {
  const evs = items.filter(it => it.e.time).map(it => {
    const s = timeToMin(it.e.time); let en = it.e.end ? timeToMin(it.e.end) : s + 60;
    if (en <= s) en = s + 30;
    return { it, s, e: Math.min(en, 24 * 60) };
  }).sort((a, b) => a.s - b.s || b.e - a.e);
  let cluster = [], colsEnd = [], maxEnd = -1;
  const flush = () => { const n = colsEnd.length; cluster.forEach(x => (x.n = n)); cluster = []; colsEnd = []; };
  for (const ev of evs) {
    if (ev.s >= maxEnd && cluster.length) flush();
    let c = colsEnd.findIndex(end => end <= ev.s);
    if (c < 0) { c = colsEnd.length; colsEnd.push(ev.e); } else colsEnd[c] = ev.e;
    ev.col = c; cluster.push(ev); maxEnd = Math.max(maxEnd, ev.e);
  }
  flush();
  return evs;
}

export function subjectOf(e) { return store.subjectById(e.subject); }
export function colorOf(e) { const s = subjectOf(e); return s ? cvar(s.color) : 'var(--accent)'; }

// Рядок у списках (агенда, предмет, пошук)
export function rowHtml(it, opts = {}) {
  const e = it.e || it;
  const s = subjectOf(e);
  const sp = store.space(e.space);
  const shared = sp && sp.kind === 'shared';
  const time = e.time ? fmtRange(e.time, e.end) : (opts.showAllDay && e.date ? t('entry.allDay') : '');
  const now = opts.now && e.time && it.date === todayYmd() && timeToMin(e.time) <= nowMin() && (timeToMin(e.end) || timeToMin(e.time) + 60) > nowMin();
  return `<div class="row ${it.done ? 'done' : ''} ${now ? 'now' : ''}" data-open="${esc(it.key || openKey(e))}" tabindex="0" style="--c:${colorOf(e)}">
    ${e.task ? `<button class="check ${it.done ? 'on' : ''}" data-check="${esc(it.key || openKey(e))}" aria-label="${t('entry.done')}">${icon('check')}</button>` : '<span class="row-bar"></span>'}
    ${time ? `<span class="row-time">${esc(time)}</span>` : ''}
    <span class="row-main"><span class="row-title">${esc(e.title || t('entry.untitled'))}</span>
    ${(s || e.location || opts.date || it.note) ? `<span class="row-meta">${opts.date ? `<span>${esc(opts.date)}</span>` : ''}${s ? `<span class="subj-tag" style="--c:${cvar(s.color)}">${esc(s.name)}</span>` : ''}${e.location ? `<span>${esc(e.location)}</span>` : ''}${it.note ? `<span class="has-note">${icon('notes')}${t('entry.classNote')}</span>` : ''}</span>` : ''}
    </span>
    ${shared ? `<span class="row-space" title="${esc(spaceLabel(sp))}">${icon('users')}</span>` : ''}
    ${e.repeat ? `<span class="row-rep" title="${t('entry.repeat')}">${icon('repeat')}</span>` : ''}
  </div>`;
}

// Позначити задачу виконаною (для повторюваних — лише конкретну дату)
export async function toggleDone(key) {
  const [space, id, occ] = key.split('|');
  const e = store.entry(space, id); if (!e) return;
  if (e.repeat && occ) {
    const set = new Set(e.doneDates || []); set.has(occ) ? set.delete(occ) : set.add(occ);
    await store.updateEntry(space, id, { doneDates: [...set].sort() });
  } else await store.updateEntry(space, id, { done: !e.done });
}
