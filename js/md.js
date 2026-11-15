// Модель конспекту: плоский список блоків із рівнем вкладення (indent).
// Блоки зберігаються як звичайний Markdown, тому файл читається на GitHub і в Obsidian.
// Типи: p, h1, h2, h3, ul, ol, todo, toggle, quote, callout, code, math, hr, image, table
import { uid, escapeHtml as esc } from './util.js';
import { renderTex } from './math.js';

export const LIST_TYPES = new Set(['ul', 'ol', 'todo', 'toggle']);
export const TEXT_TYPES = new Set(['p', 'h1', 'h2', 'h3', 'ul', 'ol', 'todo', 'toggle', 'quote', 'callout']);
export const newBlock = (type = 'p', extra = {}) => ({ id: uid().slice(0, 8), type, text: '', indent: 0, ...extra });

const RE = {
  fence: /^(```|~~~)\s*([\w+#.-]*)\s*$/,
  hr: /^(-{3,}|\*{3,}|_{3,})$/,
  h: /^(#{1,6})\s+(.*)$/,
  todo: /^[-*]\s+\[( |x|X)\]\s?(.*)$/,
  toggle: /^\+\s+(.*)$/,
  ul: /^[-*]\s+(.*)$/,
  ol: /^(\d+)[.)]\s+(.*)$/,
  img: /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/,
  quote: /^>\s?(.*)$/,
  details: /^<details[^>]*>\s*<summary>(.*?)<\/summary>\s*$/i,
};
const isTableSep = l => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(l.trim());
const startsBlock = c => RE.fence.test(c) || c === '$$' || c.startsWith('$$') || RE.hr.test(c) || RE.h.test(c) || RE.todo.test(c) || RE.toggle.test(c) || RE.ul.test(c) || RE.ol.test(c) || RE.img.test(c) || RE.quote.test(c) || c.startsWith('|') || RE.details.test(c) || c === '</details>';
const lead = l => { const m = /^[ \t]*/.exec(l)[0]; return m.replace(/\t/g, '  ').length; };

export function parseBlocks(md) {
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const raw = lines[i];
    if (!raw.trim()) { i++; continue; }
    const sp = lead(raw), indent = Math.floor(sp / 2), c = raw.trim();
    const push = b => { out.push({ id: uid().slice(0, 8), indent, ...b }); };
    let m;
    if ((m = RE.fence.exec(c))) {
      const fence = m[1]; const body = []; i++;
      while (i < lines.length && lines[i].trim() !== fence) { body.push(lines[i].slice(Math.min(sp, lead(lines[i])))); i++; }
      i++; push({ type: 'code', lang: m[2] || '', text: body.join('\n') }); continue;
    }
    if (c === '$$' || (c.startsWith('$$') && !(c.length > 4 && c.endsWith('$$')))) {
      const body = c.length > 2 ? [c.slice(2)] : []; i++;
      while (i < lines.length && !lines[i].trim().endsWith('$$')) { body.push(lines[i].trim()); i++; }
      if (i < lines.length) { const last = lines[i].trim().slice(0, -2); if (last) body.push(last); }
      i++; push({ type: 'math', text: body.join('\n') }); continue;
    }
    if (c.startsWith('$$') && c.endsWith('$$') && c.length > 4) { push({ type: 'math', text: c.slice(2, -2).trim() }); i++; continue; }
    if (RE.hr.test(c)) { push({ type: 'hr', text: '' }); i++; continue; }
    if ((m = RE.h.exec(c))) { push({ type: 'h' + Math.min(3, m[1].length), text: m[2] }); i++; continue; }
    if (c.startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      const rows = [splitRow(c)]; i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) { rows.push(splitRow(lines[i].trim())); i++; }
      const w = Math.max(...rows.map(r => r.length));
      rows.forEach(r => { while (r.length < w) r.push(''); });
      push({ type: 'table', text: '', rows }); continue;
    }
    if (RE.quote.test(c)) {
      const body = [];
      while (i < lines.length && lines[i].trim() && RE.quote.test(lines[i].trim()) && lead(lines[i]) === sp) { body.push(RE.quote.exec(lines[i].trim())[1]); i++; }
      const cm = /^\[!(\w+)\][+-]?\s*(.*)$/.exec(body[0] || '');
      if (cm) push({ type: 'callout', kind: cm[1].toLowerCase(), text: [cm[2], ...body.slice(1)].join('\n').replace(/^\n/, '') });
      else push({ type: 'quote', text: body.join('\n') });
      continue;
    }
    if ((m = RE.img.exec(c))) { push({ type: 'image', text: '', alt: unesc(m[1]), src: m[2] }); i++; continue; }
    if ((m = RE.details.exec(c))) { push({ type: 'toggle', text: m[1] }); i++; continue; }
    if (c === '</details>') { i++; continue; }
    let type = 'p', text = c, checked;
    if ((m = RE.todo.exec(c))) { type = 'todo'; checked = m[1] !== ' '; text = m[2]; }
    else if ((m = RE.toggle.exec(c))) { type = 'toggle'; text = m[1]; }
    else if ((m = RE.ul.exec(c))) { type = 'ul'; text = m[1]; }
    else if ((m = RE.ol.exec(c))) { type = 'ol'; text = m[2]; }
    else if (c === '&nbsp;') text = '';
    i++;
    const contIndent = type === 'p' ? sp : (indent + 1) * 2;
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i].trim()) && (type === 'p' ? lead(lines[i]) === sp : lead(lines[i]) >= contIndent)) {
      text += '\n' + lines[i].trim(); i++;
    }
    push(checked !== undefined ? { type, text, checked } : { type, text });
  }
  return out;
}

function splitRow(line) {
  let s = line.trim(); if (s.startsWith('|')) s = s.slice(1); if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  const cells = []; let cur = '';
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++; continue; }
    if (s[i] === '|') { cells.push(cur.trim()); cur = ''; continue; }
    cur += s[i];
  }
  cells.push(cur.trim());
  return cells.map(x => x.replace(/<br\s*\/?>/gi, '\n'));
}
const unesc = s => s.replace(/\\(.)/g, '$1');

// Рядок, який сам виглядає як початок блоку, екрануємо, щоб він лишився текстом
const guard = l => /^(#{1,6}\s|>|\+\s|[-*]\s|\d+[.)]\s|```|~~~|\$\$|!\[|\||-{3,}$|\*{3,}$|_{3,}$|<details|&nbsp;$)/.test(l)
  ? (/^\d/.test(l) ? l.replace(/^(\d+)([.)])/, '$1\\$2') : '\\' + l) : l;

export function serializeBlocks(blocks) {
  const parts = [];
  const olCount = [];
  blocks.forEach((b, idx) => {
    const ind = '  '.repeat(b.indent || 0);
    const prev = blocks[idx - 1];
    // Нумерація: лічильник на кожному рівні, скидається, коли список переривається
    for (let k = (b.indent || 0) + 1; k < olCount.length; k++) olCount[k] = 0;
    if (b.type === 'ol') olCount[b.indent || 0] = (olCount[b.indent || 0] || 0) + 1; else olCount[b.indent || 0] = 0;
    const lines = (b.text || '').split('\n');
    let s;
    const cont = (first, pad) => [first, ...lines.slice(1).map(l => ind + pad + guard(l))].join('\n');
    switch (b.type) {
      case 'h1': case 'h2': case 'h3': s = ind + '#'.repeat(+b.type[1]) + ' ' + (b.text || '').replace(/\n/g, ' '); break;
      case 'ul': s = cont(ind + '- ' + lines[0].replace(/^(\[[ xX]\])/, '\\$1'), '  '); break;
      case 'ol': s = cont(ind + olCount[b.indent || 0] + '. ' + lines[0], '   '); break;
      case 'todo': s = cont(ind + `- [${b.checked ? 'x' : ' '}] ` + lines[0], '  '); break;
      case 'toggle': s = cont(ind + '+ ' + lines[0], '  '); break;
      case 'quote': s = lines.map(l => ind + '> ' + l).join('\n'); break;
      case 'callout': s = [ind + `> [!${b.kind || 'note'}] ` + lines[0], ...lines.slice(1).map(l => ind + '> ' + l)].join('\n'); break;
      case 'code': s = [ind + '```' + (b.lang || ''), ...(b.text || '').split('\n').map(l => ind + l), ind + '```'].join('\n'); break;
      case 'math': s = [ind + '$$', ...(b.text || '').split('\n').map(l => ind + l), ind + '$$'].join('\n'); break;
      case 'hr': s = ind + '---'; break;
      case 'image': s = ind + `![${(b.alt || '').replace(/[[\]\\]/g, '\\$&')}](${b.src || ''})`; break;
      case 'table': {
        const rows = b.rows && b.rows.length ? b.rows : [['']];
        const cell = x => (x || '').replace(/\|/g, '\\|').replace(/\n/g, '<br>') || ' ';
        const r = rows.map(row => ind + '| ' + row.map(cell).join(' | ') + ' |');
        r.splice(1, 0, ind + '|' + rows[0].map(() => ' --- ').join('|') + '|');
        s = r.join('\n'); break;
      }
      default: s = b.text ? lines.map(l => ind + guard(l)).join('\n') : ind + '&nbsp;';
    }
    if (idx > 0) parts.push(LIST_TYPES.has(b.type) && LIST_TYPES.has(prev.type) ? '\n' : '\n\n');
    parts.push(s);
  });
  // Порожні абзаци в кінці не зберігаємо
  let out = parts.join('');
  while (/\n\n&nbsp;$/.test(out)) out = out.replace(/\n\n&nbsp;$/, '');
  if (out === '&nbsp;') out = '';
  return out;
}

// ---- Рядковий (inline) Markdown ----
export function parseInline(s) {
  const out = []; let buf = '';
  const flush = () => { if (buf) { out.push({ t: 'text', v: buf }); buf = ''; } };
  const findClose = (tok, from) => {
    for (let j = from; j <= s.length - tok.length; j++) {
      if (s[j] === '\\') { j++; continue; }
      if (s.startsWith(tok, j)) {
        if (tok === '*' && (s[j + 1] === '*' || s[j - 1] === '*')) { if (s[j + 1] === '*') { j++; } continue; }
        if (tok === '**' && s[j + 2] === '*') return j + 1; // «***»: спершу закривається курсив усередині
        return j;
      }
    }
    return -1;
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\\' && i + 1 < s.length && /[\\`*_{}[\]()#+\-.!|$~=<>]/.test(s[i + 1])) { buf += s[i + 1]; i += 2; continue; }
    if (ch === '\n') { flush(); out.push({ t: 'br' }); i++; continue; }
    if (ch === '`') { const j = s.indexOf('`', i + 1); if (j > i + 1) { flush(); out.push({ t: 'code', v: s.slice(i + 1, j) }); i = j + 1; continue; } }
    if (ch === '$' && s[i + 1] !== '$' && s[i + 1] && s[i + 1] !== ' ') {
      let j = i + 1;
      while (j < s.length && !(s[j] === '$' && s[j - 1] !== '\\')) j++;
      if (j < s.length && j > i + 1 && s[j - 1] !== ' ' && !/\d/.test(s[j + 1] || '')) { flush(); out.push({ t: 'math', v: s.slice(i + 1, j) }); i = j + 1; continue; }
    }
    const pair = [['**', 'b'], ['~~', 's'], ['==', 'mark']].find(([tk]) => s.startsWith(tk, i));
    if (pair) {
      const j = findClose(pair[0], i + 2);
      if (j > i + 2) { flush(); out.push({ t: pair[1], c: parseInline(s.slice(i + 2, j)) }); i = j + 2; continue; }
    }
    if (ch === '*' && s[i + 1] !== '*' && s[i + 1] !== ' ' && s[i + 1]) {
      const j = findClose('*', i + 1);
      if (j > i + 1) { flush(); out.push({ t: 'i', c: parseInline(s.slice(i + 1, j)) }); i = j + 1; continue; }
    }
    // Хештег: «#слово» на початку слова, має містити хоч одну літеру (#3 — не тег)
    if (ch === '#' && (i === 0 || /[\s(\[{,;:]/.test(s[i - 1]))) {
      const m = /^#([\p{L}\p{N}][\p{L}\p{N}_\-/]*)/u.exec(s.slice(i));
      if (m && /\p{L}/u.test(m[1])) {
        const v = m[1].replace(/[-_/]+$/, '');
        flush(); out.push({ t: 'tag', v }); i += 1 + v.length; continue;
      }
    }
    if (s.startsWith('[[', i)) {
      const j = s.indexOf(']]', i + 2);
      if (j > i + 2) { flush(); const inner = s.slice(i + 2, j); const k = inner.lastIndexOf('|'); out.push({ t: 'wiki', title: k >= 0 ? inner.slice(0, k) : inner, id: k >= 0 ? inner.slice(k + 1) : '' }); i = j + 2; continue; }
    }
    if (ch === '[') {
      let depth = 0, j = i;
      for (; j < s.length; j++) { if (s[j] === '\\') { j++; continue; } if (s[j] === '[') depth++; if (s[j] === ']' && --depth === 0) break; }
      if (j < s.length && s[j + 1] === '(') {
        const k = s.indexOf(')', j + 2);
        if (k > j + 1) { flush(); out.push({ t: 'link', href: s.slice(j + 2, k), c: parseInline(s.slice(i + 1, j)) }); i = k + 1; continue; }
      }
    }
    if ((ch === 'h' || ch === 'w') && /^(https?:\/\/|www\.)/.test(s.slice(i, i + 8)) && !/[\p{L}\p{N}]/u.test(s[i - 1] || '')) {
      const m = /^(https?:\/\/|www\.)[^\s<]+/.exec(s.slice(i));
      let url = m[0].replace(/[.,;:!?)\]]+$/, '');
      flush(); out.push({ t: 'link', href: url.startsWith('www.') ? 'https://' + url : url, c: [{ t: 'text', v: url }], auto: true }); i += url.length; continue;
    }
    buf += ch; i++;
  }
  flush();
  return out;
}

const safeHref = h => /^(https?:|mailto:|tel:|#)/i.test(h) ? h : (/^[\w.-]+\.[a-z]{2,}/i.test(h) ? 'https://' + h : '#');
export function nodesToHtml(nodes, opts = {}) {
  return nodes.map(n => {
    switch (n.t) {
      case 'text': return esc(n.v);
      case 'br': return '<br>';
      case 'code': return `<code>${esc(n.v)}</code>`;
      case 'math': return `<span class="im" contenteditable="false" data-tex="${esc(n.v)}">${renderTex(n.v, false)}</span>`;
      case 'b': return `<strong>${nodesToHtml(n.c, opts)}</strong>`;
      case 'i': return `<em>${nodesToHtml(n.c, opts)}</em>`;
      case 's': return `<s>${nodesToHtml(n.c, opts)}</s>`;
      case 'mark': return `<mark>${nodesToHtml(n.c, opts)}</mark>`;
      case 'link': return `<a href="${esc(safeHref(n.href))}" target="_blank" rel="noopener noreferrer"${n.auto ? ' data-auto="1"' : ''}>${nodesToHtml(n.c, opts)}</a>`;
      case 'tag': return `<span class="htag" data-tag="${esc(n.v)}">#${esc(n.v)}</span>`;
      case 'wiki': {
        const title = opts.resolveWiki ? (opts.resolveWiki(n.id, n.title) || n.title) : n.title;
        return `<a class="wl" contenteditable="false" data-wiki="${esc(n.id)}" data-title="${esc(n.title)}" href="#">${esc(title)}</a>`;
      }
    }
    return '';
  }).join('');
}
export const inlineToHtml = (s, opts) => nodesToHtml(parseInline(s || ''), opts);
const nodesToText = nodes => nodes.map(n => n.t === 'text' || n.t === 'code' ? n.v : n.t === 'math' ? n.v : n.t === 'br' ? ' ' : n.t === 'wiki' ? n.title : n.t === 'tag' ? '#' + n.v : n.c ? nodesToText(n.c) : '').join('');
export const inlineToText = s => nodesToText(parseInline(s || ''));

// Екранування звичайного тексту, щоб він не став розміткою
export const escInline = s => s.replace(/[\\`*$[\]]/g, '\\$&').replace(/~~/g, '\\~\\~').replace(/==/g, '\\=\\=');

// Звичайний текст: для пошуку — увесь, для прев'ю (snippet) — без коду і формул
const nodesToPreview = nodes => nodes.map(n => n.t === 'text' || n.t === 'code' ? n.v : n.t === 'math' ? '…' : n.t === 'br' ? ' ' : n.t === 'wiki' ? n.title : n.t === 'tag' ? '#' + n.v : n.c ? nodesToPreview(n.c) : '').join('');
export function plainText(md, preview) {
  const tx = preview ? s => nodesToPreview(parseInline(s || '')) : inlineToText;
  return parseBlocks(md).map(b => b.type === 'table' ? (preview ? '' : (b.rows || []).flat().map(tx).join(' ')) : b.type === 'code' || b.type === 'math' ? (preview ? '' : b.text) : b.type === 'image' ? (b.alt || '') : tx(b.text)).filter(Boolean).join(preview ? ' · ' : ' ').replace(/\s+/g, ' ').trim();
}

// Посилання [[Назва|id]] у тексті — для зворотних посилань
export const wikiTargets = md => [...String(md || '').matchAll(/\[\[([^\]|]*)\|([^\]]+)\]\]/g)].map(m => m[2]);
export const headings = blocks => blocks.filter(b => /^h[123]$/.test(b.type)).map(b => ({ id: b.id, level: +b.type[1], text: inlineToText(b.text) }));

// Усі хештеги тексту (назва + конспект). Ключ — у нижньому регістрі, щоб #Ідея і #ідея були одним тегом.
function collectTags(nodes, out) { for (const n of nodes) { if (n.t === 'tag') out.push(n.v); else if (n.c) collectTags(n.c, out); } return out; }
export function extractTags(title, body) {
  const out = collectTags(parseInline(title || ''), []);
  if (body && body.includes('#')) for (const b of parseBlocks(body)) {
    if (b.type === 'code' || b.type === 'math' || b.type === 'image') continue;
    if (b.type === 'table') (b.rows || []).flat().forEach(c => collectTags(parseInline(c), out));
    else collectTags(parseInline(b.text || ''), out);
  }
  const seen = new Map();
  for (const v of out) { const k = v.toLowerCase(); if (!seen.has(k)) seen.set(k, v); }
  return [...seen.entries()].map(([key, label]) => ({ key, label }));
}
