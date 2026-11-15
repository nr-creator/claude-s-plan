// Запис ⇄ текст файлу: Markdown з короткою шапкою між рядками "---".
// Шапка — прості пари "ключ: значення". Складні значення пишуться як JSON, тому парсер простий і надійний.

const ORDER = ['id', 'title', 'date', 'endDate', 'time', 'end', 'task', 'done', 'doneDates', 'subject', 'repeat', 'exdates',
  'parent', 'occurrence', 'pinned', 'location', 'name', 'color', 'teacher', 'room', 'link', 'archived', 'order',
  'icsUid', 'createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'deletedAt'];

const PLAIN = /^[0-9A-Za-z][0-9A-Za-z\-:.TZ+]*$/;
const RESERVED = /^(true|false|null|-?\d+(\.\d+)?)$/;

function fmtValue(v) {
  if (typeof v === 'string') return (PLAIN.test(v) && !RESERVED.test(v)) ? v : JSON.stringify(v);
  return JSON.stringify(v);
}

function parseValue(s) {
  s = s.trim();
  if (s === '') return '';
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null') return null;
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  if (/^["[{]/.test(s)) { try { return JSON.parse(s); } catch { /* падаємо нижче */ } }
  if (/^'.*'$/.test(s)) return s.slice(1, -1).replace(/''/g, "'");
  return s;
}

// Канонічна форма: прибираємо порожні значення, щоб false/null/[]/'' і «поля немає» означали одне й те саме.
export function canon(obj) {
  const o = {};
  for (const [k, v] of Object.entries(obj || {})) {
    if (v === undefined || v === null || v === false || v === '' || (Array.isArray(v) && !v.length)) continue;
    o[k] = v;
  }
  return o;
}

export function serialize(obj) {
  const { body, ...meta } = obj;
  const keys = Object.keys(meta).filter(k => meta[k] !== undefined && meta[k] !== null && meta[k] !== false && !(Array.isArray(meta[k]) && !meta[k].length) && meta[k] !== '');
  keys.sort((a, b) => {
    const ia = ORDER.indexOf(a), ib = ORDER.indexOf(b);
    return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib) || a.localeCompare(b);
  });
  const head = keys.map(k => `${k}: ${fmtValue(meta[k])}`).join('\n');
  const text = (body || '').replace(/\s+$/, '');
  return `---\n${head}\n---\n${text ? '\n' + text + '\n' : ''}`;
}

export function parse(text) {
  text = String(text).replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const out = {};
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(text);
  let body = text;
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i <= 0) continue;
      const k = line.slice(0, i).trim();
      if (!/^[A-Za-z_][\w-]*$/.test(k)) continue;
      out[k] = parseValue(line.slice(i + 1));
    }
    body = text.slice(m[0].length);
  }
  body = body.replace(/^\n/, '').replace(/\s+$/, '');
  if (body) out.body = body;
  return out;
}
