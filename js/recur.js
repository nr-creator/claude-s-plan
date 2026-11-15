// Повтори. Правило: { freq: 'daily'|'weekly'|'monthly'|'yearly', interval, days: [1..7], until: 'YYYY-MM-DD', count }
// occurrences() повертає дати початку всіх входжень запису, що зачіпають діапазон [from, to].
import { addDays, diffDays, isoDow, parseYmd, ymd, startOfWeek } from './util.js';

export function occurrences(e, from, to) {
  if (!e || !e.date) return [];
  const span = e.endDate && e.endDate > e.date ? diffDays(e.date, e.endDate) : 0;
  const lo = addDays(from, -span);
  const r = e.repeat;
  if (!r || !r.freq) return (e.date >= lo && e.date <= to) ? [e.date] : [];
  const ex = new Set(e.exdates || []);
  const out = [];
  const interval = Math.max(1, r.interval | 0 || 1);
  const until = r.until || '9999-12-31';
  const count = r.count | 0;
  const end = until < to ? until : to;
  let n = 0, guard = 0;
  const emit = d => {
    if (d < e.date) return true;
    if (d > until) return false;
    n++;
    if (count && n > count) return false;
    if (d > to) return false;
    if (d >= lo && !ex.has(d)) out.push(d);
    return true;
  };
  const start = e.date;
  if (r.freq === 'daily') {
    let d = start;
    if (!count && lo > start) { const k = Math.ceil(diffDays(start, lo) / interval); d = addDays(start, k * interval); }
    while (d <= end && guard++ < 20000) { if (!emit(d)) break; d = addDays(d, interval); }
  } else if (r.freq === 'weekly') {
    const days = (r.days && r.days.length ? [...r.days] : [isoDow(start)]).sort((a, b) => a - b);
    let w = startOfWeek(start, 1);
    if (!count && lo > w) { const k = Math.floor(diffDays(w, lo) / (7 * interval)); w = addDays(w, k * 7 * interval); }
    outer: while (w <= end && guard++ < 20000) {
      for (const dd of days) { const d = addDays(w, dd - 1); if (d < start) continue; if (!emit(d)) break outer; }
      w = addDays(w, 7 * interval);
    }
  } else if (r.freq === 'monthly' || r.freq === 'yearly') {
    const s = parseYmd(start); const day = s.getDate(), mon = s.getMonth(), yr = s.getFullYear();
    const step = r.freq === 'monthly' ? interval : 12 * interval;
    let i = 0;
    if (!count && lo > start) {
      const l = parseYmd(lo);
      const months = (l.getFullYear() - yr) * 12 + (l.getMonth() - mon);
      i = Math.max(0, Math.floor(months / step) - 1);
    }
    while (guard++ < 5000) {
      const total = mon + i * step; const y = yr + Math.floor(total / 12), m = ((total % 12) + 12) % 12;
      i++;
      const dt = new Date(y, m, day, 12);
      const d = ymd(new Date(y, m, 1, 12)).slice(0, 8) + String(day).padStart(2, '0');
      if (d > end) break;
      if (dt.getMonth() !== m) continue; // 31-ше у короткому місяці або 29.02 у невисокосному році — пропускаємо
      if (!emit(d)) break;
    }
  }
  return out;
}

// Чи це правило ще дає хоч одне входження в майбутньому
export function describeRepeat(r, t, locale) {
  if (!r || !r.freq) return '';
  const iv = r.interval > 1 ? r.interval : 1;
  let s;
  if (r.freq === 'weekly' && r.days && r.days.length) {
    const names = r.days.slice().sort().map(d => t('dow.short.' + d)).join(', ');
    s = iv > 1 ? t('rep.everyNWeeksOn', { n: iv, days: names }) : t('rep.weeklyOn', { days: names });
  } else s = iv > 1 ? t('rep.everyN.' + r.freq, { n: iv }) : t('rep.' + r.freq);
  if (r.until) s += ' ' + t('rep.until', { date: new Date(parseYmd(r.until)).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) });
  if (r.count) s += ' ' + t('rep.count', { n: r.count });
  return s;
}
