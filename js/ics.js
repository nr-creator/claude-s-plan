// Формат iCalendar (.ics): читання (імпорт із Google, Outlook, розкладу університету) і запис (експорт).
import { ymd, addDays, timeToMin, minToTime } from './util.js';

const WIN_TZ = {
  'FLE Standard Time': 'Europe/Kyiv', 'E. Europe Standard Time': 'Europe/Chisinau', 'W. Europe Standard Time': 'Europe/Berlin',
  'Central European Standard Time': 'Europe/Warsaw', 'Central Europe Standard Time': 'Europe/Budapest', 'Romance Standard Time': 'Europe/Paris',
  'GMT Standard Time': 'Europe/London', 'GTB Standard Time': 'Europe/Bucharest', 'Russian Standard Time': 'Europe/Moscow',
  'Eastern Standard Time': 'America/New_York', 'Central Standard Time': 'America/Chicago', 'Pacific Standard Time': 'America/Los_Angeles', UTC: 'UTC',
};
const unesc = s => s.replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1');

function tzOffset(utcMs, tz) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(f.formatToParts(new Date(utcMs)).map(x => [x.type, x.value]));
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) - utcMs;
}
function zonedToUtc(y, mo, d, h, mi, s, tz) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, s);
  let off = tzOffset(guess, tz);
  let t = guess - off;
  const off2 = tzOffset(t, tz);
  if (off2 !== off) t = guess - off2;
  return t;
}
// Значення дати/часу → { date, time } у часовому поясі цього пристрою
function toLocal(value, params, defTz) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d, hh, mi, ss, z] = m;
  if (hh == null || params.VALUE === 'DATE') return { date: `${y}-${mo}-${d}`, allDay: true };
  let ms;
  let tz = params.TZID ? params.TZID.replace(/^"|"$/g, '') : (z ? 'UTC' : defTz);
  if (tz && WIN_TZ[tz]) tz = WIN_TZ[tz];
  if (z) ms = Date.UTC(+y, mo - 1, +d, +hh, +mi, +(ss || 0));
  else if (tz) { try { ms = zonedToUtc(+y, +mo, +d, +hh, +mi, +(ss || 0), tz); } catch { ms = null; } }
  if (ms == null) return { date: `${y}-${mo}-${d}`, time: `${hh}:${mi}` };
  const dt = new Date(ms);
  return { date: ymd(dt), time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`, ms };
}
function durationMs(s) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s.trim());
  if (!m) return 0;
  return (m[1] === '-' ? -1 : 1) * ((+m[2] || 0) * 7 * 864e5 + (+m[3] || 0) * 864e5 + (+m[4] || 0) * 36e5 + (+m[5] || 0) * 6e4 + (+m[6] || 0) * 1e3);
}
const DAYS = { MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6, SU: 7 };

function htmlToText(s) {
  if (!/<[a-z][\s\S]*>/i.test(s)) return s;
  return s.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<li[^>]*>/gi, '- ')
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (m, href, txt) => txt && txt !== href ? `${txt} (${href})` : href)
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n').trim();
}

export function parseIcs(text) {
  const lines = String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  const cal = { name: '', tz: null, events: [] };
  let ev = null, depth = [];
  for (const line of lines) {
    if (!line) continue;
    const i = line.indexOf(':'); if (i < 0) continue;
    const head = line.slice(0, i), value = line.slice(i + 1);
    const [nameRaw, ...ps] = head.split(';');
    const name = nameRaw.toUpperCase();
    const params = {}; for (const p of ps) { const k = p.indexOf('='); if (k > 0) params[p.slice(0, k).toUpperCase()] = p.slice(k + 1); }
    if (name === 'BEGIN') { depth.push(value.toUpperCase()); if (value.toUpperCase() === 'VEVENT') ev = { props: {}, exdate: [] }; continue; }
    if (name === 'END') { const d = depth.pop(); if (d === 'VEVENT' && ev) { cal.events.push(ev); ev = null; } continue; }
    if (!ev) {
      if (name === 'X-WR-CALNAME') cal.name = unesc(value);
      if (name === 'X-WR-TIMEZONE') cal.tz = value.trim();
      continue;
    }
    if (depth[depth.length - 1] !== 'VEVENT') continue; // VALARM усередині події пропускаємо
    if (name === 'EXDATE') { for (const v of value.split(',')) ev.exdate.push({ v, params }); continue; }
    ev.props[name] = { v: value, params };
  }
  let defTz = cal.tz;
  try { if (defTz) new Intl.DateTimeFormat('en', { timeZone: WIN_TZ[defTz] || defTz }); } catch { defTz = null; }
  const out = [];
  for (const e of cal.events) {
    const P = e.props;
    if (!P.DTSTART) continue;
    const st = toLocal(P.DTSTART.v, P.DTSTART.params, defTz); if (!st) continue;
    const item = { uid: P.UID ? P.UID.v.trim() : null, title: P.SUMMARY ? unesc(P.SUMMARY.v).trim() : '', body: P.DESCRIPTION ? htmlToText(unesc(P.DESCRIPTION.v)) : '', location: P.LOCATION ? unesc(P.LOCATION.v).trim() : '', date: st.date, cancelled: P.STATUS && /CANCELLED/i.test(P.STATUS.v) };
    let en = P.DTEND ? toLocal(P.DTEND.v, P.DTEND.params, defTz) : null;
    if (!en && P.DURATION) {
      const dur = durationMs(P.DURATION.v);
      if (st.allDay) en = { date: addDays(st.date, Math.round(dur / 864e5)), allDay: true };
      else if (st.ms != null) { const d2 = new Date(st.ms + dur); en = { date: ymd(d2), time: `${String(d2.getHours()).padStart(2, '0')}:${String(d2.getMinutes()).padStart(2, '0')}` }; }
    }
    if (st.allDay) {
      if (en && en.date > addDays(st.date, 1)) item.endDate = addDays(en.date, -1);
    } else {
      item.time = st.time;
      if (en) {
        if (en.date === st.date) { if (en.time > st.time) item.end = en.time; }
        else if (en.date === addDays(st.date, 1) && en.time === '00:00') item.end = '23:59';
        else if (en.date > st.date) { item.endDate = en.time === '00:00' ? addDays(en.date, -1) : en.date; if (en.time !== '00:00') item.end = en.time; }
      }
    }
    if (P.RRULE) {
      const r = Object.fromEntries(P.RRULE.v.split(';').map(x => x.split('=')).map(([k, v]) => [k.toUpperCase(), v]));
      const freq = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }[r.FREQ];
      if (freq) {
        const rep = { freq };
        if (+r.INTERVAL > 1) rep.interval = +r.INTERVAL;
        if (freq === 'weekly' && r.BYDAY) rep.days = [...new Set(r.BYDAY.split(',').map(d => DAYS[d.replace(/^[+-]?\d+/, '')]).filter(Boolean))].sort();
        if (r.COUNT) rep.count = +r.COUNT;
        if (r.UNTIL) { const u = toLocal(r.UNTIL, {}, defTz); if (u) rep.until = u.date; }
        item.repeat = rep;
        if (freq === 'monthly' && r.BYDAY) item.approxRepeat = true; // «другий вівторок місяця» наближено до того самого числа
      }
    }
    if (e.exdate.length) item.exdates = [...new Set(e.exdate.map(x => (toLocal(x.v, x.params, defTz) || {}).date).filter(Boolean))].sort();
    if (P['RECURRENCE-ID']) { const r = toLocal(P['RECURRENCE-ID'].v, P['RECURRENCE-ID'].params, defTz); if (r) item.recurrenceOf = r.date; }
    out.push(item);
  }
  return { name: cal.name, events: out };
}

// Окремі зміни повторюваних подій (RECURRENCE-ID) перетворюємо на пропуск у серії + окрему подію
export function resolveOverrides(events) {
  const masters = new Map();
  for (const e of events) if (!e.recurrenceOf && e.uid) masters.set(e.uid, e);
  const out = [];
  for (const e of events) {
    if (!e.recurrenceOf) { if (!e.cancelled) out.push(e); continue; }
    const m = masters.get(e.uid);
    if (m) m.exdates = [...new Set([...(m.exdates || []), e.recurrenceOf])].sort();
    if (!e.cancelled) out.push({ ...e, uid: e.uid + '_' + e.recurrenceOf, repeat: undefined });
  }
  return out;
}

// ---- Експорт ----
const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');
function fold(line) {
  const out = []; let cur = '';
  for (const ch of line) { if (new TextEncoder().encode(cur + ch).length > 74) { out.push(cur); cur = ' ' + ch; } else cur += ch; }
  out.push(cur); return out.join('\r\n');
}
const dt = (d, t) => d.replace(/-/g, '') + (t ? 'T' + t.replace(':', '') + '00' : '');
export function toIcs(entries, name) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Plan//UK', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`, `X-WR-TIMEZONE:${tz}`];
  for (const e of entries) {
    if (!e.date) continue;
    L.push('BEGIN:VEVENT', `UID:${e.icsUid || e.id + '@plan'}`, `DTSTAMP:${stamp}`);
    if (e.time) {
      L.push(`DTSTART;TZID=${tz}:${dt(e.date, e.time)}`);
      const end = e.end || minToTime(Math.min(timeToMin(e.time) + 60, 23 * 60 + 59));
      L.push(`DTEND;TZID=${tz}:${dt(e.endDate || e.date, end)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${dt(e.date)}`, `DTEND;VALUE=DATE:${dt(addDays(e.endDate || e.date, 1))}`);
    }
    if (e.repeat) {
      const r = e.repeat; const parts = [`FREQ=${r.freq.toUpperCase()}`];
      if (r.interval > 1) parts.push('INTERVAL=' + r.interval);
      if (r.freq === 'weekly' && r.days) parts.push('BYDAY=' + r.days.map(d => Object.keys(DAYS)[d - 1]).join(','));
      if (r.count) parts.push('COUNT=' + r.count);
      if (r.until) parts.push('UNTIL=' + dt(r.until) + (e.time ? 'T235959Z' : ''));
      L.push('RRULE:' + parts.join(';'));
      for (const x of e.exdates || []) L.push(e.time ? `EXDATE;TZID=${tz}:${dt(x, e.time)}` : `EXDATE;VALUE=DATE:${dt(x)}`);
    }
    L.push(`SUMMARY:${esc(e.title)}`);
    if (e.location) L.push(`LOCATION:${esc(e.location)}`);
    if (e.body) L.push(`DESCRIPTION:${esc(e.body)}`);
    if (e.task) L.push(`STATUS:${e.done ? 'CANCELLED' : 'CONFIRMED'}`);
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.map(fold).join('\r\n') + '\r\n';
}
