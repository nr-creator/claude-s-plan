// Нотатки: усе без дати, конспекти занять і записи з текстом. Фільтр за предметом, закріплені зверху.
import * as store from '../store.js';
import { t, relTime } from '../i18n.js';
import { openKey } from '../cal.js';
import { esc, icon, cvar, shortDate } from '../ui.js';
import { plainText } from '../md.js';

export const isNote = e => !e.task && (!e.date || e.parent || (e.body && e.body.length > 0));

export function render(el, st) {
  const subjects = store.subjects();
  const filter = st.notesSubject || 'all';
  let list = store.entries().filter(isNote);
  if (filter === 'none') list = list.filter(e => !e.subject);
  else if (filter !== 'all') list = list.filter(e => e.subject === filter);
  const sort = st.notesSort || 'updated';
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (sort === 'title' ? (a.title || '').localeCompare(b.title || '') : (b.updatedAt || '').localeCompare(a.updatedAt || '')));
  const chips = [['all', t('notes.all')], ...subjects.map(s => [s.id, s.name, s.color]), ['none', t('notes.loose')]];
  let html = `<div class="notes">
    <div class="notes-bar">
      <div class="chips-scroll">${chips.map(([id, name, c]) => `<button class="chip ${filter === id ? 'on' : ''}" data-nfilter="${id}" ${c ? `style="--c:${cvar(c)}"` : ''}>${c ? '<i class="dot"></i>' : ''}${esc(name)}</button>`).join('')}</div>
      <button class="icon-btn" data-nsort aria-label="${t(sort === 'title' ? 'notes.sortUpdated' : 'notes.sortTitle')}" title="${t(sort === 'title' ? 'notes.sortTitle' : 'notes.sortUpdated')}">${icon('filter')}</button>
      <button class="btn primary" data-act="new-note">${icon('plus')}<span>${t('notes.new')}</span></button>
    </div>`;
  if (!list.length) html += `<p class="empty-t big">${t('notes.empty')}</p>`;
  html += '<div class="note-grid">';
  for (const e of list) {
    const s = store.subjectById(e.subject);
    const parent = e.parent ? store.entry(e.space, e.parent) : null;
    const snippet = plainText(e.body || '', true).slice(0, 220);
    const sp = store.space(e.space);
    html += `<article class="note-card" data-open="${esc(openKey(e))}" tabindex="0" ${s ? `style="--c:${cvar(s.color)}"` : ''}>
      <h4>${e.pinned ? icon('pin', 'pin') : ''}${esc(e.title || (parent ? parent.title : '') || t('entry.untitled'))}</h4>
      ${snippet ? `<p>${esc(snippet)}</p>` : ''}
      <footer>${s ? `<span class="subj-tag" style="--c:${cvar(s.color)}">${esc(s.name)}</span>` : ''}${e.occurrence ? `<span>${esc(shortDate(e.occurrence))}</span>` : ''}${sp && sp.kind === 'shared' ? `<span class="ic-meta">${icon('users')}</span>` : ''}<span class="grow"></span><span class="muted">${esc(relTime(e.updatedAt))}</span></footer>
    </article>`;
  }
  el.innerHTML = html + '</div></div>';
}
