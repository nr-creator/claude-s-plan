// Нотатки: папки (вкладені), хештеги, предмети як фільтри; сітка або список; перетягування в папки.
import * as store from '../store.js';
import { t, relTime } from '../i18n.js';
import { openKey } from '../cal.js';
import { esc, icon, h, $, $$, cvar, shortDate, isNarrow, popover, menu, confirmBox, toast, spaceLabel, spaceIcon } from '../ui.js';
import { plainText, extractTags } from '../md.js';
import { norm } from '../util.js';

export const isNote = e => !e.task && (!e.date || e.parent || (e.body && e.body.length > 0));

// Теги кешуються за часом зміни запису
const tagCache = new Map();
export function tagsOf(e) {
  const k = e.space + e.id; const c = tagCache.get(k);
  if (c && c.u === e.updatedAt) return c.tags;
  const tags = extractTags(e.title, e.body);
  tagCache.set(k, { u: e.updatedAt, tags }); return tags;
}
export function allTags() {
  const m = new Map();
  for (const e of store.entries()) for (const tg of tagsOf(e)) { const x = m.get(tg.key) || { ...tg, n: 0 }; x.n++; m.set(tg.key, x); }
  return [...m.values()].sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
}

const collapsed = new Set(JSON.parse(localStorage.getItem('plan.folderCollapsed') || '[]'));
const saveCollapsed = () => localStorage.setItem('plan.folderCollapsed', JSON.stringify([...collapsed]));
const scopeOf = st => st.notesScope || { t: 'all' };
const sameScope = (a, b) => a.t === b.t && (a.id || '') === (b.id || '');

function inScope(e, sc) {
  if (sc.t === 'all') return true;
  if (sc.t === 'pinned') return !!e.pinned;
  if (sc.t === 'unfiled') return !e.folder || !store.folderById(e.folder);
  if (sc.t === 'subject') return e.subject === sc.id;
  if (sc.t === 'tag') return tagsOf(e).some(x => x.key === sc.id);
  if (sc.t === 'folder') return e.folder === sc.id || (e.folder && store.isAncestor(sc.id, e.folder));
  return true;
}

export function scopeTitle(sc) {
  if (sc.t === 'pinned') return t('notes.pinned');
  if (sc.t === 'unfiled') return t('notes.unfiled');
  if (sc.t === 'subject') { const s = store.subjectById(sc.id); return s ? s.name : t('notes.all'); }
  if (sc.t === 'tag') return '#' + (allTags().find(x => x.key === sc.id) || { label: sc.id }).label;
  if (sc.t === 'folder') { const f = store.folderById(sc.id); return f ? f.name : t('notes.all'); }
  return t('notes.all');
}

function sideHtml(st, notes) {
  const sc = scopeOf(st);
  const item = (scope, ic, label, n, extra = '') => `<button class="ns-i ${sameScope(sc, scope) ? 'on' : ''}" data-scope='${esc(JSON.stringify(scope))}' ${extra}>${ic}<span class="ns-l">${esc(label)}</span>${n ? `<b class="ns-n">${n}</b>` : ''}</button>`;
  const folders = store.folders();
  const direct = new Map(); for (const e of notes) if (e.folder) direct.set(e.folder, (direct.get(e.folder) || 0) + 1);
  const total = id => (direct.get(id) || 0) + folders.filter(f => f.parent === id).reduce((a, f) => a + total(f.id), 0);
  const tree = (parent, depth) => folders.filter(f => (f.parent || null) === parent || (parent === null && f.parent && !store.folderById(f.parent))).map(f => {
    const kids = folders.some(c => c.parent === f.id);
    const open = !collapsed.has(f.id);
    return `<div class="ns-f" style="--d:${depth}">
      <div class="ns-row ${sameScope(sc, { t: 'folder', id: f.id }) ? 'on' : ''}" data-folder="${f.id}" draggable="true">
        <button class="ns-tw ${kids ? '' : 'none'} ${open ? 'open' : ''}" data-twist="${f.id}" tabindex="-1" aria-label="${esc(f.name)}">${kids ? icon('right') : ''}</button>
        <button class="ns-i" data-scope='${esc(JSON.stringify({ t: 'folder', id: f.id }))}'>${icon('folder')}<span class="ns-l">${esc(f.name || t('entry.untitled'))}</span>${total(f.id) ? `<b class="ns-n">${total(f.id)}</b>` : ''}</button>
        <button class="ns-more" data-fmenu="${f.id}" aria-label="${esc(t('nav.more'))}">${icon('more')}</button>
      </div>
      ${kids && open ? tree(f.id, depth + 1) : ''}</div>`;
  }).join('');
  const tags = allTags();
  const subs = store.subjects();
  return `<div class="ns-top">
      ${item({ t: 'all' }, icon('notes'), t('notes.all'), notes.length)}
      ${notes.some(e => e.pinned) ? item({ t: 'pinned' }, icon('pin'), t('notes.pinned'), notes.filter(e => e.pinned).length) : ''}
      ${item({ t: 'unfiled' }, icon('inbox'), t('notes.unfiled'), notes.filter(e => !e.folder || !store.folderById(e.folder)).length, 'data-folder-drop="root"')}
    </div>
    <div class="ns-h" data-folder-drop="root"><span>${t('notes.folders')}</span><button class="icon-btn sm" data-newfolder aria-label="${esc(t('folder.new'))}" title="${esc(t('folder.new'))}">${icon('plus')}</button></div>
    <div class="ns-tree">${tree(null, 0) || `<button class="ns-empty" data-newfolder>${icon('plus')}${t('folder.new')}</button>`}</div>
    ${tags.length ? `<div class="ns-h"><span>${t('notes.tags')}</span></div><div class="ns-tags">${tags.slice(0, 60).map(tg => `<button class="tagchip ${sameScope(sc, { t: 'tag', id: tg.key }) ? 'on' : ''}" data-scope='${esc(JSON.stringify({ t: 'tag', id: tg.key }))}'>#${esc(tg.label)}<b>${tg.n}</b></button>`).join('')}</div>` : ''}
    ${subs.length ? `<div class="ns-h"><span>${t('nav.subjects')}</span></div>${subs.map(s => item({ t: 'subject', id: s.id }, `<i class="dot sq" style="--c:${cvar(s.color)}"></i>`, s.name, notes.filter(e => e.subject === s.id).length)).join('')}` : ''}`;
}

export function render(el, st, ctx) {
  if (st.notesSubject && st.notesSubject !== 'all' && !st.notesScope) st.notesScope = st.notesSubject === 'none' ? { t: 'all' } : { t: 'subject', id: st.notesSubject };
  const sc = scopeOf(st);
  const notes = store.entries().filter(isNote);
  const q = norm(st.notesFilter || '');
  let list = notes.filter(e => inScope(e, sc));
  if (q) list = list.filter(e => norm(e.title).includes(q) || norm(plainText(e.body || '', true)).includes(q));
  const sort = store.settings.notesSort || 'updated';
  const cmp = { updated: (a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''), created: (a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''), title: (a, b) => (a.title || '￿').localeCompare(b.title || '￿') }[sort];
  list.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || cmp(a, b));
  const mode = store.settings.notesView || 'grid';
  const crumbs = sc.t === 'folder' ? store.folderPath(sc.id) : [];
  const subfolders = sc.t === 'folder' ? store.folders().filter(f => f.parent === sc.id) : sc.t === 'all' ? [] : [];

  let html = `<div class="notes-layout">
    <aside class="notes-side">${sideHtml(st, notes)}</aside>
    <section class="notes-main">
      <div class="notes-bar">
        <button class="scope-btn" data-scopepick>${icon(sc.t === 'folder' ? 'folder' : sc.t === 'tag' ? 'hash' : 'notes')}<span>${esc(scopeTitle(sc))}</span>${icon('down')}</button>
        <div class="crumbs">${sc.t === 'folder' ? [`<button data-scope='${esc(JSON.stringify({ t: 'all' }))}'>${t('notes.all')}</button>`, ...crumbs.map((f, i) => i === crumbs.length - 1 ? `<b>${esc(f.name)}</b>` : `<button data-scope='${esc(JSON.stringify({ t: 'folder', id: f.id }))}'>${esc(f.name)}</button>`)].join(icon('right')) : `<b>${esc(scopeTitle(sc))}</b>`}<span class="muted">${list.length}</span></div>
        <span class="grow"></span>
        <label class="nfilter">${icon('search')}<input data-nfilter-in value="${esc(st.notesFilter || '')}" placeholder="${esc(t('notes.filter'))}" aria-label="${esc(t('notes.filter'))}"></label>
        <button class="icon-btn" data-nsortmenu title="${esc(t('notes.sort'))}" aria-label="${esc(t('notes.sort'))}">${icon('filter')}</button>
        <div class="seg sm"><button class="${mode === 'grid' ? 'on' : ''}" data-nview="grid" title="${esc(t('notes.grid'))}" aria-label="${esc(t('notes.grid'))}">${icon('grid')}</button><button class="${mode === 'list' ? 'on' : ''}" data-nview="list" title="${esc(t('notes.list'))}" aria-label="${esc(t('notes.list'))}">${icon('list')}</button></div>
        ${sc.t === 'folder' ? `<button class="icon-btn" data-fmenu="${sc.id}" aria-label="${esc(t('nav.more'))}">${icon('more')}</button>` : ''}
        <button class="btn primary" data-act="new-note">${icon('plus')}<span>${t('notes.new')}</span></button>
      </div>`;
  if (subfolders.length) html += `<div class="folder-tiles">${subfolders.map(f => `<button class="ftile" data-scope='${esc(JSON.stringify({ t: 'folder', id: f.id }))}' data-folder="${f.id}" draggable="true">${icon('folder')}<span>${esc(f.name)}</span><b>${notes.filter(e => inScope(e, { t: 'folder', id: f.id })).length}</b></button>`).join('')}</div>`;
  if (!list.length) html += `<p class="empty-t big">${q ? t('search.empty') : sc.t === 'folder' ? t('folder.empty') : sc.t === 'tag' ? t('notes.tagEmpty') : t('notes.empty')}</p>`;
  html += `<div class="${mode === 'list' ? 'note-list' : 'note-grid'}">`;
  for (const e of list) {
    const s = store.subjectById(e.subject);
    const f = e.folder && sc.t !== 'folder' ? store.folderById(e.folder) : null;
    const parent = e.parent ? store.entry(e.space, e.parent) : null;
    const snippet = plainText(e.body || '', true).slice(0, 220);
    const sp = store.space(e.space);
    const tags = tagsOf(e).slice(0, 4);
    const meta = `${s ? `<span class="subj-tag" style="--c:${cvar(s.color)}">${esc(s.name)}</span>` : ''}${f ? `<span class="fld">${icon('folder')}${esc(f.name)}</span>` : ''}${tags.map(x => `<span class="tagchip sm" data-scope='${esc(JSON.stringify({ t: 'tag', id: x.key }))}'>#${esc(x.label)}</span>`).join('')}${e.occurrence ? `<span>${esc(shortDate(e.occurrence))}</span>` : ''}${sp && sp.kind === 'shared' ? `<span class="ic-meta">${icon('users')}</span>` : ''}`;
    const title = esc(e.title || (parent ? parent.title : '') || t('entry.untitled'));
    if (mode === 'list') html += `<article class="note-row" data-open="${esc(openKey(e))}" data-note="${esc(e.space + '|' + e.id)}" draggable="true" tabindex="0" ${s ? `style="--c:${cvar(s.color)}"` : ''}>
      <span class="nr-main"><span class="nr-t">${e.pinned ? icon('pin', 'pin') : ''}${title}</span>${snippet ? `<span class="nr-s">${esc(snippet)}</span>` : ''}</span>
      <span class="nr-meta">${meta}</span><span class="muted sm nr-time">${esc(relTime(e.updatedAt))}</span></article>`;
    else html += `<article class="note-card" data-open="${esc(openKey(e))}" data-note="${esc(e.space + '|' + e.id)}" draggable="true" tabindex="0" ${s ? `style="--c:${cvar(s.color)}"` : ''}>
      <h4>${e.pinned ? icon('pin', 'pin') : ''}${title}</h4>
      ${snippet ? `<p>${esc(snippet)}</p>` : ''}
      <footer>${meta}<span class="grow"></span><span class="muted">${esc(relTime(e.updatedAt))}</span></footer>
    </article>`;
  }
  el.innerHTML = html + '</div></section></div>';

  const setScope = scope => { st.notesScope = scope; st.notesFilter = ''; ctx.rerender(); };
  el.onclick = async ev => {
    const sb = ev.target.closest('[data-scope]');
    if (sb && !ev.target.closest('[data-fmenu],[data-twist]')) { ev.stopPropagation(); ev.preventDefault(); setScope(JSON.parse(sb.dataset.scope)); return; }
    const tw = ev.target.closest('[data-twist]'); if (tw) { const id = tw.dataset.twist; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); saveCollapsed(); ctx.rerender(); return; }
    if (ev.target.closest('[data-newfolder]')) { folderPrompt(ev.target.closest('[data-newfolder]'), null, sc.t === 'folder' ? sc.id : null, ctx, f => setScope({ t: 'folder', id: f.id })); return; }
    const fm = ev.target.closest('[data-fmenu]'); if (fm) { folderMenu(fm, fm.dataset.fmenu, ctx, setScope, sc); return; }
    const v = ev.target.closest('[data-nview]'); if (v) { store.saveSettings({ notesView: v.dataset.nview }); ctx.rerender(); return; }
    if (ev.target.closest('[data-nsortmenu]')) {
      const cur = store.settings.notesSort || 'updated';
      menu(ev.target.closest('[data-nsortmenu]'), [['updated', 'notes.sortUpdated'], ['created', 'notes.sortCreated'], ['title', 'notes.sortTitle']].map(([k, l]) => ({ label: t(l), active: cur === k, act: () => { store.saveSettings({ notesSort: k }); ctx.rerender(); } })), { align: 'right' });
      return;
    }
    if (ev.target.closest('[data-scopepick]')) {
      const box = h(`<div class="notes-side in-sheet">${sideHtml(st, notes)}</div>`);
      const p = popover(ev.target.closest('[data-scopepick]'), box, { sheet: true });
      box.addEventListener('click', e2 => {
        const b = e2.target.closest('[data-scope]'); if (b && !e2.target.closest('[data-fmenu]')) { p.close(); setScope(JSON.parse(b.dataset.scope)); return; }
        if (e2.target.closest('[data-newfolder]')) { p.close(); folderPrompt(null, null, null, ctx, f => setScope({ t: 'folder', id: f.id })); return; }
        const m = e2.target.closest('[data-fmenu]'); if (m) { p.close(); folderMenu(null, m.dataset.fmenu, ctx, setScope, sc); return; }
        const tw2 = e2.target.closest('[data-twist]'); if (tw2) { const id = tw2.dataset.twist; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); saveCollapsed(); p.close(); ctx.rerender(); }
      });
    }
  };
  const fin = $('[data-nfilter-in]', el);
  fin.oninput = () => { st.notesFilter = fin.value; const pos = fin.selectionStart; ctx.rerender(); const n = $('[data-nfilter-in]', el); if (n) { n.focus(); n.setSelectionRange(pos, pos); } };

  // Перетягування: нотатку — у папку, папку — в іншу папку або в корінь
  let drag = null;
  el.ondragstart = ev => {
    const n = ev.target.closest('[data-note]'); const f = ev.target.closest('[data-folder][draggable]');
    if (n) drag = { note: n.dataset.note }; else if (f) drag = { folder: f.dataset.folder }; else return;
    ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', JSON.stringify(drag));
    document.body.classList.add('dragging-note');
  };
  const target = ev => ev.target.closest('[data-folder]:not(.note-card), [data-folder-drop]');
  el.ondragover = ev => {
    const tg = drag && target(ev); $$('.drop', el).forEach(x => x !== tg && x.classList.remove('drop'));
    if (!tg) return;
    if (drag.folder && tg.dataset.folder && (tg.dataset.folder === drag.folder || store.isAncestor(drag.folder, tg.dataset.folder))) return;
    ev.preventDefault(); tg.classList.add('drop');
  };
  el.ondrop = async ev => {
    const tg = drag && target(ev); if (!tg) return; ev.preventDefault();
    const dest = tg.dataset.folder || null; const d = drag; drag = null;
    if (d.note) {
      const [sp, id] = d.note.split('|');
      await store.updateEntry(sp, id, { folder: dest });
      const f = dest && store.folderById(dest); toast(dest ? t('folder.moved', { f: f.name }) : t('folder.movedOut'));
    } else if (d.folder && d.folder !== dest) {
      const f = store.folderById(d.folder); if (f) await store.updateFolder(f.space, f.id, { parent: dest });
    }
  };
  el.ondragend = () => { drag = null; document.body.classList.remove('dragging-note'); $$('.drop', el).forEach(x => x.classList.remove('drop')); };
}

// Нова папка або перейменування
export function folderPrompt(anchor, folder, parent, ctx, done) {
  const spaces = store.spaces;
  const parentF = parent && store.folderById(parent);
  const box = h(`<form class="pop-form col"><input value="${esc(folder ? folder.name : '')}" placeholder="${esc(t('folder.name'))}" aria-label="${esc(t('folder.name'))}">
    ${!folder && !parentF && spaces.length > 1 ? `<div class="seg sm">${spaces.map((s, i) => `<button type="button" data-sp="${s.id}" class="${i === 0 ? 'on' : ''}">${icon(spaceIcon(s))}${esc(spaceLabel(s))}</button>`).join('')}</div>` : ''}
    <div class="row-end"><button class="btn primary sm">${folder ? t('misc.save') : t('folder.create')}</button></div></form>`);
  const p = popover(anchor, box, { sheet: !anchor || isNarrow() });
  const inp = $('input', box); setTimeout(() => { inp.focus(); inp.select(); }, 30);
  let sp = parentF ? parentF.space : spaces[0].id;
  box.addEventListener('click', e => { const b = e.target.closest('[data-sp]'); if (b) { sp = b.dataset.sp; $$('[data-sp]', box).forEach(x => x.classList.toggle('on', x === b)); } });
  box.onsubmit = async e => {
    e.preventDefault(); const name = inp.value.trim(); if (!name) return; p.close();
    if (folder) { await store.updateFolder(folder.space, folder.id, { name }); done && done(folder); }
    else { const f = await store.createFolder({ name, parent: parent || null }, sp); done && done(f); }
  };
}

function folderMenu(anchor, id, ctx, setScope, sc) {
  const f = store.folderById(id); if (!f) return;
  const others = store.folders().filter(x => x.id !== id && !store.isAncestor(id, x.id));
  menu(anchor, [
    { label: t('folder.newSub'), icon: 'plus', act: () => folderPrompt(anchor, null, id, ctx, nf => setScope({ t: 'folder', id: nf.id })) },
    { label: t('folder.rename'), icon: 'settings', act: () => folderPrompt(anchor, f, null, ctx) },
    { label: t('folder.moveTo'), icon: 'move', act: () => menu(anchor, [
      { label: t('folder.root'), icon: 'notes', active: !f.parent, act: () => store.updateFolder(f.space, f.id, { parent: null }) },
      ...others.map(o => ({ label: store.folderPath(o.id).map(x => x.name).join(' / '), icon: 'folder', active: f.parent === o.id, act: () => store.updateFolder(f.space, f.id, { parent: o.id }) })),
    ]) },
    '-',
    { label: t('folder.delete'), icon: 'trash', danger: true, act: async () => {
      if (!(await confirmBox(t('folder.deleteConfirm', { f: f.name }), t('misc.delete'), true))) return;
      await store.deleteFolder(f.space, f.id);
      if (sc.t === 'folder' && sc.id === id) setScope(f.parent ? { t: 'folder', id: f.parent } : { t: 'all' });
    } },
  ], { align: 'right' });
}
