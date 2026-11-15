// Панель запису: назва, властивості-чипи, конспект (редактор), зворотні посилання, зміст.
// Для повторюваної пари, відкритої з календаря, головне — конспект саме цього заняття.
import * as store from '../store.js';
import { t, fmtDate, relTime } from '../i18n.js';
import { createEditor } from '../editor.js';
import { describeRepeat } from '../recur.js';
import { wikiTargets } from '../md.js';
import { tagsOf, allTags, folderPrompt } from './notes.js';
import { isoDow, todayYmd, addDays, debounce, timeToMin, minToTime, norm } from '../util.js';
import { esc, icon, h, $, $$, popover, menu, pickDate, toast, confirmBox, cvar, COLORS, spaceLabel, shortDate, dayLabel, isNarrow, locale } from '../ui.js';
import { compressImage } from '../image.js';

export function openPanel(host, key, ctx) {
  const [spaceId, id, occ] = key.split('|');
  let e = store.entry(spaceId, id);
  if (!e) return null;
  const isOcc = !!(occ && e.repeat);
  let tab = isOcc ? (ctx.tab || 'note') : 'entry';
  let editor = null;
  let note = isOcc ? findClassNote(e, occ) : null;
  let creatingNote = null;
  let titleSave = null;
  const el = h('<div class="pn"></div>');
  host.innerHTML = ''; host.appendChild(el);

  function findClassNote(series, date) { return store.entries({ all: true }).find(x => x.parent === series.id && x.occurrence === date && x.space === series.space) || null; }
  const target = () => (tab === 'note' && isOcc) ? note : e;

  function draw() {
    e = store.entry(spaceId, id) || e;
    const s = store.subjectById(e.subject);
    const sp = store.space(e.space);
    el.style.setProperty('--c', s ? cvar(s.color) : 'var(--accent)');
    const cur = target();
    el.innerHTML = `
      <header class="pn-h">
        <button class="icon-btn" data-pn="close" aria-label="${t('entry.close')}" title="Esc">${icon(isNarrow() ? 'left' : 'x')}</button>
        <span class="grow"></span>
        <span class="pn-space ${sp && sp.kind === 'shared' ? 'shared' : ''}">${icon(sp && sp.kind === 'shared' ? 'users' : 'lock')}${esc(spaceLabel(sp))}</span>
        <button class="icon-btn" data-pn="full" aria-label="${t('entry.openFull')}" title="${t('entry.openFull')}">${icon(ctx.isFull() ? 'collapse' : 'expand')}</button>
        <button class="icon-btn" data-pn="more" aria-label="${t('nav.more')}">${icon('more')}</button>
      </header>
      <div class="pn-scroll"><div class="pn-wrap">
        <div class="pn-doc ${store.settings.noteWidth === 'wide' ? 'wide' : ''}">
          ${isOcc ? `<div class="occ-head">
              <div class="occ-t"><span class="occ-dot"></span>${esc(e.title || t('entry.untitled'))}</div>
              <div class="occ-m">${esc(dayLabel(occ))}${e.time ? ' · ' + esc(e.time + (e.end ? '–' + e.end : '')) : ''}${e.location ? ' · ' + esc(e.location) : ''}</div>
              <div class="seg sm"><button class="${tab === 'note' ? 'on' : ''}" data-tab="note">${icon('notes')}${t('entry.classNote')}</button><button class="${tab === 'entry' ? 'on' : ''}" data-tab="entry">${icon('repeat')}${t('entry.series')}</button></div>
            </div>` : ''}
          ${tab === 'entry' ? `<textarea class="pn-title" rows="1" placeholder="${t('entry.untitled')}" spellcheck="true">${esc(e.title || '')}</textarea>
          <div class="props">${propsHtml(e, s, sp)}</div>` : ''}
          <div class="pn-editor"></div>
          <footer class="pn-foot"></footer>
        </div>
        <aside class="pn-outline"></aside>
      </div></div>`;
    const title = $('.pn-title', el);
    if (title) {
      const save = titleSave = debounce(v => store.updateEntry(spaceId, id, { title: v }, { silent: false }), 400);
      const grow = () => { title.style.height = 'auto'; title.style.height = title.scrollHeight + 'px'; };
      title.addEventListener('input', () => { grow(); save(title.value); });
      title.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); save.flush(title.value); editor && editor.focus(); } if (ev.key === 'ArrowDown' && title.selectionStart === title.value.length) { ev.preventDefault(); editor && editor.focus(); } });
      title.addEventListener('blur', () => save.flush(title.value));
      requestAnimationFrame(grow);
    }
    mountEditor(cur);
    footer();
  }

  function mountEditor(cur) {
    if (editor) { editor.destroy(); editor = null; }
    const wrap = $('.pn-editor', el);
    const owner = cur || null;
    editor = createEditor(wrap, {
      markdown: owner ? owner.body || '' : '',
      font: store.settings.noteFont,
      onChange: async md => {
        if (tab === 'note' && isOcc) {
          if (!note) {
            if (!md.trim()) return;
            if (!creatingNote) creatingNote = store.createEntry({ title: `${e.title || t('entry.untitled')} · ${shortDate(occ)}`, parent: e.id, occurrence: occ, subject: e.subject, body: md }, e.space);
            note = await creatingNote; creatingNote = null; return;
          }
          await store.updateEntry(note.space, note.id, { body: md });
          note = store.entry(note.space, note.id);
        } else {
          await store.updateEntry(spaceId, id, { body: md });
        }
      },
      onStructure: () => outline(),
      resolveWiki: (wid, title) => { const x = store.findEntry(wid); return x ? (x.title || title) : title; },
      searchNotes: q => {
        const nq = norm(q);
        return store.entries().filter(x => x.id !== id && (!nq || norm(x.title).includes(nq))).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')).slice(0, 8).map(x => ({ id: x.id, title: x.title, space: x.space }));
      },
      createNote: async title => { const n = await store.createEntry({ title, subject: e.subject }, e.space); return { id: n.id, title }; },
      tagList: () => allTags(),
      openTag: tag => ctx.showTag(tag),
      openWiki: wid => { const x = store.findEntry(wid); if (x) ctx.open(`${x.space}|${x.id}`, { push: true }); },
      addImage: async file => { const { bytes, ext, mime } = await compressImage(file); return store.addAsset((target() || e).space, bytes, ext, mime); },
      imageURL: ref => store.assetURL((target() || e).space, ref),
    });
    if (ctx.focus === 'body' || (isOcc && tab === 'note')) setTimeout(() => editor && editor.focus(true), 30);
  }

  function propsHtml(e, s, sp) {
    const chip = (k, ic, label, on, extra = '') => `<button class="prop ${on ? 'on' : ''}" data-prop="${k}" ${extra}>${icon(ic)}<span>${esc(label)}</span></button>`;
    const dateL = e.date ? (e.endDate && e.endDate !== e.date ? `${shortDate(e.date)} – ${shortDate(e.endDate)}` : dayLabel(e.date, 'short')) : t('entry.noDate');
    const timeL = e.time ? (e.end ? `${e.time}–${e.end}` : e.time) : t('entry.allDay');
    const out = [
      chip('task', 'todo', e.task ? (e.done ? t('entry.done') : t('entry.task')) : t('entry.task'), e.task, e.task && e.done ? 'data-done="1"' : ''),
      chip('date', 'calendar', dateL, !!e.date),
      e.date ? chip('time', 'clock', timeL, !!e.time) : '',
      e.date ? chip('repeat', 'repeat', e.repeat ? describeRepeat(e.repeat, t, locale()) : t('entry.noRepeat'), !!e.repeat) : '',
      `<button class="prop ${s ? 'on subj' : ''}" data-prop="subject" ${s ? `style="--c:${cvar(s.color)}"` : ''}>${s ? '<i class="dot"></i>' : icon('book')}<span>${esc(s ? s.name : t('entry.noSubject'))}</span></button>`,
      store.spaces.length > 1 ? chip('space', sp && sp.kind === 'shared' ? 'users' : 'lock', spaceLabel(sp), true) : '',
      (() => { const f = store.folderById(e.folder); return chip('folder', 'folder', f ? store.folderPath(f.id).map(x => x.name).join(' / ') : t('entry.noFolder'), !!f); })(),
      chip('location', 'location', e.location || t('entry.location'), !!e.location),
    ];
    return out.join('');
  }

  function footer() {
    const f = $('.pn-foot', el); if (!f) return;
    const cur = target() || e;
    const back = store.entries().filter(x => x.body && wikiTargets(x.body).includes(cur.id));
    const words = editor ? editor.words() : 0;
    const tags = tagsOf(cur);
    f.innerHTML = `${tags.length ? `<div class="pn-tags">${tags.map(x => `<button class="tagchip" data-tag="${esc(x.key)}">#${esc(x.label)}</button>`).join('')}</div>` : ''}<div class="pn-meta"><span>${esc(t('entry.words', { n: words }))}</span>${cur.updatedAt ? `<span>${esc(t('entry.updated', { d: relTime(cur.updatedAt) }))}${cur.updatedBy ? ' ' + esc(t('entry.by', { u: cur.updatedBy })) : ''}</span>` : ''}</div>
      ${back.length ? `<div class="backlinks"><h5>${icon('backlink')}${t('entry.backlinks')}</h5>${back.map(x => `<button class="link-row" data-open="${esc(x.space + '|' + x.id)}">${icon('notes')}${esc(x.title || t('entry.untitled'))}</button>`).join('')}</div>` : ''}`;
  }
  function outline() {
    const o = $('.pn-outline', el); if (!o || !editor) return;
    const hs = editor.outline();
    o.innerHTML = hs.length > 1 ? `<h5>${t('entry.outline')}</h5>${hs.map(x => `<button class="ol-i l${x.level}" data-hd="${x.id}">${esc(x.text || '…')}</button>`).join('')}` : '';
    const f = $('.pn-meta span', el); if (f) f.textContent = t('entry.words', { n: editor.words() });
  }

  // ---- властивості ----
  async function prop(k, btn) {
    e = store.entry(spaceId, id);
    const upd = patch => store.updateEntry(spaceId, id, patch).then(() => draw());
    if (k === 'task') {
      if (!e.task) return upd({ task: true, done: false });
      menu(btn, [
        { label: e.done ? t('entry.task') : t('entry.done'), icon: 'check', act: () => upd({ done: !e.done }) },
        { label: t('entry.toNote'), icon: 'x', act: () => upd({ task: false, done: false }) },
      ]);
    }
    if (k === 'date') pickDate(btn, e.date, d => d ? upd({ date: d, ...(e.endDate && e.endDate < d ? { endDate: null } : {}) }) : upd({ date: null, time: null, end: null, repeat: null, endDate: null }), { allowNone: true });
    if (k === 'time') timePop(btn, e, upd);
    if (k === 'repeat') repeatMenu(btn, e, upd);
    if (k === 'subject') subjectMenu(btn, e, upd);
    if (k === 'space') spaceMenu(btn, e);
    if (k === 'folder') {
      const fs = store.folders();
      const depth = f => store.folderPath(f.id).length - 1;
      const ordered = []; const walk = p => fs.filter(f => (f.parent || null) === p).forEach(f => { ordered.push(f); walk(f.id); }); walk(null);
      fs.forEach(f => { if (!ordered.includes(f)) ordered.push(f); });
      menu(btn, [
        { label: t('entry.noFolder'), icon: 'inbox', active: !e.folder, act: () => upd({ folder: null }) },
        ...ordered.map(f => ({ label: '\u2003'.repeat(depth(f)) + f.name, icon: 'folder', active: e.folder === f.id, act: () => upd({ folder: f.id }) })),
        '-',
        { label: t('folder.new'), icon: 'plus', act: () => folderPrompt(btn, null, null, ctx, f => upd({ folder: f.id })) },
      ]);
    }
    if (k === 'location') {
      const box = h(`<form class="pop-form"><input value="${esc(e.location || '')}" placeholder="${esc(t('entry.location'))}"><button class="btn primary sm">${t('misc.ok')}</button></form>`);
      const p = popover(btn, box); const inp = $('input', box); setTimeout(() => inp.focus(), 0);
      box.onsubmit = ev => { ev.preventDefault(); p.close(); upd({ location: inp.value.trim() || null }); };
    }
  }
  function timePop(btn, e, upd) {
    const box = h(`<div class="time-pop">
      <div class="time-row"><input type="time" class="t-s" value="${e.time || ''}" step="300"><span>–</span><input type="time" class="t-e" value="${e.end || ''}" step="300"></div>
      <div class="dur">${[30, 45, 60, 90, 120].map(m => `<button class="chip" data-dur="${m}">${m < 60 ? t('misc.min', { n: m }) : t('misc.hours', { n: String(m / 60).replace('.', ',') })}</button>`).join('')}</div>
      <label class="field-sm">${t('entry.endDate')}<button class="chip" data-enddate>${e.endDate ? shortDate(e.endDate) : t('misc.none')}</button></label>
      <div class="row-end"><button class="btn" data-allday>${t('entry.allDay')}</button><button class="btn primary" data-ok>${t('misc.ok')}</button></div></div>`);
    const p = popover(btn, box);
    const s = $('.t-s', box), en = $('.t-e', box);
    let endDate = e.endDate || null;
    setTimeout(() => s.focus(), 0);
    s.addEventListener('change', () => { if (s.value && en.value && en.value <= s.value) en.value = minToTime(timeToMin(s.value) + 60); if (s.value && !en.value) en.value = minToTime(Math.min(timeToMin(s.value) + 60, 23 * 60 + 55)); });
    box.addEventListener('click', ev => {
      const d = ev.target.closest('[data-dur]');
      if (d) { if (!s.value) s.value = '09:00'; en.value = minToTime(Math.min(timeToMin(s.value) + +d.dataset.dur, 23 * 60 + 55)); }
      if (ev.target.closest('[data-allday]')) { p.close(); upd({ time: null, end: null, endDate }); }
      if (ev.target.closest('[data-ok]')) { p.close(); upd({ time: s.value || null, end: s.value && en.value > s.value ? en.value : null, endDate }); }
      const ed = ev.target.closest('[data-enddate]');
      if (ed) pickDate(ed, endDate || e.date, d2 => { endDate = d2 && d2 > e.date ? d2 : null; ed.textContent = endDate ? shortDate(endDate) : t('misc.none'); }, { allowNone: true });
    });
    box.addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); $('[data-ok]', box).click(); } });
  }
  function repeatMenu(btn, e, upd) {
    const dow = isoDow(e.date);
    const r = e.repeat || {};
    const is = (f, iv = 1) => r.freq === f && (r.interval || 1) === iv;
    menu(btn, [
      { label: t('entry.noRepeat'), active: !e.repeat, act: () => upd({ repeat: null }) },
      { label: t('rep.daily'), active: is('daily'), act: () => upd({ repeat: { freq: 'daily' } }) },
      { label: t('rep.weeklyOn', { days: t('dow.short.' + dow) }), active: is('weekly'), act: () => upd({ repeat: { freq: 'weekly', days: [dow] } }) },
      { label: t('rep.biweekly'), active: is('weekly', 2), act: () => upd({ repeat: { freq: 'weekly', interval: 2, days: [dow] } }) },
      { label: t('rep.monthly'), active: is('monthly'), act: () => upd({ repeat: { freq: 'monthly' } }) },
      { label: t('rep.yearly'), active: is('yearly'), act: () => upd({ repeat: { freq: 'yearly' } }) },
      '-',
      { label: t('rep.custom'), icon: 'settings', act: () => customRepeat(btn, e, upd) },
    ]);
  }
  function customRepeat(btn, e, upd) {
    const r = e.repeat || { freq: 'weekly', days: [isoDow(e.date)] };
    const days = new Set(r.days || [isoDow(e.date)]);
    let until = r.until || null;
    const box = h(`<div class="rep-pop">
      <div class="time-row"><span>${t('rep.interval')}</span><input type="number" min="1" max="52" class="r-iv" value="${r.interval || 1}">
      <select class="r-f">${['daily', 'weekly', 'monthly', 'yearly'].map(f => `<option value="${f}" ${r.freq === f ? 'selected' : ''}>${t('rep.' + f)}</option>`).join('')}</select></div>
      <div class="r-days">${[1, 2, 3, 4, 5, 6, 7].map(d => `<button class="chip ${days.has(d) ? 'on' : ''}" data-d="${d}">${t('dow.short.' + d)}</button>`).join('')}</div>
      <label class="field-sm">${t('rep.untilLabel')}<button class="chip" data-until>${until ? shortDate(until) : t('misc.none')}</button></label>
      <div class="row-end"><button class="btn primary" data-ok>${t('misc.save')}</button></div></div>`);
    const p = popover(btn, box);
    const f = $('.r-f', box), dd = $('.r-days', box);
    const vis = () => { dd.style.display = f.value === 'weekly' ? '' : 'none'; };
    vis(); f.onchange = vis;
    box.addEventListener('click', ev => {
      const d = ev.target.closest('[data-d]');
      if (d) { const n = +d.dataset.d; days.has(n) ? days.delete(n) : days.add(n); if (!days.size) days.add(n); d.classList.toggle('on', days.has(n)); }
      const u = ev.target.closest('[data-until]');
      if (u) pickDate(u, until || e.date, x => { until = x; u.textContent = x ? shortDate(x) : t('misc.none'); }, { allowNone: true });
      if (ev.target.closest('[data-ok]')) {
        p.close();
        const rep = { freq: f.value, interval: Math.max(1, +$('.r-iv', box).value || 1) };
        if (rep.interval === 1) delete rep.interval;
        if (f.value === 'weekly') rep.days = [...days].sort();
        if (until) rep.until = until;
        upd({ repeat: rep });
      }
    });
  }
  function subjectMenu(btn, e, upd) {
    const subs = store.subjects();
    menu(btn, [
      { label: t('entry.noSubject'), active: !e.subject, act: () => upd({ subject: null }) },
      ...subs.map(s => ({ label: s.name, dot: cvar(s.color), active: e.subject === s.id, act: () => upd({ subject: s.id }) })),
      '-',
      { label: t('subj.new'), icon: 'plus', act: () => ctx.newSubject(btn, s => upd({ subject: s.id })) },
    ]);
  }
  function spaceMenu(btn, e) {
    menu(btn, store.spaces.map(s => ({
      label: spaceLabel(s), icon: s.kind === 'shared' ? 'users' : 'lock', active: s.id === e.space,
      act: async () => {
        if (s.id === e.space) return;
        if (s.kind === 'shared' && !(await confirmBox(t('entry.shareWarn'), t('entry.shareWarnOk')))) return;
        await store.moveEntry(e.space, e.id, s.id);
        toast(t('entry.moved', { s: spaceLabel(s) }));
        ctx.open(`${s.id}|${e.id}${occ ? '|' + occ : ''}`, { replace: true });
      },
    })));
  }
  function moreMenu(btn) {
    e = store.entry(spaceId, id);
    const cur = target() || e;
    const items = [
      { label: e.pinned ? t('entry.unpin') : t('entry.pin'), icon: 'pin', act: () => store.updateEntry(spaceId, id, { pinned: !e.pinned }) },
      { label: t('entry.duplicate'), icon: 'copy', act: async () => { const { id: _, createdAt, updatedAt, createdBy, updatedBy, space, ...rest } = e; const n = await store.createEntry({ ...rest, title: (e.title || '') + ' (2)' }, e.space); ctx.open(`${n.space}|${n.id}`, { replace: true }); } },
      { label: t('ed.copyMd'), icon: 'copy', act: async () => { try { await navigator.clipboard.writeText((cur.title ? '# ' + cur.title + '\n\n' : '') + (editor ? editor.getMarkdown() : cur.body || '')); toast(t('ed.copied')); } catch { } } },
      { label: t('entry.history'), icon: 'history', act: () => ctx.history(cur) },
      '-',
      { header: t('set.noteFont') },
      ...['sans', 'serif', 'mono'].map(f => ({ label: t('set.font.' + f), active: store.settings.noteFont === f, act: () => { store.saveSettings({ noteFont: f }); editor && editor.setFont(f); } })),
      { label: store.settings.noteWidth === 'wide' ? t('set.width.normal') : t('set.width.wide'), icon: 'expand', act: () => { store.saveSettings({ noteWidth: store.settings.noteWidth === 'wide' ? 'normal' : 'wide' }); $('.pn-doc', el).classList.toggle('wide'); } },
      '-',
    ];
    if (isOcc) {
      items.push({ label: t('entry.skipThis'), icon: 'x', act: async () => { await store.updateEntry(spaceId, id, { exdates: [...new Set([...(e.exdates || []), occ])].sort() }); toast(t('entry.skipped', { d: shortDate(occ) }), { action: t('entry.undo'), onAction: () => store.updateEntry(spaceId, id, { exdates: (store.entry(spaceId, id).exdates || []).filter(x => x !== occ) }) }); ctx.close(); } });
      items.push({ label: t('entry.allSeries') + ': ' + t('entry.delete').toLowerCase(), icon: 'trash', danger: true, act: () => del() });
    } else items.push({ label: t('entry.delete'), icon: 'trash', danger: true, hint: 'Del', act: () => del() });
    menu(btn, items, { align: 'right' });
  }
  async function del() {
    e = store.entry(spaceId, id);
    if (e.repeat && !(await confirmBox(t('entry.deleteSeries'), t('misc.delete'), true))) return;
    await store.deleteEntry(spaceId, id);
    ctx.close(true);
    toast(t('entry.deleted', { t: e.title || t('entry.untitled') }), { action: t('entry.undo'), onAction: () => store.restoreEntry(spaceId, id) });
  }

  el.addEventListener('click', ev => {
    const a = ev.target.closest('[data-pn]');
    if (a) { const k = a.dataset.pn; if (k === 'close') ctx.close(); if (k === 'full') { ctx.toggleFull(); draw(); } if (k === 'more') moreMenu(a); return; }
    const p = ev.target.closest('[data-prop]'); if (p) { prop(p.dataset.prop, p); return; }
    const tb = ev.target.closest('[data-tab]'); if (tb && isOcc) { editor && editor.flush(); tab = tb.dataset.tab; draw(); return; }
    const hd = ev.target.closest('[data-hd]'); if (hd && editor) { editor.scrollTo(hd.dataset.hd); return; }
    const tg = ev.target.closest('.tagchip[data-tag]'); if (tg) { ctx.showTag(tg.dataset.tag); return; }
  });

  draw();
  if (!isOcc && ctx.focus === 'title') setTimeout(() => { const ti = $('.pn-title', el); ti && ti.focus(); }, 30);

  return {
    key, el,
    // Запис змінився деінде (синхронізація, інша вкладка): оновити властивості, але не чіпати текст під курсором
    refresh() {
      const fresh = store.entry(spaceId, id);
      if (!fresh) { ctx.close(true); return; }
      const curBefore = target();
      e = fresh;
      if (isOcc) note = findClassNote(e, occ) || note;
      const props = $('.props', el);
      if (props) props.innerHTML = propsHtml(e, store.subjectById(e.subject), store.space(e.space));
      const title = $('.pn-title', el);
      if (title && document.activeElement !== title && title.value !== (e.title || '')) title.value = e.title || '';
      const cur = target();
      if (editor && cur && !editor.isFocused() && !editor.hasPending() && (cur.body || '') !== editor.getMarkdown() && curBefore && curBefore.updatedAt !== cur.updatedAt) editor.setMarkdown(cur.body || '');
      const s = store.subjectById(e.subject); el.style.setProperty('--c', s ? cvar(s.color) : 'var(--accent)');
      footer(); outline();
    },
    close() {
      if (titleSave) { const ti = $('.pn-title', el); const cur = store.entry(spaceId, id); titleSave.cancel(); if (ti && cur && ti.value !== (cur.title || '')) store.updateEntry(spaceId, id, { title: ti.value }); }
      if (editor) { editor.flush(); editor.destroy(); editor = null; }
      // Порожній запис (без назви, тексту, дати) не залишаємо, хоч би як він з'явився
      const fresh = store.entry(spaceId, id);
      if (store.isBlank(fresh)) store.purgeEntry(spaceId, id);
    },
    focusTitle() { const ti = $('.pn-title', el); ti && ti.focus(); },
  };
}
