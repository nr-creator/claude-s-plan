// Дрібні допоміжні функції. Без DOM на верхньому рівні, щоб модуль працював і в Node-тестах.

export const uid = () =>
  (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16);
      });

export const nowISO = () => new Date().toISOString();

// ---- Дати у вигляді рядків YYYY-MM-DD (локальний час) ----
const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); };
export const todayYmd = () => ymd(new Date());
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const addMonths = (s, n) => {
  const d = parseYmd(s); const day = d.getDate();
  d.setDate(1); d.setMonth(d.getMonth() + n);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last)); return ymd(d);
};
export const diffDays = (a, b) => Math.round((parseYmd(b) - parseYmd(a)) / 86400000);
// ISO-день тижня: 1 = понеділок … 7 = неділя
export const isoDow = s => { const g = parseYmd(s).getDay(); return g === 0 ? 7 : g; };
export const startOfWeek = (s, weekStart = 1) => {
  const dow = isoDow(s); const shift = (dow - weekStart + 7) % 7; return addDays(s, -shift);
};
export const startOfMonth = s => s.slice(0, 8) + '01';
export const daysInMonth = s => { const d = parseYmd(s); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(); };
export const timeToMin = t => { if (!t) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
export const minToTime = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
export const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };

// ---- Рядки ----
export const escapeHtml = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// Нормалізація для пошуку: нижній регістр, без наголосів і діакритики, ґ→г, ё→е, ї/і/й не чіпаємо
export const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .normalize('NFC').replace(/ґ/g, 'г').replace(/ё/g, 'е').replace(/[’'`ʼ]/g, '');

export const debounce = (fn, ms) => {
  let t; const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.flush = (...a) => { clearTimeout(t); fn(...a); }; f.cancel = () => clearTimeout(t); return f;
};

export const deepEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return (a ?? null) === (b ?? null);
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  if (typeof a === 'object') {
    const ka = Object.keys(a).filter(k => a[k] != null), kb = Object.keys(b).filter(k => b[k] != null);
    return ka.length === kb.length && ka.every(k => deepEqual(a[k], b[k]));
  }
  return false;
};

export const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

// UTF-8 / base64
export const utf8 = s => new TextEncoder().encode(s);
export const fromUtf8 = b => new TextDecoder().decode(b);
export const bytesToB64 = bytes => {
  let s = ''; const ch = 0x8000;
  for (let i = 0; i < bytes.length; i += ch) s += String.fromCharCode.apply(null, bytes.subarray(i, i + ch));
  return btoa(s);
};
export const b64ToBytes = b64 => {
  const s = atob(b64.replace(/\s/g, '')); const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i); return out;
};
export const b64url = bytes => bytesToB64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
export const fromB64url = s => b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

// Хеш git-блоба: sha1("blob <довжина>\0" + вміст). Так GitHub рахує sha файлу.
export async function gitBlobSha(bytes) {
  const head = utf8(`blob ${bytes.length}\0`);
  const all = new Uint8Array(head.length + bytes.length); all.set(head); all.set(bytes, head.length);
  const h = new Uint8Array(await crypto.subtle.digest('SHA-1', all));
  return [...h].map(x => x.toString(16).padStart(2, '0')).join('');
}
