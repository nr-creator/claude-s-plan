// Спільні елементи інтерфейсу: спливні вікна, меню, діалоги, сповіщення, вибір дати.
import { icon } from './icons.js';
import { t, fmtDate, monthName, locale } from './i18n.js';
import { escapeHtml as esc, todayYmd, addDays, startOfWeek, startOfMonth, addMonths, isoDow } from './util.js';
import * as store from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const h = (html) => { const tpl = document.createElement('template'); tpl.innerHTML = html.trim(); return tpl.content.firstElementChild; };
export const isNarrow = () => matchMedia('(max-width: 760px)').matches;
export const isTouch = () => matchMedia('(pointer: coarse)').matches;

export const COLORS = ['teal', 'blue', 'indigo', 'violet', 'pink', 'red', 'orange', 'amber', 'olive', 'green', 'slate', 'brown'];
export const cvar = c => c === 'accent' ? 'var(--accent)' : `var(--c-${COLORS.includes(c) ? c : 'slate'})`;
// Колір простору: 'accent' (або старе 'ink') — колір акценту теми
export const spaceColor = s => !s || !s.color || s.color === 'ink' || s.color === 'accent' ? 'var(--accent)' : cvar(s.color);
// Іконки, з яких можна вибрати значок простору
export const SPACE_ICONS = ['lock', 'person', 'users', 'inbox', 'book', 'folder', 'target', 'pin', 'hash', 'calendar', 'notes', 'sun'];
export const spaceIcon = s => s && SPACE_ICONS.includes(s.icon) ? s.icon : (s && s.kind === 'shared' ? 'users' : 'lock');

// ---- Сповіщення внизу екрана ----
export function toast(text, opts = {}) {
  const box = $('#toasts');
  while (box.children.length >= 3) box.firstElementChild.remove();
  const el = h(`<div class="toast" role="status"><span>${esc(text)}</span>${opts.action ? `<button class="btn-text">${esc(opts.action)}</button>` : ''}</div>`);
  box.appendChild(el);
  const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 200); };
  if (opts.action) el.querySelector('button').onclick = () => { close(); opts.onAction && opts.onAction(); };
  setTimeout(close, opts.timeout || (opts.action ? 6000 : 3000));
  return close;
}

// ---- Спливне вікно біля елемента (на телефоні — шторка знизу) ----
let openPops = [];
export function closePops() { openPops.slice().forEach(p => p.close()); }
export function popover(anchor, content, opts = {}) {
  const sheet = opts.sheet ?? isNarrow();
  const el = h(`<div class="pop ${sheet ? 'sheet' : ''} ${opts.cls || ''}" role="dialog"></div>`);
  if (typeof content === 'string') el.innerHTML = content; else el.appendChild(content);
  const scrim = sheet ? h('<div class="scrim"></div>') : null;
  if (scrim) document.body.appendChild(scrim);
  document.body.appendChild(el);
  const place = () => {
    if (sheet || !anchor) return;
    const r = anchor.getBoundingClientRect(), w = el.offsetWidth, hgt = el.offsetHeight;
    let x = opts.align === 'right' ? r.right - w : r.left, y = r.bottom + 6;
    if (opts.at) { x = opts.at.x; y = opts.at.y; }
    if (x + w > innerWidth - 8) x = innerWidth - w - 8;
    if (x < 8) x = 8;
    if (y + hgt > innerHeight - 8) y = Math.max(8, (opts.at ? opts.at.y : r.top) - hgt - 6);
    el.style.left = x + 'px'; el.style.top = y + 'px';
  };
  place();
  const onDown = e => { if (!el.contains(e.target) && !(anchor && anchor.contains(e.target))) close(); };
  const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  setTimeout(() => { document.addEventListener('pointerdown', onDown, true); }, 0);
  document.addEventListener('keydown', onKey, true);
  let closed = false;
  function close() {
    if (closed) return; closed = true;
    document.removeEventListener('pointerdown', onDown, true);
    document.removeEventListener('keydown', onKey, true);
    el.remove(); scrim && scrim.remove();
    openPops = openPops.filter(p => p.close !== close);
    opts.onClose && opts.onClose();
  }
  const api = { el, close, place };
  openPops.push(api);
  return api;
}

// ---- Меню дій ----
export function menu(anchor, items, opts = {}) {
  const list = h('<div class="menu" role="menu"></div>');
  items.filter(Boolean).forEach(it => {
    if (it === '-') { list.appendChild(h('<div class="menu-sep"></div>')); return; }
    if (it.header) { list.appendChild(h(`<div class="menu-h">${esc(it.header)}</div>`)); return; }
    const b = h(`<button class="menu-i ${it.danger ? 'danger' : ''} ${it.active ? 'active' : ''}" role="menuitem">${it.icon ? icon(it.icon) : (it.dot ? `<span class="dot" style="--c:${it.dot}"></span>` : '<span class="ic"></span>')}<span class="menu-l">${esc(it.label)}</span>${it.hint ? `<span class="menu-k">${esc(it.hint)}</span>` : ''}${it.active ? icon('check', 'menu-check') : ''}</button>`);
    b.onclick = () => { p.close(); it.act && it.act(); };
    list.appendChild(b);
  });
  const p = popover(anchor, list, opts);
  const btns = () => $$('.menu-i', list);
  list.addEventListener('keydown', e => {
    const b = btns(), i = b.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); b[(i + 1) % b.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); b[(i - 1 + b.length) % b.length].focus(); }
  });
  if (!isTouch()) setTimeout(() => btns()[0] && btns()[0].focus({ preventScroll: true }), 0);
  return p;
}

// ---- Модальне вікно ----
export function modal(title, body, opts = {}) {
  const el = h(`<div class="modal-wrap"><div class="modal ${opts.wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-h"><h2>${esc(title)}</h2><button class="icon-btn" data-x aria-label="${t('misc.close')}">${icon('x')}</button></div>
    <div class="modal-b"></div></div></div>`);
  const b = el.querySelector('.modal-b');
  if (typeof body === 'string') b.innerHTML = body; else b.appendChild(body);
  document.body.appendChild(el);
  const close = () => { el.remove(); document.removeEventListener('keydown', key, true); opts.onClose && opts.onClose(); };
  const key = e => { if (e.key === 'Escape' && !$('.pop')) { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', key, true);
  el.addEventListener('pointerdown', e => { if (e.target === el) close(); });
  el.querySelector('[data-x]').onclick = close;
  setTimeout(() => { const f = b.querySelector('[autofocus], input, button'); f && !isTouch() && f.focus(); }, 0);
  return { el, body: b, close };
}

export function confirmBox(text, okLabel, danger) {
  return new Promise(res => {
    const body = h(`<div><p class="confirm-t">${esc(text)}</p><div class="row-end"><button class="btn" data-n>${t('misc.cancel')}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-y>${esc(okLabel || t('misc.ok'))}</button></div></div>`);
    const m = modal(' ', body, { onClose: () => res(false) });
    body.querySelector('[data-n]').onclick = () => m.close();
    body.querySelector('[data-y]').onclick = () => { res(true); m.close(); };
    setTimeout(() => body.querySelector('[data-y]').focus(), 0);
  });
}

// ---- Вибір дати (маленький місяць) ----
export function dateGrid(cursor, selected, opts = {}) {
  const ws = store.settings.weekStart;
  const first = startOfMonth(cursor);
  let d = startOfWeek(first, ws);
  const today = todayYmd();
  let html = `<div class="mini" data-cursor="${cursor}"><div class="mini-h"><button class="icon-btn sm" data-mini="-1" aria-label="${t('cal.prev')}">${icon('left')}</button><span>${monthName(first)}</span><button class="icon-btn sm" data-mini="1" aria-label="${t('cal.next')}">${icon('right')}</button></div><div class="mini-g">`;
  for (let i = 0; i < 7; i++) html += `<span class="mini-dow">${t('dow.short.' + (((ws - 1 + i) % 7) + 1)).slice(0, 2)}</span>`;
  for (let i = 0; i < 42; i++) {
    const cls = [d.slice(0, 7) !== first.slice(0, 7) ? 'out' : '', d === today ? 'today' : '', d === selected ? 'sel' : '', opts.marks && opts.marks.has(d) ? 'mark' : ''].join(' ');
    html += `<button class="mini-d ${cls}" data-day="${d}">${+d.slice(8)}</button>`;
    d = addDays(d, 1);
  }
  return html + '</div></div>';
}
export function pickDate(anchor, value, onPick, opts = {}) {
  let cursor = value || todayYmd();
  const wrap = h('<div class="datepick"></div>');
  const quick = [[t('agenda.today'), todayYmd()], [t('agenda.tomorrow'), addDays(todayYmd(), 1)]];
  const nextMon = addDays(todayYmd(), ((1 - isoDow(todayYmd()) + 7) % 7) || 7);
  quick.push([fmtDate(nextMon, { weekday: 'short', day: 'numeric' }), nextMon]);
  const draw = () => {
    wrap.innerHTML = `<div class="dp-quick">${quick.map(([l, v]) => `<button class="chip" data-day="${v}">${esc(l)}</button>`).join('')}${opts.allowNone ? `<button class="chip" data-day="">${t('entry.noDate')}</button>` : ''}</div>` + dateGrid(cursor, value);
  };
  draw();
  const p = popover(anchor, wrap, { cls: 'pop-date' });
  wrap.addEventListener('click', e => {
    const m = e.target.closest('[data-mini]');
    if (m) { cursor = addMonths(startOfMonth(cursor), +m.dataset.mini); draw(); return; }
    const d = e.target.closest('[data-day]');
    if (d) { p.close(); onPick(d.dataset.day || null); }
  });
  return p;
}

export const fmtRange = (a, b) => a ? (b ? `${a}–${b}` : a) : '';
export const spaceLabel = s => s ? (s.name || (s.kind === 'shared' ? t('space.shared') : t('space.mine'))) : '';
export const dayLabel = (d, style = 'long') => {
  const today = todayYmd();
  if (d === today) return t('agenda.today');
  if (d === addDays(today, 1)) return t('agenda.tomorrow');
  const s = fmtDate(d, style === 'long' ? { weekday: 'long', day: 'numeric', month: 'long' } : { weekday: 'short', day: 'numeric', month: 'short' });
  return s.charAt(0).toUpperCase() + s.slice(1);
};
export const shortDate = d => fmtDate(d, { day: 'numeric', month: 'short' });
export { esc, icon, locale };
