// «Сьогодні»: наступне заняття, прострочене, сьогодні і 7 днів уперед, задачі без дати.
import * as store from '../store.js';
import { t } from '../i18n.js';
import { todayYmd, addDays, timeToMin, nowMin } from '../util.js';
import { itemsIn, itemsOn, rowHtml, openKey, colorOf, subjectOf } from '../cal.js';
import { esc, icon, dayLabel, shortDate, fmtRange } from '../ui.js';

export function render(el) {
  const today = todayYmd();
  const to = addDays(today, 7);
  const items = itemsIn(today, to);
  const all = store.entries();
  let html = '<div class="agenda">';

  // Наступне заняття (найближча подія з часом протягом доби)
  const nm = nowMin();
  // Найближча подія з часом (спершу — з предметом, тобто заняття) у межах тижня
  const upcoming = items.filter(it => it.e.time && !it.e.task && (it.date > today || (timeToMin(it.e.end) || timeToMin(it.e.time) + 60) > nm));
  const next = upcoming.find(it => it.e.subject) || upcoming[0];
  if (next) {
    const s = subjectOf(next.e);
    const start = timeToMin(next.e.time);
    const mins = next.date === today ? start - nm : null;
    const when = next.date !== today ? dayLabel(next.date, 'short') : mins <= 0 ? t('agenda.now') : mins < 120 ? t('agenda.inMin', { n: mins }) : '';
    html += `<div class="next-card" style="--c:${colorOf(next.e)}" data-open="${esc(next.key)}" tabindex="0">
      <div class="next-l"><span class="next-k">${t('agenda.nextClass')}${when ? ' · ' + esc(when) : ''}</span>
      <span class="next-t">${esc(next.e.title || t('entry.untitled'))}</span>
      <span class="next-m">${esc(fmtRange(next.e.time, next.e.end))}${s ? ' · ' + esc(s.name) : ''}${next.e.location ? ' · ' + esc(next.e.location) : ''}</span></div>
      ${next.e.repeat ? `<button class="btn" data-open="${esc(next.key)}" data-tab="note" title="${t('entry.classNote')}">${icon('notes')}<span>${t('entry.classNote')}</span></button>` : ''}
    </div>`;
  }

  const overdue = all.filter(e => e.task && !e.done && !e.repeat && e.date && e.date < today && !e.parent).sort((a, b) => a.date.localeCompare(b.date));
  if (overdue.length) {
    html += `<section class="day overdue"><h3>${t('agenda.overdue')}</h3>${overdue.map(e => rowHtml({ e, key: openKey(e) }, { date: shortDate(e.date) })).join('')}</section>`;
  }

  let any = false;
  for (let d = today; d <= to; d = addDays(d, 1)) {
    const list = itemsOn(d, items);
    if (list.length) any = true;
    html += `<section class="day ${d === today ? 'is-today' : ''} ${list.length ? '' : 'empty'}" data-day="${d}">
      <h3><span>${esc(dayLabel(d))}</span>${d !== today && d !== addDays(today, 1) ? '' : `<span class="day-sub">${esc(shortDate(d))}</span>`}</h3>
      ${list.length ? list.map(it => rowHtml(it, { now: true, showAllDay: false })).join('') : (d === today ? `<p class="empty-t">${t('agenda.empty')}</p>` : '')}
    </section>`;
  }

  const loose = all.filter(e => e.task && !e.date && !e.done && !e.parent).sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  if (loose.length) html += `<section class="day"><h3>${t('agenda.noDate')}</h3>${loose.map(e => rowHtml({ e, key: openKey(e) })).join('')}</section>`;
  html += '</div>';
  el.innerHTML = html;
  if (!any && !overdue.length && !loose.length) el.querySelector('.agenda').classList.add('quiet');
}
