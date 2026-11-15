// Пошук і палітра команд (Ctrl+K або «/»). Шукає в назвах, тексті конспектів, предметах; розуміє дати і команди.
import * as store from './store.js';
import { t, getLang } from './i18n.js';
import { norm, todayYmd, escapeHtml as esc } from './util.js';
import { plainText } from './md.js';
import { parseQuick } from './parse.js';
import { openKey } from './cal.js';
import { icon, h, $, $$, cvar, dayLabel, shortDate, isNarrow } from './ui.js';

const textCache = new Map();
function docText(e) {
  const k = e.space + e.id;
  const c = textCache.get(k);
  if (c && c.u === e.updatedAt) return c;
  const body = plainText(e.body || '');
  const v = { u: e.updatedAt, title: norm(e.title || ''), body: norm(body), raw: body };
  textCache.set(k, v); return v;
}

export function search(q, limit = 30) {
  const nq = norm(q).trim(); if (!nq) return [];
  const terms = nq.split(/\s+/).filter(Boolean);
  const out = [];
  for (const e of store.entries()) {
    const d = docText(e);
    const s = store.subjectById(e.subject);
    const sn = s ? norm(s.name) : '';
    let score = 0, ok = true;
    for (const tm of terms) {
      const inT = d.title.indexOf(tm), inB = d.body.indexOf(tm), inS = sn.indexOf(tm);
      if (inT < 0 && inB < 0 && inS < 0) { ok = false; break; }
      if (inT >= 0) score += inT === 0 ? 12 : (/\s/.test(d.title[inT - 1] || ' ') ? 8 : 5);
      if (inB >= 0) score += 2;
      if (inS >= 0) score += 3;
    }
    if (!ok) continue;
    const age = (Date.now() - new Date(e.updatedAt || 0)) / 86400000;
    score += Math.max(0, 3 - age / 30);
    out.push({ e, score, snippet: snippet(d.raw, terms) });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, limit);
}
function snippet(raw, terms) {
  const n = norm(raw);
  let i = -1; for (const tm of terms) { i = n.indexOf(tm); if (i >= 0) break; }
  if (i < 0) return '';
  const a = Math.max(0, i - 40), b = Math.min(raw.length, i + 90);
  let s = (a ? '…' : '') + raw.slice(a, b) + (b < raw.length ? '…' : '');
  return s;
}
function highlight(text, q) {
  const terms = norm(q).split(/\s+/).filter(x => x.length > 0);
  let html = esc(text);
  if (!terms.length) return html;
  // Підсвічуємо за нормалізованим збігом, зберігаючи оригінальні символи
  const n = norm(text);
  const marks = [];
  for (const tm of terms) { let i = n.indexOf(tm); while (i >= 0) { marks.push([i, i + tm.length]); i = n.indexOf(tm, i + tm.length); } }
  if (!marks.length || n.length !== text.length) return html;
  marks.sort((a, b) => a[0] - b[0]);
  let out = '', pos = 0;
  for (const [a, b] of marks) { if (a < pos) continue; out += esc(text.slice(pos, a)) + '<mark>' + esc(text.slice(a, b)) + '</mark>'; pos = b; }
  return out + esc(text.slice(pos));
}

export function openPalette(ctx, initial = '') {
  if ($('.palette-wrap')) return;
  const wrap = h(`<div class="palette-wrap"><div class="palette" role="dialog" aria-label="${esc(t('nav.search'))}">
    <div class="pal-in">${icon('search')}<input placeholder="${esc(t('search.ph'))}" value="${esc(initial)}" autocomplete="off" spellcheck="false">${isNarrow() ? `<button class="btn-text" data-x>${t('misc.close')}</button>` : '<kbd>Esc</kbd>'}</div>
    <div class="pal-res" role="listbox"></div>
    <div class="pal-foot">${esc(t('search.hint'))}</div></div></div>`);
  document.body.appendChild(wrap);
  const inp = $('input', wrap), res = $('.pal-res', wrap);
  let items = [], act = 0;
  const commands = () => [
    { l: t('cmd.newNote'), i: 'notes', k: 'N', run: () => ctx.newNote() },
    { l: t('cmd.today'), i: 'today', k: 'T', run: () => ctx.go('#/cal/' + ctx.state.calView + '/' + todayYmd()) },
    { l: t('cmd.day'), i: 'calendar', k: 'D', run: () => ctx.go('#/cal/day/' + ctx.state.cursor) },
    { l: t('cmd.week'), i: 'calendar', k: 'W', run: () => ctx.go('#/cal/week/' + ctx.state.cursor) },
    { l: t('cmd.month'), i: 'calendar', k: 'M', run: () => ctx.go('#/cal/month/' + ctx.state.cursor) },
    { l: t('cmd.newSubject'), i: 'book', run: () => ctx.newSubjectModal() },
    { l: t('cmd.sync'), i: 'sync', run: () => ctx.syncNow() },
    { l: t('cmd.import'), i: 'download', run: () => ctx.importIcs() },
    { l: t('cmd.settings'), i: 'settings', k: ',', run: () => ctx.go('#/settings') },
    { l: t('cmd.trash'), i: 'trash', run: () => ctx.go('#/trash') },
    { l: t('cmd.conflicts'), i: 'alert', run: () => ctx.go('#/conflicts') },
    { l: t('cmd.theme'), i: 'moon', run: () => ctx.cycleTheme() },
    { l: t('cmd.lang'), i: 'info', run: () => ctx.setLang(getLang() === 'uk' ? 'en' : 'uk') },
  ];
  const draw = () => {
    const q = inp.value.trim();
    items = [];
    const nq = norm(q);
    if (!q) {
      const recent = store.entries().slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 6);
      items.push(...recent.map(e => ({ type: 'entry', e })));
      items.push(...commands().slice(0, 6).map(c => ({ type: 'cmd', c })));
    } else {
      const p = parseQuick(q, { today: todayYmd() });
      if (p.date && !p.title) items.push({ type: 'date', d: p.date });
      items.push(...store.subjects({ withArchived: true }).filter(s => norm(s.name).includes(nq)).slice(0, 4).map(s => ({ type: 'subj', s })));
      items.push(...search(q, 20).map(r => ({ type: 'entry', e: r.e, snippet: r.snippet })));
      items.push(...commands().filter(c => norm(c.l).includes(nq)).map(c => ({ type: 'cmd', c })));
    }
    act = Math.min(act, Math.max(0, items.length - 1));
    let html = '', lastType = null;
    const head = { entry: t('search.entries'), subj: t('search.subjects'), cmd: t('search.commands') };
    items.forEach((it, i) => {
      if (it.type !== lastType && head[it.type]) html += `<div class="pal-h">${esc(head[it.type])}</div>`;
      lastType = it.type;
      const cls = `pal-i ${i === act ? 'act' : ''}`;
      if (it.type === 'entry') {
        const s = store.subjectById(it.e.subject);
        const meta = [it.e.date ? (it.e.repeat ? t('entry.repeat') : shortDate(it.e.date)) : '', s ? s.name : ''].filter(Boolean).join(' · ');
        html += `<button class="${cls}" data-i="${i}">${icon(it.e.task ? 'todo' : it.e.date && !it.e.body ? 'calendar' : 'notes')}<span class="pal-main"><span class="pal-t">${highlight(it.e.title || t('entry.untitled'), q)}</span>${it.snippet ? `<span class="pal-s">${highlight(it.snippet, q)}</span>` : ''}</span>${meta ? `<span class="pal-m">${s ? `<i class="dot" style="--c:${cvar(s.color)}"></i>` : ''}${esc(meta)}</span>` : ''}</button>`;
      } else if (it.type === 'subj') html += `<button class="${cls}" data-i="${i}"><i class="dot lg" style="--c:${cvar(it.s.color)}"></i><span class="pal-main"><span class="pal-t">${highlight(it.s.name, q)}</span></span></button>`;
      else if (it.type === 'date') html += `<button class="${cls}" data-i="${i}">${icon('calendar')}<span class="pal-main"><span class="pal-t">${esc(t('search.goto', { d: dayLabel(it.d) }))}</span></span></button>`;
      else html += `<button class="${cls}" data-i="${i}">${icon(it.c.i)}<span class="pal-main"><span class="pal-t">${highlight(it.c.l, q)}</span></span>${it.c.k ? `<kbd>${it.c.k}</kbd>` : ''}</button>`;
    });
    res.innerHTML = html || `<p class="empty-t">${esc(t('search.empty'))}</p>`;
    const a = $('.act', res); a && a.scrollIntoView({ block: 'nearest' });
  };
  const close = () => { wrap.remove(); document.removeEventListener('keydown', key, true); };
  const run = it => {
    close();
    if (it.type === 'entry') ctx.open(openKey(it.e), { push: true });
    if (it.type === 'subj') ctx.go('#/subject/' + it.s.id);
    if (it.type === 'date') ctx.go('#/cal/day/' + it.d);
    if (it.type === 'cmd') it.c.run();
  };
  const key = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); act = Math.min(items.length - 1, act + 1); draw(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); act = Math.max(0, act - 1); draw(); }
    if (e.key === 'Enter' && items[act]) { e.preventDefault(); run(items[act]); }
  };
  document.addEventListener('keydown', key, true);
  inp.addEventListener('input', () => { act = 0; draw(); });
  res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) run(items[+b.dataset.i]); });
  res.addEventListener('pointermove', e => { const b = e.target.closest('[data-i]'); if (b && +b.dataset.i !== act) { act = +b.dataset.i; $$('.pal-i', res).forEach(x => x.classList.toggle('act', +x.dataset.i === act)); } });
  wrap.addEventListener('pointerdown', e => { if (e.target === wrap) close(); });
  const x = $('[data-x]', wrap); if (x) x.onclick = close;
  draw();
  setTimeout(() => { inp.focus(); inp.select(); }, 0);
}
