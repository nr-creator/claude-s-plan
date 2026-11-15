// Оболонка застосунку: маршрути, макет, гарячі клавіші, панель запису, статус синхронізації.
import * as store from './store.js';
import * as sync from './sync.js';
import { t, setLang, getLang, monthName } from './i18n.js';
import { todayYmd, addDays, timeToMin, nowMin } from './util.js';
import { icon } from './icons.js';
import { $, $$, h, esc, toast, popover, menu, isNarrow, dateGrid, cvar, spaceLabel, dayLabel, closePops } from './ui.js';
import { mountQuickAdd } from './qa.js';
import { openPalette } from './search.js';
import { itemsIn, toggleDone, openKey } from './cal.js';
import * as todayView from './views/today.js';
import * as calView from './views/calendar.js';
import * as notesView from './views/notes.js';
import * as subjView from './views/subject.js';
import * as setView from './views/settings.js';
import * as misc from './views/misc.js';
import { openPanel } from './views/entry.js';

const state = { route: 'today', calView: 'week', cursor: todayYmd(), subjectId: null, notesSubject: 'all', open: null, miniCursor: todayYmd() };
let panel = null, panelFull = false, openedByPush = false, qa = null, installPrompt = null, renderQueued = false;

const ctx = {
  state,
  go: (hash, opts = {}) => { if (opts.replace) location.replace(hash); else location.hash = hash; },
  open: (key, opts = {}) => openEntry(key, opts),
  close: (deleted) => closeEntry(deleted),
  rerender: () => render(),
  isFull: () => panelFull,
  toggleFull: () => { panelFull = !panelFull; document.body.classList.toggle('panel-full', panelFull); },
  newAt: p => { qa.preset(p); },
  keepScroll: () => {},
  newNote: () => newNote(),
  newSubject: (anchor, cb) => subjView.subjectForm(null, ctx, cb),
  newSubjectModal: () => subjView.subjectForm(null, ctx),
  syncNow: () => sync.syncAll(),
  history: e => misc.showHistory(e, { reopen: () => panel && reopen() }),
  setSetting: (k, v) => setSetting(k, v),
  cycleTheme: () => setSetting('theme', { auto: 'light', light: 'dark', dark: 'auto' }[store.settings.theme]),
  setLang: l => setSetting('lang', l),
  importIcs: async () => (await import('./views/ics-ui.js')).importDialog(ctx),
  exportIcs: async () => (await import('./views/ics-ui.js')).exportDialog(ctx),
  transfer: async () => (await import('./transfer.js')).showTransfer(ctx),
  canInstall: () => !!installPrompt,
  install: async () => { if (installPrompt) { installPrompt.prompt(); installPrompt = null; render(); } },
};

// ---------- маршрути ----------
function parseHash() {
  const raw = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = new URLSearchParams(query || '');
  state.open = q.get('open');
  const r = parts[0] || (isNarrow() ? 'today' : (store.settings.view === 'cal' ? 'cal' : 'today'));
  state.route = r;
  if (r === 'cal') {
    state.calView = ['day', 'week', 'month'].includes(parts[1]) ? parts[1] : state.calView;
    if (/^\d{4}-\d{2}-\d{2}$/.test(parts[2] || '')) state.cursor = parts[2];
  }
  if (r === 'subject') state.subjectId = parts[1];
}
const pathOnly = () => location.hash.split('?')[0] || '#/today';
function onRoute() {
  const prevRoute = state.route + state.calView + state.cursor + state.subjectId;
  parseHash();
  if (state.open && (!panel || panel.key !== state.open)) mountPanel(state.open);
  if (!state.open && panel) unmountPanel();
  if (prevRoute !== state.route + state.calView + state.cursor + state.subjectId || !$('#view').childElementCount) render(true);
  else render();
}

// ---------- макет ----------
function shell() {
  document.body.innerHTML = `
  <div class="app">
    <aside class="rail" id="rail">
      <div class="rail-top"><span class="brand">${logo()}<b>${t('app.name')}</b></span><button class="icon-btn" data-act="search" title="Ctrl+K" aria-label="${t('nav.search')}">${icon('search')}</button></div>
      <nav class="rail-nav">
        <a href="#/today" data-nav="today">${icon('today')}<span>${t('nav.today')}</span></a>
        <a href="#/cal/week/${todayYmd()}" data-nav="cal">${icon('calendar')}<span>${t('nav.calendar')}</span></a>
        <a href="#/notes" data-nav="notes">${icon('notes')}<span>${t('nav.notes')}</span></a>
        <a href="#/subjects" data-nav="subjects">${icon('book')}<span>${t('nav.subjects')}</span></a>
      </nav>
      <div class="rail-mini" id="mini"></div>
      <div class="rail-sec"><div class="rail-h"><span>${t('nav.subjects')}</span><button class="icon-btn sm" data-act="new-subject" aria-label="${t('subj.new')}">${icon('plus')}</button></div><div id="subjList" class="subj-list"></div></div>
      <div class="rail-sec" id="spacesSec"></div>
      <div class="rail-foot"><a href="#/settings" data-nav="settings">${icon('settings')}<span>${t('nav.settings')}</span></a><button class="sync-btn" data-act="sync" aria-label="${t('sync.now')}"></button></div>
    </aside>
    <main class="main" id="main">
      <header class="top">
        <button class="icon-btn only-narrow" data-act="menu" aria-label="${t('nav.more')}">${icon('menu')}</button>
        <h1 id="title"></h1>
        <span class="grow"></span>
        <button class="icon-btn only-narrow" data-act="settings" aria-label="${t('nav.settings')}">${icon('settings')}</button>
        <button class="sync-btn only-narrow" data-act="sync" aria-label="${t('sync.now')}"></button>
      </header>
      <div id="qaHost" class="qa-host"></div>
      <div id="view" class="view" tabindex="-1"></div>
    </main>
    <section class="panel" id="panel" aria-label="${t('entry.title')}"></section>
  </div>
  <nav class="tabs" id="tabs">
    <a href="#/today" data-nav="today">${icon('today')}<span>${t('nav.today')}</span></a>
    <a href="#/cal/week/${todayYmd()}" data-nav="cal">${icon('calendar')}<span>${t('nav.calendar')}</span></a>
    <a href="#/notes" data-nav="notes">${icon('notes')}<span>${t('nav.notes')}</span></a>
    <a href="#/subjects" data-nav="subjects">${icon('book')}<span>${t('nav.subjects')}</span></a>
    <button data-act="search">${icon('search')}<span>${t('nav.search')}</span></button>
  </nav>
  <div id="toasts" class="toasts"></div>`;
  qa = mountQuickAdd($('#qaHost'), { open: (k, o) => openEntry(k, o) });
}
const logo = () => `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><rect x="3" y="5" width="26" height="24" rx="6" fill="var(--accent)"/><path d="M9 3.5v5M23 3.5v5" stroke="var(--accent)" stroke-width="2.6" stroke-linecap="round"/><path d="M10 17.5l4 4 8-8.5" stroke="var(--on-accent)" stroke-width="2.8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// ---------- малювання ----------
function scheduleRender() { if (renderQueued) return; renderQueued = true; requestAnimationFrame(() => { renderQueued = false; render(); }); }
function render(routeChanged) {
  const view = $('#view');
  const grid = $('.tg-body', view);
  if (grid && !routeChanged) state.scrollMin = grid.scrollTop / 48 * 60 + 8 / 48 * 60;
  else if (routeChanged) state.scrollMin = null;
  const scroll = routeChanged ? 0 : view.scrollTop;
  view.onclick = null; view.onsubmit = null; view.onchange = null;
  const r = state.route;
  document.body.dataset.route = r;
  let title = '';
  if (r === 'today') { title = dayLabel(todayYmd()); todayView.render(view); welcome(view); }
  else if (r === 'cal') { title = t('nav.calendar'); calView.render(view, state, { ...ctx, rerender: () => render() }); }
  else if (r === 'notes') { title = t('nav.notes'); notesView.render(view, state); }
  else if (r === 'subjects') { title = t('nav.subjects'); subjView.renderList(view, state, ctx); }
  else if (r === 'subject') { const s = store.subjectById(state.subjectId); title = s ? s.name : t('nav.subjects'); subjView.render(view, state, ctx); }
  else if (r === 'settings') { title = t('nav.settings'); setView.render(view, state, ctx); }
  else if (r === 'trash') { title = t('nav.trash'); misc.renderTrash(view, state, ctx); }
  else if (r === 'conflicts') { title = t('conf.title'); misc.renderConflicts(view, state, ctx); }
  else { location.replace('#/today'); return; }
  $('#title').textContent = title;
  document.title = `${title} · ${t('app.name')}`;
  view.scrollTop = scroll;
  $$('[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === (r === 'subject' ? 'subjects' : r)));
  rail();
  syncBtn();
  if (panel) panel.refresh();
}

function rail() {
  if (isNarrow() && !document.body.classList.contains('rail-open')) return;
  const mini = $('#mini');
  const c = state.miniCursor;
  const from = addDays(c.slice(0, 8) + '01', -7), to = addDays(c.slice(0, 8) + '01', 42);
  const marks = new Set(itemsIn(from, to).map(it => it.date));
  mini.innerHTML = dateGrid(c, state.route === 'cal' ? state.cursor : null, { marks });
  const subs = store.subjects();
  $('#subjList').innerHTML = subs.map(s => `<a href="#/subject/${s.id}" class="${state.route === 'subject' && state.subjectId === s.id ? 'on' : ''}" style="--c:${cvar(s.color)}"><i class="dot"></i><span>${esc(s.name)}</span>${store.space(s.space) && store.space(s.space).kind === 'shared' ? icon('users', 'sm') : ''}</a>`).join('') || `<button class="btn-text sm" data-act="new-subject">${icon('plus')}${t('subj.new')}</button>`;
  const sec = $('#spacesSec');
  sec.innerHTML = store.spaces.length > 1 ? `<div class="rail-h"><span>${t('nav.spaces')}</span></div>${store.spaces.map(s => `<label class="space-tg" style="--c:${cvar(s.color || 'slate')}"><input type="checkbox" data-spvis="${s.id}" ${store.hiddenSpaces.has(s.id) ? '' : 'checked'}><span class="box"></span>${icon(s.kind === 'shared' ? 'users' : 'lock')}<span>${esc(spaceLabel(s))}</span></label>`).join('')}` : '';
}

function syncBtn() {
  const st = sync.status();
  const vals = Object.values(st);
  const remote = store.spaces.some(s => s.remote);
  const pending = vals.reduce((a, b) => a + (b.pending || 0), 0);
  let cls = 'ok', ic = 'check', label = t('sync.ok');
  if (!remote) { cls = 'local'; ic = 'lock'; label = t('sync.local'); }
  else if (vals.some(v => v.status === 'error')) { cls = 'err'; ic = 'alert'; label = t('sync.error'); }
  else if (vals.some(v => v.status === 'syncing')) { cls = 'busy'; ic = 'sync'; label = t('sync.syncing'); }
  else if (vals.some(v => v.status === 'offline') || !navigator.onLine) { cls = 'off'; ic = 'offline'; label = t('sync.offline'); }
  else if (pending) { cls = 'pend'; ic = 'sync'; label = t('sync.pending', { n: pending }); }
  $$('.sync-btn').forEach(b => { b.className = 'sync-btn ' + cls + (b.classList.contains('only-narrow') ? ' only-narrow' : ''); b.innerHTML = icon(ic) + `<span class="sync-l">${esc(label)}</span>`; b.title = label; });
}
function syncPopover(anchor) {
  const st = sync.status();
  const body = h(`<div class="sync-pop">${store.spaces.map(s => { const x = st[s.id] || {}; return `<div class="sp-line"><b>${icon(s.kind === 'shared' ? 'users' : 'lock')}${esc(spaceLabel(s))}</b><span class="${x.status === 'error' ? 'err' : 'muted'}">${s.remote ? (x.status === 'error' ? esc(setView.errText(x.error)) : x.status === 'syncing' ? t('sync.syncing') : x.status === 'offline' ? t('sync.offline') : x.lastSync ? t('sync.last', { t: new Date(x.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }) : t('sync.never')) : t('space.local')}${x.pending ? ' · ' + t('sync.pending', { n: x.pending }) : ''}</span></div>`; }).join('')}
    <div class="row-end">${store.spaces.some(s => s.remote) ? `<button class="btn primary sm" data-s="now">${icon('sync')}${t('sync.now')}</button>` : `<button class="btn primary sm" data-s="connect">${t('first.connect')}</button>`}<button class="btn sm" data-s="conf">${t('conf.title')}</button></div></div>`);
  const p = popover(anchor, body, { align: 'right' });
  body.onclick = e => { const b = e.target.closest('[data-s]'); if (!b) return; p.close(); if (b.dataset.s === 'now') sync.syncAll(); if (b.dataset.s === 'conf') ctx.go('#/conflicts'); if (b.dataset.s === 'connect') { ctx.go('#/settings'); } };
}

function welcome(view) {
  if (localStorage.getItem('plan.welcomed') || store.spaces.some(s => s.remote)) return;
  const el = h(`<div class="welcome card"><div><b>${t('first.title')}</b><p>${t('first.body')}</p></div><div class="row-end"><button class="btn" data-w="later">${t('first.later')}</button><button class="btn primary" data-w="go">${t('first.connect')}</button></div></div>`);
  view.prepend(el);
  el.onclick = e => { const b = e.target.closest('[data-w]'); if (!b) return; localStorage.setItem('plan.welcomed', '1'); el.remove(); if (b.dataset.w === 'go') ctx.go('#/settings'); };
}

// ---------- панель запису ----------
function openEntry(key, opts = {}) {
  const base = pathOnly();
  ctx._next = opts;
  const target = base + '?open=' + encodeURIComponent(key);
  if (opts.replace || state.open) { location.replace(target); }
  else { openedByPush = true; location.hash = target; }
}
function mountPanel(key) {
  const opts = ctx._next || {}; ctx._next = null;
  if (panel) panel.close();
  const host = $('#panel');
  panel = openPanel(host, key, { ...ctx, tab: opts.tab, focus: opts.focus, isNew: opts.isNew, close: d => closeEntry(d) });
  if (!panel) { location.replace(pathOnly()); return; }
  document.body.classList.add('panel-open');
  if (opts.focus === 'title') setTimeout(() => panel && panel.focusTitle(), 40);
}
function unmountPanel() {
  if (panel) panel.close(); panel = null;
  $('#panel').innerHTML = '';
  document.body.classList.remove('panel-open', 'panel-full'); panelFull = false;
}
function closeEntry() {
  if (!state.open) { unmountPanel(); return; }
  if (openedByPush) { openedByPush = false; history.back(); }
  else location.replace(pathOnly());
}
function reopen() { const k = state.open; unmountPanel(); if (k) mountPanel(k); }
async function newNote() {
  const sid = state.route === 'subject' ? state.subjectId : (state.notesSubject && !['all', 'none'].includes(state.notesSubject) ? state.notesSubject : null);
  const s = sid && store.subjectById(sid);
  const e = await store.createEntry({ title: '', subject: s ? s.id : null }, s ? s.space : store.personalSpace().id);
  openEntry(openKey(e), { isNew: true, focus: 'title' });
}

function setSetting(k, v) {
  store.saveSettings({ [k]: v });
  if (k === 'lang') { setLang(v); const k2 = state.open; unmountPanel(); shell(); bindShell(); render(true); if (k2) mountPanel(k2); return; }
  if (k === 'theme') applyTheme();
  if (k === 'notify' && v && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
  render();
}
function applyTheme() {
  const th = store.settings.theme;
  if (th === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = th;
  const dark = th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  let m = $('meta[name=theme-color]'); if (m) m.content = dark ? '#16211d' : '#f3f5f8';
}

// ---------- події ----------
function bindShell() {
  document.body.addEventListener('click', async e => {
    const a = e.target.closest('[data-act]');
    if (a) {
      const k = a.dataset.act;
      if (k === 'search') openPalette(ctx);
      if (k === 'new-note') newNote();
      if (k === 'new-subject') subjView.subjectForm(null, ctx);
      if (k === 'sync') syncPopover(a);
      if (k === 'settings') ctx.go('#/settings');
      if (k === 'menu') { document.body.classList.toggle('rail-open'); rail(); }
      return;
    }
    const chk = e.target.closest('[data-check]');
    if (chk) { e.stopPropagation(); await toggleDone(chk.dataset.check); return; }
    const op = e.target.closest('[data-open]');
    if (op && !e.target.closest('.ed')) { e.preventDefault(); openEntry(op.dataset.open, { tab: op.dataset.tab }); return; }
    const gd = e.target.closest('[data-goday]');
    if (gd) { ctx.go('#/cal/day/' + gd.dataset.goday); return; }
    const mini = e.target.closest('.rail-mini [data-mini]');
    if (mini) { const d = new Date(state.miniCursor + 'T12:00'); d.setMonth(d.getMonth() + +mini.dataset.mini, 1); state.miniCursor = d.toISOString().slice(0, 10); rail(); return; }
    const md = e.target.closest('.rail-mini [data-day]');
    if (md) { ctx.go(`#/cal/${state.route === 'cal' ? state.calView : 'week'}/${md.dataset.day}`); document.body.classList.remove('rail-open'); return; }
    const cal = e.target.closest('[data-cal]');
    if (cal) { const k = cal.dataset.cal; const c = k === 'today' ? todayYmd() : calView.step(state.calView, state.cursor, k === 'next' ? 1 : -1); ctx.go(`#/cal/${state.calView}/${c}`, { replace: true }); return; }
    const vw = e.target.closest('[data-view]');
    if (vw) { ctx.go(`#/cal/${vw.dataset.view}/${state.cursor}`, { replace: true }); return; }
    const nf = e.target.closest('[data-nfilter]');
    if (nf) { state.notesSubject = nf.dataset.nfilter; render(); return; }
    if (e.target.closest('[data-nsort]')) { state.notesSort = state.notesSort === 'title' ? 'updated' : 'title'; render(); return; }
    if (e.target.closest('.rail a') && isNarrow()) document.body.classList.remove('rail-open');
    if (document.body.classList.contains('rail-open') && !e.target.closest('.rail') && !e.target.closest('[data-act=menu]')) document.body.classList.remove('rail-open');
  });
  document.body.addEventListener('change', e => { const v = e.target.closest('[data-spvis]'); if (v) store.toggleSpaceVisible(v.dataset.spvis); });
  document.body.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.matches('.row[data-open], .note-card[data-open], .next-card[data-open]')) { e.preventDefault(); openEntry(e.target.dataset.open); }
  });
}

function keyboard() {
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(ctx); return; }
    const typing = e.target.closest && e.target.closest('input, textarea, select, [contenteditable="true"], [contenteditable="plaintext-only"]');
    if (e.key === 'Escape' && !e.defaultPrevented) {
      if ($('.modal-wrap, .palette-wrap, .pop')) return;
      if (document.body.classList.contains('rail-open')) { document.body.classList.remove('rail-open'); return; }
      if (panel && !(e.target.closest && e.target.closest('.ed .tx, .ed input'))) { if (typing) { e.target.blur(); } closeEntry(); }
      return;
    }
    if (typing || mod || e.altKey || $('.modal-wrap, .palette-wrap')) return;
    if (e.target.closest && e.target.closest('.ed')) return;
    const k = e.key;
    if (k === '/' ) { e.preventDefault(); openPalette(ctx); }
    else if (k === 'n' || k === 'N') { e.preventDefault(); if (e.shiftKey) newNote(); else qa.focus(); }
    else if (k === 't' || k === 'T') { e.preventDefault(); ctx.go(state.route === 'cal' ? `#/cal/${state.calView}/${todayYmd()}` : '#/today'); }
    else if ('dwm'.includes(k.toLowerCase()) && k.length === 1) { e.preventDefault(); ctx.go(`#/cal/${{ d: 'day', w: 'week', m: 'month' }[k.toLowerCase()]}/${state.cursor}`); }
    else if ((k === 'ArrowLeft' || k === 'ArrowRight' || k === 'j' || k === 'k') && state.route === 'cal' && !panel) { e.preventDefault(); ctx.go(`#/cal/${state.calView}/${calView.step(state.calView, state.cursor, k === 'ArrowRight' || k === 'j' ? 1 : -1)}`, { replace: true }); }
    else if (k === ',') { e.preventDefault(); ctx.go('#/settings'); }
  });
}

// Свайп вліво/вправо в календарі на телефоні
function swipes() {
  let x0 = null, y0 = null, t0 = 0;
  document.addEventListener('touchstart', e => { if (state.route !== 'cal' || panel || !e.target.closest('#view')) { x0 = null; return; } const p = e.touches[0]; x0 = p.clientX; y0 = p.clientY; t0 = Date.now(); }, { passive: true });
  document.addEventListener('touchend', e => {
    if (x0 == null) return; const p = e.changedTouches[0]; const dx = p.clientX - x0, dy = p.clientY - y0;
    if (Math.abs(dx) > 70 && Math.abs(dy) < 50 && Date.now() - t0 < 600) ctx.go(`#/cal/${state.calView}/${calView.step(state.calView, state.cursor, dx < 0 ? 1 : -1)}`, { replace: true });
    x0 = null;
  }, { passive: true });
}

// Нагадування за 10 хвилин (поки застосунок відкритий або згорнутий)
function reminders() {
  const shown = new Set(JSON.parse(sessionStorage.getItem('plan.notified') || '[]'));
  setInterval(async () => {
    if (!store.settings.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
    const today = todayYmd(), nm = nowMin();
    for (const it of itemsIn(today, today)) {
      if (!it.e.time || it.done) continue;
      const d = timeToMin(it.e.time) - nm;
      const key = it.key + it.date;
      if (d > 0 && d <= 10 && !shown.has(key)) {
        shown.add(key); sessionStorage.setItem('plan.notified', JSON.stringify([...shown]));
        const body = t('notif.soon', { n: d, t: it.e.title || t('entry.untitled') });
        const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
        if (reg) reg.showNotification(t('app.name'), { body, tag: key, icon: 'icons/icon-192.png', data: { open: it.key } });
        else new Notification(t('app.name'), { body });
      }
    }
  }, 30000);
}

function serviceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const ask = w => toast(t('upd.ready'), { action: t('upd.reload'), timeout: 30000, onAction: () => w.postMessage('skip') });
    if (reg.waiting && navigator.serviceWorker.controller) ask(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w && w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) ask(w); });
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch(e => console.warn('sw', e));
  // Перезавантаження лише при оновленні версії, а не при першому встановленні
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
  navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.open) openEntry(e.data.open); });
}

async function boot() {
  await store.init();
  setLang(store.settings.lang);
  applyTheme();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  shell(); bindShell(); keyboard(); swipes();
  addEventListener('hashchange', onRoute);
  addEventListener('resize', () => scheduleRender());
  addEventListener('online', syncBtn); addEventListener('offline', syncBtn);
  store.on('change', () => { scheduleRender(); });
  store.on('sync', () => { syncBtn(); if (state.route === 'settings' && !$('.modal-wrap')) scheduleRender(); });
  store.on('conflict', () => toast(t('conf.notice'), { action: t('conf.title'), onAction: () => ctx.go('#/conflicts') }));
  addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; });
  // Перенесення налаштувань із іншого пристрою: #setup=...
  if (location.hash.startsWith('#setup=')) { const code = location.hash.slice(7); history.replaceState(null, '', location.pathname + '#/today'); (await import('./transfer.js')).importSetup(code, ctx); }
  onRoute();
  sync.start();
  serviceWorker();
  reminders();
  // Просимо браузер не видаляти дані при нестачі місця
  store.on('dirty', () => { if (navigator.storage && navigator.storage.persist && !boot.persistAsked) { boot.persistAsked = true; navigator.storage.persist().catch(() => {}); } });
  setInterval(() => { if (state.route === 'today' || state.route === 'cal') scheduleRender(); }, 60000);
  window.__plan = { store, sync, state };
}
boot().catch(e => { console.error(e); document.body.innerHTML = `<pre style="padding:20px;white-space:pre-wrap">${esc(e.stack || e.message)}</pre>`; });
