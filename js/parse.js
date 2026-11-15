// Розбір рядка швидкого додавання: «завтра 10:00-11:30 #матан лекція» → дата, час, предмет, назва.
// Кожен розпізнаний шматок стає «чипом». Якщо розпізнано неправильно, чип можна вимкнути (ignore).
import { addDays, addMonths, isoDow, ymd, norm } from './util.js';

const B = '(?<![\\p{L}\\p{N}])', E = '(?![\\p{L}\\p{N}])';
const AP = "['’ʼ]?";
const WD = [
  [1, ['понеділками', 'понеділках', 'понеділка', 'понеділок', 'пон', 'пн', 'monday', 'mon']],
  [2, ['вівторками', 'вівторках', 'вівторка', 'вівторок', 'вів', 'вт', 'tuesday', 'tues', 'tue']],
  [3, ['середами', 'середах', 'середу', 'середи', 'середа', 'сер', 'ср', 'wednesday', 'wed']],
  [4, ['четвергами', 'четвергах', 'четверга', 'четвер', 'чет', 'чт', 'thursday', 'thurs', 'thur', 'thu']],
  [5, [`п${AP}ятницями`, `п${AP}ятницях`, `п${AP}ятницю`, `п${AP}ятниці`, `п${AP}ятниця`, `п${AP}ят`, 'пт', 'friday', 'fri']],
  [6, ['суботами', 'суботах', 'суботу', 'суботи', 'субота', 'суб', 'сб', 'saturday', 'sat']],
  [7, ['неділями', 'неділях', 'неділю', 'неділі', 'неділя', 'нед', 'нд', 'sunday', 'sun']],
];
const WD_RE = '(' + WD.flatMap(([, f]) => f).sort((a, b) => b.length - a.length).join('|') + ')';
const wdOf = s => {
  const x = s.toLowerCase().replace(/['’ʼ]/g, '');
  for (const [n, forms] of WD) for (const f of forms) if (new RegExp('^' + f.replace(/\[.*?\]\?/g, '') + '$', 'u').test(x)) return n;
  return null;
};
const MONTHS = [
  ['січня', 'січень', 'січ', 'january', 'jan'], ['лютого', 'лютий', 'лют', 'february', 'feb'], ['березня', 'березень', 'бер', 'march', 'mar'],
  ['квітня', 'квітень', 'квіт', 'april', 'apr'], ['травня', 'травень', 'трав', 'may'], ['червня', 'червень', 'черв', 'june', 'jun'],
  ['липня', 'липень', 'лип', 'july', 'jul'], ['серпня', 'серпень', 'серп', 'august', 'aug'], ['вересня', 'вересень', 'вер', 'september', 'sept', 'sep'],
  ['жовтня', 'жовтень', 'жовт', 'october', 'oct'], ['листопада', 'листопад', 'лист', 'november', 'nov'], ['грудня', 'грудень', 'груд', 'december', 'dec'],
];
const MON_RE = '(' + MONTHS.flat().sort((a, b) => b.length - a.length).join('|') + ')\\.?';
const monOf = s => { s = s.toLowerCase().replace(/\.$/, ''); return MONTHS.findIndex(f => f.includes(s)) + 1; };
const NUMW = { 'один': 1, 'одну': 1, 'одна': 1, 'два': 2, 'дві': 2, 'три': 3, 'чотири': 4, "п'ять": 5, 'пять': 5, 'one': 1, 'two': 2, 'three': 3, 'four': 4, 'five': 5 };

const mk = (y, m, d) => {
  const dt = new Date(y, m - 1, d, 12);
  return (dt.getMonth() === m - 1 && dt.getDate() === d) ? ymd(dt) : null;
};
const inferYear = (m, d, today) => {
  const y = +today.slice(0, 4);
  const cand = mk(y, m, d); if (!cand) return mk(y + 1, m, d);
  // Дата більш ніж на 60 днів у минулому — швидше за все, мається на увазі наступний рік
  return cand < addDays(today, -60) ? mk(y + 1, m, d) : cand;
};
const hm = (h, m = 0, ap) => {
  h = +h; m = +m;
  if (ap) { ap = ap.toLowerCase(); if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; }
  if (h > 23 || m > 59) return null;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
};
const upcoming = (dow, today, strictNextWeek) => {
  const cur = isoDow(today);
  let delta = (dow - cur + 7) % 7;
  if (strictNextWeek && delta === 0) delta = 7;
  return addDays(today, delta);
};

const SEP = '\\s*(?:,|\\s(?:і|й|та|and)\\s|&)\\s*';

function matchers(today) {
  return [
    { kind: 'task', re: new RegExp(`^\\s*(?:\\[\\s?\\]|!)\\s*`, 'u'), fn: () => ({ task: true }) },
    { kind: 'repeat', re: new RegExp(`${B}(щодня|щоденно|кожного дня|кожен день|every day|daily)${E}`, 'iu'), fn: () => ({ repeat: { freq: 'daily' } }) },
    {
      kind: 'repeat', re: new RegExp(`${B}(?:що|кожн(?:ий|ого|у|ої)\\s+|по\\s+|every\\s+)${WD_RE}((?:(?:${SEP}|\\s+що?)${WD_RE})*)${E}`, 'iu'),
      fn: m => {
        const days = [wdOf(m[1])]; const rest = m[2] || '';
        for (const x of rest.split(new RegExp(`${SEP}|\\s+що?`, 'iu'))) { const d = x && wdOf(x.trim()); if (d) days.push(d); }
        return { repeat: { freq: 'weekly', days: [...new Set(days.filter(Boolean))].sort() } };
      },
    },
    { kind: 'repeat', re: new RegExp(`${B}(кожні\\s+(?:2|два)\\s+тижні|раз на (?:2|два) тижні|every other week|every 2 weeks|biweekly)${E}`, 'iu'), fn: () => ({ repeat: { freq: 'weekly', interval: 2 } }) },
    { kind: 'repeat', re: new RegExp(`${B}(щотижня|щотижнево|кожного тижня|кожен тиждень|every week|weekly)${E}`, 'iu'), fn: () => ({ repeat: { freq: 'weekly' } }) },
    { kind: 'repeat', re: new RegExp(`${B}(щомісяця|щомісячно|кожного місяця|every month|monthly)${E}`, 'iu'), fn: () => ({ repeat: { freq: 'monthly' } }) },
    { kind: 'repeat', re: new RegExp(`${B}(щороку|щорічно|кожного року|every year|yearly|annually)${E}`, 'iu'), fn: () => ({ repeat: { freq: 'yearly' } }) },
    // Діапазон часу: 10:00-11:30, з 9 до 10:30, 9:00–10
    {
      kind: 'time', re: new RegExp(`${B}(?:(?:о|об|з|із|from|at)\\s+)?(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?\\s*(?:-|–|—|до|to|till)\\s*(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm)?${E}`, 'iu'),
      fn: m => {
        if (m[2] == null && m[5] == null && !m[3] && !m[6] && !/^(з|із|from)\s/iu.test(m[0])) return null;
        if (m[2] != null && m[5] == null && !m[6] && +m[4] > 23) return null;
        const a = hm(m[1], m[2] || 0, m[3] || m[6]), b = hm(m[4], m[5] || 0, m[6]);
        return a && b && b > a ? { time: a, end: b } : null;
      },
    },
    { kind: 'time', re: new RegExp(`${B}(?:о|об|at)\\s+(\\d{1,2})(?:[:.](\\d{2}))?\\s*(am|pm|год(?:ині)?|h)?${E}`, 'iu'), fn: m => { const x = hm(m[1], m[2] || 0, /am|pm/i.test(m[3] || '') ? m[3] : null); return x && { time: x }; } },
    { kind: 'time', re: new RegExp(`${B}(\\d{1,2}):(\\d{2})\\s*(am|pm)?${E}`, 'iu'), fn: m => { const x = hm(m[1], m[2], m[3]); return x && { time: x }; } },
    { kind: 'time', re: new RegExp(`${B}(\\d{1,2})\\s*(am|pm)${E}`, 'iu'), fn: m => { const x = hm(m[1], 0, m[2]); return x && { time: x }; } },
    // Дати
    { kind: 'date', re: new RegExp(`${B}(сьогодні|сьогодня|today)${E}`, 'iu'), fn: () => ({ date: today }) },
    { kind: 'date', re: new RegExp(`${B}(післязавтра|day after tomorrow)${E}`, 'iu'), fn: () => ({ date: addDays(today, 2) }) },
    { kind: 'date', re: new RegExp(`${B}(завтра|tomorrow|tmrw)${E}`, 'iu'), fn: () => ({ date: addDays(today, 1) }) },
    { kind: 'date', re: new RegExp(`${B}(вчора|yesterday)${E}`, 'iu'), fn: () => ({ date: addDays(today, -1) }) },
    {
      kind: 'date', re: new RegExp(`${B}(?:через|in)\\s+(\\d{1,3}|${Object.keys(NUMW).join('|')})?\\s*(дні|днів|дня|день|тижні|тижнів|тижня|тиждень|місяці|місяців|місяця|місяць|days?|weeks?|months?)${E}`, 'iu'),
      fn: m => {
        const n = m[1] ? (+m[1] || NUMW[m[1].toLowerCase()] || 1) : 1; const u = m[2].toLowerCase();
        if (/^(д|day)/.test(u)) return { date: addDays(today, n) };
        if (/^(т|week)/.test(u)) return { date: addDays(today, 7 * n) };
        return { date: addMonths(today, n) };
      },
    },
    { kind: 'date', re: new RegExp(`${B}(?:наступн(?:ий|ого|у|ої|а|е)|next)\\s+${WD_RE}${E}`, 'iu'), fn: m => ({ date: upcoming(wdOf(m[1]), today, true) }) },
    { kind: 'date', re: new RegExp(`${B}(\\d{4})-(\\d{2})-(\\d{2})${E}`, 'u'), fn: m => { const d = mk(+m[1], +m[2], +m[3]); return d && { date: d }; } },
    {
      kind: 'date', re: new RegExp(`${B}(\\d{1,2})[./](\\d{1,2})(?:[./](\\d{2,4}))?${E}`, 'u'),
      fn: m => {
        const d = +m[1], mo = +m[2]; if (mo < 1 || mo > 12 || d < 1) return null;
        let y = m[3] ? +m[3] : null; if (y && y < 100) y += 2000;
        const r = y ? mk(y, mo, d) : inferYear(mo, d, today); return r && { date: r };
      },
    },
    { kind: 'time', re: new RegExp(`${B}(\\d{1,2})\\.(\\d{2})${E}`, 'u'), fn: m => (+m[2] > 12 ? (hm(m[1], m[2]) && { time: hm(m[1], m[2]) }) : null) },
    {
      kind: 'date', re: new RegExp(`${B}(\\d{1,2})(?:-?(?:го|st|nd|rd|th))?\\s+${MON_RE}(?:\\s+(\\d{4}))?${E}`, 'iu'),
      fn: m => { const mo = monOf(m[2]); if (!mo) return null; const r = m[3] ? mk(+m[3], mo, +m[1]) : inferYear(mo, +m[1], today); return r && { date: r }; },
    },
    {
      kind: 'date', re: new RegExp(`${B}${MON_RE}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?${E}`, 'iu'),
      fn: m => { const mo = monOf(m[1]); if (!mo) return null; const r = m[3] ? mk(+m[3], mo, +m[2]) : inferYear(mo, +m[2], today); return r && { date: r }; },
    },
    { kind: 'date', re: new RegExp(`${B}(?:(?:в|у|во|on)\\s+)?${WD_RE}${E}`, 'iu'), fn: m => ({ date: upcoming(wdOf(m[1]), today, false) }) },
  ];
}

const TASK_WORDS = new RegExp(`${B}(дедлайн|здати|здача|deadline|due|submit|todo)${E}`, 'iu');

export function parseQuick(text, ctx = {}) {
  const today = ctx.today || ymd(new Date());
  const ignore = ctx.ignore || new Set();
  const subjects = ctx.subjects || [];
  const res = { chips: [] };
  let masked = text;
  const spans = [];
  const take = (kind, m, val, idx) => {
    const len = m[0].trimEnd().length;
    spans.push([idx, idx + len]);
    masked = masked.slice(0, idx) + ' '.repeat(len) + masked.slice(idx + len);
    res.chips.push({ kind, s0: idx, s1: idx + len, text: m[0].trim(), ...val });
    Object.assign(res, val);
  };

  // Предмет: #тег
  if (!ignore.has('subject')) {
    const m = /#([\p{L}\p{N}_\-.+]+)/u.exec(masked);
    if (m) {
      const tag = m[1].replace(/[.]+$/, '');
      const key = norm(tag).replace(/[\s_\-.]/g, '');
      const named = subjects.map(s => ({ s, k: norm(s.name).replace(/[\s_\-.]/g, '') }));
      let hit = named.find(x => x.k === key);
      if (!hit) { const pre = named.filter(x => x.k.startsWith(key)); if (pre.length === 1) hit = pre[0]; }
      if (!hit) { const inc = named.filter(x => key.length >= 3 && x.k.includes(key)); if (inc.length === 1) hit = inc[0]; }
      const val = hit ? { subject: { id: hit.s.id, name: hit.s.name } } : { subject: { newName: tag.replace(/_/g, ' ').replace(/^./u, c => c.toUpperCase()) } };
      take('subject', [m[0]], val, m.index);
    }
  }
  const seen = new Set();
  for (const mt of matchers(today)) {
    if (ignore.has(mt.kind) || seen.has(mt.kind)) continue;
    const m = mt.re.exec(masked);
    if (!m) continue;
    const val = mt.fn(m);
    if (!val) continue;
    seen.add(mt.kind);
    take(mt.kind, m, val, m.index);
  }
  if (!ignore.has('task') && !res.task && TASK_WORDS.test(masked)) {
    res.task = true; res.chips.push({ kind: 'task', implicit: true, task: true });
  }

  // Назва = текст без розпізнаних шматків
  let title = '';
  let pos = 0;
  for (const [a, b] of spans.sort((x, y) => x[0] - y[0])) { if (a > pos) title += text.slice(pos, a) + ' '; pos = Math.max(pos, b); }
  title += text.slice(pos);
  res.title = title.replace(/\s+/g, ' ').replace(/^[\s,;:–—-]+|[\s,;:–—-]+$/g, '').trim();

  // Логічні доповнення
  if (res.repeat) {
    if (res.repeat.freq === 'weekly' && res.repeat.days && !res.date) {
      res.date = res.repeat.days.map(d => upcoming(d, today, false)).sort()[0];
    }
    if (!res.date) res.date = today;
    if (res.repeat.freq === 'weekly' && !res.repeat.days) res.repeat.days = [isoDow(res.date)];
  }
  if ((res.time) && !res.date) res.date = today;
  return res;
}
