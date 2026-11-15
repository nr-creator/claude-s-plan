// Вікна імпорту (.ics / .zip з Google) та експорту (.ics).
import * as store from '../store.js';
import { t } from '../i18n.js';
import { parseIcs, resolveOverrides, toIcs } from '../ics.js';
import { unzip } from '../zip.js';
import { occurrences } from '../recur.js';
import { escInline } from '../md.js';
import { todayYmd, addDays, fromUtf8 } from '../util.js';
import { h, $, $$, esc, modal, toast, spaceLabel, cvar } from '../ui.js';

export function importDialog(ctx) {
  const body = h(`<div class="form">
    <p class="help">${esc(t('imp.help'))}</p>
    <label class="btn primary" style="align-self:flex-start">${t('imp.pick')}<input type="file" accept=".ics,.zip,text/calendar,application/zip" hidden></label>
    <div class="imp-res"></div></div>`);
  const m = modal(t('imp.title'), body, { wide: true });
  const res = $('.imp-res', body);
  $('input[type=file]', body).onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    res.innerHTML = `<p class="muted">${t('misc.loading')}</p>`;
    let cals = [];
    try {
      const buf = new Uint8Array(await f.arrayBuffer());
      const files = (buf[0] === 0x50 && buf[1] === 0x4b) ? (await unzip(buf)).filter(x => /\.ics$/i.test(x.name)) : [{ name: f.name, bytes: buf }];
      for (const x of files) {
        const c = parseIcs(fromUtf8(x.bytes));
        const events = resolveOverrides(c.events);
        if (events.length) cals.push({ name: c.name || x.name.replace(/\.ics$/i, '').replace(/_[^_]*@.*$/, ''), events });
      }
    } catch (err) { console.warn(err); }
    if (!cals.length) { res.innerHTML = `<p class="err">${t('imp.bad')}</p>`; return; }
    draw(cals);
  };
  let range = 'year';
  function draw(cals) {
    const subs = store.subjects();
    res.innerHTML = `<div class="field"><span>${t('imp.range')}</span><div class="seg">${['all', 'year', 'future'].map(r => `<button type="button" data-range="${r}" class="${r === range ? 'on' : ''}">${t('imp.range.' + r)}</button>`).join('')}</div></div>
      ${cals.map((c, i) => `<div class="imp-cal" data-i="${i}">
        <input type="checkbox" checked data-inc aria-label="${t('imp.include')}">
        <div><b>${esc(c.name)}</b><div class="muted sm">${t('imp.found', { n: c.events.length })} · ${t('imp.recurring', { n: c.events.filter(e => e.repeat).length })}</div></div>
        <select data-space aria-label="${t('imp.toSpace')}">${store.spaces.map(s => `<option value="${s.id}">${esc(spaceLabel(s))}</option>`).join('')}</select>
        <select data-subj aria-label="${t('imp.toSubject')}"><option value="">${t('entry.noSubject')}</option><option value="new">${esc(t('imp.newSubject', { s: c.name }))}</option>${subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select>
      </div>`).join('')}
      <div class="row-end"><button class="btn primary" data-run>${t('imp.run')}</button></div>`;
    res.onclick = async e => {
      const r = e.target.closest('[data-range]'); if (r) { range = r.dataset.range; $$('[data-range]', res).forEach(x => x.classList.toggle('on', x === r)); return; }
      if (!e.target.closest('[data-run]')) return;
      e.target.closest('[data-run]').disabled = true; e.target.closest('[data-run]').textContent = t('imp.working');
      let added = 0, skipped = 0;
      const today = todayYmd(), cutoff = range === 'all' ? '0000' : range === 'year' ? addDays(today, -365) : today;
      for (const row of $$('.imp-cal', res)) {
        if (!$('[data-inc]', row).checked) continue;
        const c = cals[+row.dataset.i];
        const space = $('[data-space]', row).value;
        let subject = $('[data-subj]', row).value || null;
        if (subject === 'new') subject = (await store.createSubject({ name: c.name }, space)).id;
        const batch = [];
        const existing = new Set(store.entries({ withDeleted: true, all: true }).filter(x => x.space === space && x.icsUid).map(x => x.icsUid));
        for (const ev of c.events) {
          const keep = !ev.repeat ? (ev.endDate || ev.date) >= cutoff : (!ev.repeat.until || ev.repeat.until >= cutoff) && (range === 'all' || occurrences(ev, cutoff, addDays(today, 3650)).length > 0);
          if (!keep) continue;
          const uidKey = ev.uid || `${ev.title}|${ev.date}|${ev.time || ''}`;
          if (existing.has(uidKey)) { skipped++; continue; }
          existing.add(uidKey);
          batch.push({
            title: ev.title, date: ev.date, endDate: ev.endDate || null, time: ev.time || null, end: ev.end || null,
            repeat: ev.repeat || null, exdates: ev.exdates || null, location: ev.location || null, subject,
            body: ev.body ? ev.body.split('\n').map(escInline).join('\n') : null, icsUid: uidKey,
          });
          added++;
        }
        await store.createEntries(batch, space);
      }
      m.close();
      toast(t('imp.done', { n: added, s: skipped }));
      ctx.go('#/cal/month/' + today);
    };
  }
}

export function exportDialog(ctx) {
  const subs = store.subjects({ withArchived: true });
  const body = h(`<div class="form">
    <label>${t('exp.subject')}<select data-s><option value="">${t('exp.all')}</option>${subs.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
    <div class="row-end"><button class="btn primary" data-run>${t('exp.run')}</button></div></div>`);
  const m = modal(t('exp.title'), body);
  $('[data-run]', body).onclick = () => {
    const sid = $('[data-s]', body).value;
    const list = store.entries({ all: true }).filter(e => e.date && !e.parent && (!sid || e.subject === sid));
    const name = sid ? store.subjectById(sid).name : t('app.name');
    const blob = new Blob([toIcs(list, name)], { type: 'text/calendar' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = (name || 'plan').replace(/[^\p{L}\p{N}]+/gu, '-') + '.ics';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    m.close();
  };
}
