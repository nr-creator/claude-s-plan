// Швидке додавання. Один рядок → запис. Розпізнані частини видно чипами; кнопки вибирають простір.
import * as store from './store.js';
import { t, fmtDate } from './i18n.js';
import { parseQuick } from './parse.js';
import { describeRepeat } from './recur.js';
import { todayYmd } from './util.js';
import { esc, icon, h, $, $$, toast, cvar, spaceLabel, dayLabel, isNarrow, locale, spaceIcon, spaceColor, menu } from './ui.js';
import { openKey } from './cal.js';

export function mountQuickAdd(host, ctx) {
  const el = h(`<form class="qa" autocomplete="off">
    <div class="qa-box">
      <div class="qa-ctx" hidden></div>
      <input class="qa-in" enterkeyhint="done" aria-label="${esc(t('qa.placeholderShort'))}">
      <div class="qa-btns"></div>
    </div>
    <div class="qa-chips" aria-live="polite"></div>
  </form>`);
  host.appendChild(el);
  const inp = $('.qa-in', el), chipsEl = $('.qa-chips', el), btns = $('.qa-btns', el), ctxEl = $('.qa-ctx', el);
  let ignore = new Set(), parsed = null, preset = null, chosen = null;

  const placeholder = () => { inp.placeholder = isNarrow() ? t('qa.placeholderShort') : t('qa.placeholder'); };
  placeholder();

  // Простори в рядку: усі, крім прихованих у налаштуваннях (хоча б один лишається завжди)
  const targets = () => {
    const hid = new Set(store.settings.qaHidden || []);
    const v = store.spaces.filter(s => !hid.has(s.id));
    return v.length ? v : [store.personalSpace()];
  };
  // Простір для Enter: простір предмета, якщо предмет обрано; інакше — перший видимий особистий
  const defaultTarget = () => {
    if (chosen) return chosen;
    const sid = parsed && parsed.subject && parsed.subject.id;
    const s = sid && store.subjectById(sid);
    if (s) return s.space;
    if (preset && preset.space) return preset.space;
    const ts = targets();
    return (ts.find(x => x.kind === 'personal') || ts[0]).id;
  };

  // Кнопка простору: тло — колір простору, значок — його значок, підпис — за бажанням
  const btnStyle = s => { const c = spaceColor(s); return `--c:${c};--on:${c === 'var(--accent)' ? 'var(--on-accent)' : 'var(--surface)'}`; };
  const label = s => s.name || (s.kind === 'shared' ? t('qa.shared') : t('qa.private'));
  function drawBtns() {
    const ts = targets();
    const def = defaultTarget();
    const S = store.settings;
    btns.classList.toggle('labels', !!S.qaLabels);
    if (store.spaces.length < 2 || ts.length < 2) {
      const s = ts[0];
      btns.innerHTML = `<button type="button" class="qa-go" data-space="${s.id}" style="${btnStyle(s)}" aria-label="${esc(t('qa.add'))}" title="${esc(t('qa.add'))}">${icon('plus')}<span>${t('qa.add')}</span></button>`;
      return;
    }
    if (S.qaMode === 'menu') {
      const s = store.space(def) || ts[0];
      btns.innerHTML = `<button type="button" class="qa-go" data-qa-menu style="${btnStyle(s)}" aria-haspopup="menu" aria-label="${esc(t('qa.where'))}" title="${esc(t('qa.where'))}">${icon('plus')}<span>${t('qa.add')}</span>${icon('down', 'qa-caret')}</button>`;
      return;
    }
    btns.innerHTML = ts.map(s => `<button type="button" class="qa-go ${s.id === def ? 'def' : ''}" data-space="${s.id}" style="${btnStyle(s)}" title="${esc(t('qa.addTo', { s: spaceLabel(s) }))}" aria-label="${esc(t('qa.addTo', { s: spaceLabel(s) }))}">${icon(spaceIcon(s))}<span>${esc(label(s))}</span></button>`).join('');
  }
  function spaceMenuQa(btn) {
    const def = defaultTarget();
    menu(btn, [{ header: t('qa.where') }, ...targets().map(s => ({ label: spaceLabel(s), icon: spaceIcon(s), active: s.id === def, act: () => { chosen = null; submit(s.id); } }))], { align: 'right' });
  }

  function drawChips() {
    const v = inp.value;
    parsed = v.trim() ? parseQuick(v, { today: todayYmd(), subjects: store.subjects(), ignore }) : null;
    const chips = [];
    if (preset && preset.date) {
      ctxEl.hidden = false;
      ctxEl.innerHTML = `${icon('calendar')}<span>${esc(dayLabel(preset.date, 'short'))}${preset.time ? ', ' + esc(preset.time + (preset.end ? '–' + preset.end : '')) : ''}</span><button type="button" class="qa-x" data-unpreset aria-label="${esc(t('misc.close'))}">${icon('x')}</button>`;
    } else ctxEl.hidden = true;
    if (parsed) {
      for (const c of parsed.chips) {
        let label = '', ic = '';
        if (c.kind === 'date') { label = dayLabel(c.date, 'short'); ic = 'calendar'; }
        if (c.kind === 'time') { label = c.end ? `${c.time}–${c.end}` : c.time; ic = 'clock'; }
        if (c.kind === 'repeat') { label = describeRepeat({ ...c.repeat, days: (parsed.repeat || {}).days || c.repeat.days }, t, locale()); ic = 'repeat'; }
        if (c.kind === 'task') { label = t('qa.task'); ic = 'todo'; }
        if (c.kind === 'subject') {
          const s = c.subject.id && store.subjectById(c.subject.id);
          chips.push(`<button type="button" class="chip on subj" data-ign="subject" title="${esc(t('qa.chip.remove'))}" ${s ? `style="--c:${cvar(s.color)}"` : ''}><i class="dot"></i>${esc(c.subject.name)}</button>`);
          continue;
        }
        chips.push(`<button type="button" class="chip on" data-ign="${c.kind}" title="${esc(t('qa.chip.remove'))}">${icon(ic)}${esc(label)}</button>`);
      }
      for (const tg of parsed.tags || []) chips.push(`<span class="chip tagchip">#${esc(tg)}</span>`);
      if (!parsed.chips.some(c => c.kind === 'date') && parsed.date && !(preset && preset.date)) chips.unshift(`<span class="chip ghost">${icon('calendar')}${esc(dayLabel(parsed.date, 'short'))}</span>`);
    }
    const ts = targets();
    if (v.trim() && ts.length > 1 && !isNarrow()) {
      const def = defaultTarget(); const other = ts.find(s => s.id !== def);
      chips.push(`<span class="qa-hint">${esc(t('qa.hint', { a: spaceLabel(store.space(def)), b: spaceLabel(other) }))}</span>`);
    }
    chipsEl.innerHTML = chips.join('');
    el.classList.toggle('has-chips', !!chips.length);
    drawBtns();
  }

  async function submit(spaceId, openAfter) {
    const v = inp.value.trim();
    if (!v && !openAfter) { inp.focus(); return; }
    const p = v ? parseQuick(v, { today: todayYmd(), subjects: store.subjects(), ignore }) : { title: '' };
    const fields = { title: p.title || (v && !p.title ? '' : ''), body: undefined };
    if (!p.title && v) fields.title = v; // усе розпізнано як дату — назвою лишається весь текст
    if (p.title) fields.title = p.title;
    const base = preset || {};
    fields.date = p.date || base.date || null;
    fields.time = p.time || (p.date ? null : base.time) || null;
    fields.end = p.end || (p.time ? null : (p.date ? null : base.end)) || null;
    if (p.repeat) fields.repeat = p.repeat;
    if (p.task) fields.task = true;
    let sid = spaceId || defaultTarget();
    if (p.subject) {
      if (p.subject.id) fields.subject = p.subject.id;

    } else if (base.subject) fields.subject = base.subject;
    if (!fields.date) { fields.time = null; fields.end = null; }
    const e = await store.createEntry(fields, sid);
    inp.value = ''; ignore = new Set(); preset = null; chosen = null; drawChips();
    const sp = store.space(sid);
    if (openAfter) { ctx.open(openKey(e), { isNew: !v, focus: v ? 'body' : 'title', push: true }); return; }
    toast(sp && sp.kind === 'shared' ? t('qa.addedShared', { s: spaceLabel(sp), t: e.title || t('entry.untitled') }) : t('qa.added', { t: e.title || t('entry.untitled') }), { action: t('misc.show'), onAction: () => ctx.open(openKey(e), { push: true }) });
    ctx.afterAdd && ctx.afterAdd(e);
  }

  inp.addEventListener('input', drawChips);
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const def = defaultTarget();
      const other = targets().find(s => s.id !== def);
      if (e.shiftKey) { submit(def, true); return; }
      submit((e.ctrlKey || e.metaKey) && other ? other.id : def);
    }
    if (e.key === 'Escape') { inp.value = ''; preset = null; ignore = new Set(); drawChips(); inp.blur(); }
  });
  el.addEventListener('submit', e => { e.preventDefault(); submit(defaultTarget()); });
  el.addEventListener('click', e => {
    const g = e.target.closest('[data-space]'); if (g) { e.preventDefault(); chosen = null; submit(g.dataset.space); return; }
    const m = e.target.closest('[data-qa-menu]'); if (m) { e.preventDefault(); spaceMenuQa(m); return; }
    const c = e.target.closest('[data-ign]'); if (c) { ignore.add(c.dataset.ign); drawChips(); inp.focus(); return; }
    if (e.target.closest('[data-unpreset]')) { preset = null; drawChips(); inp.focus(); }
  });
  addEventListener('resize', placeholder);
  // Натискання кнопки не забирає фокус із поля: клавіатура на телефоні лишається відкритою
  btns.addEventListener('pointerdown', e => { if (e.target.closest('button')) e.preventDefault(); });
  store.on('spaces', drawChips);
  store.on('settings', drawChips);
  drawChips();

  return {
    el,
    focus(p) { if (p) { preset = p; drawChips(); } inp.focus(); },
    preset(p) { preset = p; drawChips(); inp.focus(); },
    redraw: drawChips,
  };
}
