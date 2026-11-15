// Блоковий редактор конспектів.
// Принцип: документ — це масив блоків (див. md.js). Кожен текстовий блок — окремий contenteditable.
// Структурні дії (розділити, злити, перетворити, перемістити) змінюють масив і перемальовують лише зачеплені блоки.
// Звичайне набирання тексту не перемальовує нічого: текст блоку зчитується з DOM у Markdown-рядок.
import { parseBlocks, serializeBlocks, inlineToHtml, escInline, newBlock, TEXT_TYPES, LIST_TYPES, headings, inlineToText } from './md.js';
import { renderTex } from './math.js';
import { icon } from './icons.js';
import { t } from './i18n.js';
import { popover, menu, h, $, $$, isTouch, toast, esc } from './ui.js';
import { clone, debounce } from './util.js';

const CALLOUTS = ['note', 'tip', 'warning', 'important'];
const PH = { h1: 'ed.phH', h2: 'ed.phH', h3: 'ed.phH', ul: 'ed.phList', ol: 'ed.phList', todo: 'ed.phTodo', toggle: 'ed.phToggle', quote: 'ed.phQuote', callout: 'ed.callout.note' };

// ---------- DOM ⇄ рядковий Markdown ----------
function domToInline(node) {
  let out = '';
  const kids = [...node.childNodes];
  kids.forEach((n, idx) => {
    if (n.nodeType === 3) { out += escInline(n.nodeValue.replace(/​/g, '').replace(/ /g, ' ')); return; }
    if (n.nodeType !== 1) return;
    const tag = n.tagName;
    if (tag === 'BR') { if (idx < kids.length - 1 || n.nextSibling) out += '\n'; return; }
    if (n.classList.contains('im')) { out += '$' + (n.dataset.tex || '') + '$'; return; }
    if (n.classList.contains('wl')) { out += `[[${(n.dataset.title || n.textContent).replace(/[[\]|]/g, '')}|${n.dataset.wiki || ''}]]`; return; }
    const inner = domToInline(n);
    const wrap = (m) => { if (!inner.trim()) { out += inner; return; } const lead = /^\s*/.exec(inner)[0], tail = /\s*$/.exec(inner)[0]; out += lead + m + inner.trim() + m + tail; };
    switch (tag) {
      case 'STRONG': case 'B': wrap('**'); break;
      case 'EM': case 'I': wrap('*'); break;
      case 'S': case 'STRIKE': case 'DEL': wrap('~~'); break;
      case 'MARK': wrap('=='); break;
      case 'CODE': out += n.textContent ? '`' + n.textContent.replace(/`/g, "'") + '`' : ''; break;
      case 'A': {
        const href = n.getAttribute('href') || '';
        if (n.dataset.auto && n.textContent === href.replace(/^https:\/\/(?=www\.)/, '')) out += n.textContent;
        else out += inner ? `[${inner}](${href})` : '';
        break;
      }
      case 'DIV': case 'P': out += (out && !out.endsWith('\n') ? '\n' : '') + inner; break;
      default: out += inner;
    }
  });
  return out;
}

// Позиція курсора в «символах»: текст + атомарні елементи (формули, посилання) + переноси рядків = 1
function isAtom(n) { return n.nodeType === 1 && (n.getAttribute('contenteditable') === 'false' || n.tagName === 'BR'); }
function caretOffset(root) {
  const sel = getSelection(); if (!sel.rangeCount) return 0;
  const r = sel.getRangeAt(0);
  const pre = document.createRange(); pre.selectNodeContents(root);
  try { pre.setEnd(r.startContainer, r.startOffset); } catch { return 0; }
  return fragLen(pre.cloneContents());
}
function fragLen(node) {
  let n = 0;
  for (const c of node.childNodes) {
    if (c.nodeType === 3) n += c.nodeValue.length;
    else if (c.nodeType === 1) n += isAtom(c) ? 1 : fragLen(c);
  }
  return n;
}
function setCaret(root, off) {
  const sel = getSelection(); const r = document.createRange();
  let left = Math.max(0, off ?? 0); let done = false;
  const walk = node => {
    for (const c of node.childNodes) {
      if (done) return;
      if (c.nodeType === 3) { if (left <= c.nodeValue.length) { r.setStart(c, left); done = true; return; } left -= c.nodeValue.length; }
      else if (c.nodeType === 1) {
        if (isAtom(c)) { if (left === 0) { r.setStartBefore(c); done = true; return; } left -= 1; if (left === 0 && !c.nextSibling) { r.setStartAfter(c); done = true; return; } }
        else walk(c);
      }
    }
  };
  walk(root);
  if (!done) { r.selectNodeContents(root); r.collapse(false); }
  r.collapse(true); sel.removeAllRanges(); sel.addRange(r);
}
const textLen = root => fragLen(root);
function rangeHtmlParts(root) {
  const sel = getSelection(); const r = sel.getRangeAt(0);
  const a = document.createRange(); a.selectNodeContents(root); a.setEnd(r.startContainer, r.startOffset);
  const b = document.createRange(); b.selectNodeContents(root); b.setStart(r.endContainer, r.endOffset);
  const wa = document.createElement('div'); wa.appendChild(a.cloneContents());
  const wb = document.createElement('div'); wb.appendChild(b.cloneContents());
  return [domToInline(wa), domToInline(wb)];
}
function caretRect() {
  const sel = getSelection(); if (!sel.rangeCount) return null;
  const r = sel.getRangeAt(0).cloneRange(); r.collapse(true);
  let rect = r.getClientRects()[0];
  if (!rect) { const span = document.createElement('span'); span.textContent = '​'; r.insertNode(span); rect = span.getBoundingClientRect(); span.remove(); }
  return rect;
}
function atFirstLine(el) { const c = caretRect(); if (!c) return true; const r = el.getBoundingClientRect(); return c.top - r.top < (parseFloat(getComputedStyle(el).lineHeight) || 24) * 0.8; }
function atLastLine(el) { const c = caretRect(); if (!c) return true; const r = el.getBoundingClientRect(); return r.bottom - c.bottom < (parseFloat(getComputedStyle(el).lineHeight) || 24) * 0.8; }

const SLASH = () => [
  { k: 'p', l: t('ed.text'), i: 'notes', s: 'text текст абзац p' },
  { k: 'h1', l: t('ed.h1'), i: 'heading', s: 'h1 heading заголовок #' },
  { k: 'h2', l: t('ed.h2'), i: 'heading', s: 'h2 heading заголовок ##' },
  { k: 'h3', l: t('ed.h3'), i: 'heading', s: 'h3 heading заголовок ###' },
  { k: 'ul', l: t('ed.ul'), i: 'list', s: 'bullet list маркований список ul' },
  { k: 'ol', l: t('ed.ol'), i: 'olist', s: 'numbered list нумерований список ol' },
  { k: 'todo', l: t('ed.todo'), i: 'todo', s: 'todo checkbox справи задачі чекбокс' },
  { k: 'toggle', l: t('ed.toggle'), i: 'toggle', s: 'toggle розгортний згортний' },
  { k: 'quote', l: t('ed.quote'), i: 'quote', s: 'quote цитата' },
  { k: 'callout', l: t('ed.callout'), i: 'callout', s: 'callout виноска примітка note' },
  { k: 'code', l: t('ed.code'), i: 'code', s: 'code код програма' },
  { k: 'math', l: t('ed.math'), i: 'sigma', s: 'math формула latex рівняння tex' },
  { k: 'imath', l: t('ed.imath'), i: 'sigma', s: 'inline math формула в рядку' },
  { k: 'table', l: t('ed.table'), i: 'table', s: 'table таблиця' },
  { k: 'image', l: t('ed.image'), i: 'image', s: 'image picture photo зображення фото картинка' },
  { k: 'wiki', l: t('ed.wiki'), i: 'link', s: 'link page посилання нотатка сторінка [[' },
  { k: 'hr', l: t('ed.hr'), i: 'divider', s: 'divider line розділювач лінія ---' },
];

export function createEditor(host, opts = {}) {
  let blocks = parseBlocks(opts.markdown || '');
  if (!blocks.length) blocks = [newBlock()];
  const root = h(`<div class="ed font-${opts.font || 'sans'}" tabindex="-1"><div class="ed-blocks"></div><div class="ed-tail" aria-hidden="true"></div></div>`);
  const list = root.firstElementChild;
  host.appendChild(root);
  const collapsed = new Set();
  let selected = new Set(), selAnchor = null;
  let undo = [], redo = [], burst = false, stable = snap(), burstTimer;
  let slash = null, destroyed = false, rendering = 0;

  const emit = debounce(() => { if (!destroyed) opts.onChange && opts.onChange(serializeBlocks(blocks)); }, 350);
  const changed = () => { emit(); opts.onDirty && opts.onDirty(); };

  // ---------- знімки для скасування ----------
  function snap() { return { blocks: clone(blocks), focus: focusInfo() }; }
  function focusInfo() {
    const a = document.activeElement; const b = a && a.closest && a.closest('.blk');
    if (!b || !root.contains(b)) return null;
    const tx = a.closest('.tx'); return { id: b.dataset.id, off: tx ? caretOffset(tx) : 0, cell: a.dataset.cell };
  }
  function endBurst() { if (burst) { clearTimeout(burstTimer); burst = false; stable = snap(); } }
  function checkpoint() { endBurst(); undo.push(stable); if (undo.length > 200) undo.shift(); redo = []; }
  function afterStructural() { stable = snap(); changed(); }
  function typing() {
    if (!burst) { undo.push(stable); if (undo.length > 200) undo.shift(); redo = []; burst = true; }
    clearTimeout(burstTimer); burstTimer = setTimeout(endBurst, 900);
    changed();
  }
  function restore(s, fallback) {
    blocks = clone(s.blocks); renderAll();
    const f = (s.focus && idx(s.focus.id) >= 0) ? s.focus : (fallback && idx(fallback.id) >= 0 ? fallback : { id: blocks[Math.min(blocks.length - 1, fallback ? fallback.i || 0 : 0)].id, off: -1 });
    focusBlock(f.id, f.off, f.cell); changed();
  }
  const curFocus = () => { const f = focusInfo(); if (f) f.i = idx(f.id); return f; };
  function doUndo() { endBurst(); if (!undo.length) return; const f = curFocus(); redo.push(snap()); const s = undo.pop(); restore(s, f); stable = snap(); }
  function doRedo() { endBurst(); if (!redo.length) return; const f = curFocus(); undo.push(snap()); const s = redo.pop(); restore(s, f); stable = snap(); }

  // ---------- малювання ----------
  const idx = id => blocks.findIndex(b => b.id === id);
  const elOf = id => list.querySelector(`.blk[data-id="${CSS.escape(id)}"]`);
  const txOf = id => { const e = elOf(id); return e && e.querySelector('.tx'); };
  const wikiOpts = { resolveWiki: opts.resolveWiki };

  function blockHtml(b) {
    const ph = esc(t(PH[b.type] || 'ed.ph'));
    const tx = (cls = '') => `<div class="tx ${cls}" contenteditable="true" spellcheck="true" data-ph="${ph}">${inlineToHtml(b.text, wikiOpts)}</div>`;
    let body;
    switch (b.type) {
      case 'ul': body = `<span class="mk bul" contenteditable="false"></span>${tx()}`; break;
      case 'ol': body = `<span class="mk num" contenteditable="false">1.</span>${tx()}`; break;
      case 'todo': body = `<button class="mk tdc ${b.checked ? 'on' : ''}" contenteditable="false" tabindex="-1" aria-label="${t('entry.done')}">${icon('check')}</button>${tx(b.checked ? 'checked' : '')}`; break;
      case 'toggle': body = `<button class="mk tgl ${collapsed.has(b.id) ? '' : 'open'}" contenteditable="false" tabindex="-1">${icon('right')}</button>${tx()}`; break;
      case 'callout': body = `<button class="mk co-k" contenteditable="false" tabindex="-1" title="${esc(t('ed.callout.' + (b.kind || 'note')))}">${icon(b.kind === 'warning' || b.kind === 'conflict' ? 'alert' : b.kind === 'tip' ? 'target' : b.kind === 'important' ? 'info' : 'callout')}</button>${tx()}`; break;
      case 'code': body = `<div class="code-wrap"><input class="code-lang" value="${esc(b.lang || '')}" placeholder="${esc(t('ed.lang'))}" spellcheck="false"><pre class="tx code" contenteditable="plaintext-only" spellcheck="false" data-ph="${esc(t('ed.codePh'))}">${esc(b.text)}</pre></div>`; break;
      case 'math': body = `<div class="math-view" tabindex="0">${b.text.trim() ? renderTex(b.text, true) : `<span class="muted">${esc(t('ed.emptyMath'))}</span>`}</div><pre class="tx mathsrc" contenteditable="plaintext-only" spellcheck="false" data-ph="${esc(t('ed.mathPh'))}">${esc(b.text)}</pre>`; break;
      case 'hr': body = '<div class="hr" tabindex="0"><hr></div>'; break;
      case 'image': body = `<figure tabindex="0"><div class="img-box"><img alt="${esc(b.alt || '')}" draggable="false"></div><figcaption class="tx cap" contenteditable="true" data-ph="${esc(t('ed.captionPh'))}">${esc(b.alt || '')}</figcaption></figure>`; break;
      case 'table': {
        const rows = b.rows && b.rows.length ? b.rows : [['', ''], ['', '']];
        body = `<div class="tbl-wrap"><table>${rows.map((r, ri) => `<tr>${r.map((c, ci) => `<${ri ? 'td' : 'th'}><div class="tx cell" contenteditable="true" data-cell="${ri},${ci}">${inlineToHtml(c, wikiOpts)}</div></${ri ? 'td' : 'th'}>`).join('')}</tr>`).join('')}</table>
          <div class="tbl-add"><button class="btn-text sm" data-tbl="row">${icon('plus')}${t('ed.addRow')}</button><button class="btn-text sm" data-tbl="col">${icon('plus')}${t('ed.addCol')}</button></div></div>`;
        break;
      }
      default: body = tx();
    }
    return `<div class="blk t-${b.type} ${b.type === 'callout' ? 'co-' + (b.kind || 'note') : ''}" data-id="${b.id}" data-type="${b.type}" style="--ind:${b.indent || 0}">
      <div class="blk-gut" contenteditable="false"><button class="blk-add" tabindex="-1" aria-label="+">${icon('plus')}</button><button class="blk-grip" tabindex="-1" aria-label="${esc(t('ed.turnInto'))}">${icon('grip')}</button></div>
      <div class="blk-body">${body}</div></div>`;
  }
  function mount(b) {
    const el = h(blockHtml(b));
    if (b.type === 'image') loadImg(el, b);
    return el;
  }
  async function loadImg(el, b) {
    const img = el.querySelector('img');
    if (!b.src) return;
    if (b.src.startsWith('asset:')) { const u = opts.imageURL ? await opts.imageURL(b.src.slice(6)) : null; if (u) img.src = u; else img.closest('.img-box').classList.add('missing'); }
    else img.src = b.src;
  }
  // Під час перемальовування браузер повідомляє про втрату фокусу старим блоком — цей текст ігноруємо
  function renderAll() {
    rendering++;
    try { list.innerHTML = ''; for (const b of blocks) list.appendChild(mount(b)); } finally { rendering--; }
    refresh();
  }
  function rerender(id) {
    const b = blocks[idx(id)]; const old = elOf(id); if (!b || !old) return;
    const el = mount(b);
    rendering++; try { old.replaceWith(el); } finally { rendering--; }
    return el;
  }
  function insertEl(b, afterId) {
    const el = mount(b);
    const after = afterId && elOf(afterId);
    if (after) after.after(el); else list.prepend(el);
    return el;
  }
  // Нумерація списків, приховування вмісту згорнутих блоків, позначка порожніх
  function refresh() {
    const counters = [];
    let hideAt = null; // рівень згорнутого блоку, чиї нащадки приховані
    blocks.forEach(b => {
      const el = elOf(b.id); if (!el) return;
      const ind = b.indent || 0;
      for (let k = ind + 1; k < counters.length; k++) counters[k] = 0;
      if (b.type === 'ol') { counters[ind] = (counters[ind] || 0) + 1; el.querySelector('.num').textContent = counters[ind] + '.'; } else counters[ind] = 0;
      el.style.setProperty('--ind', ind);
      let hidden = false;
      if (hideAt !== null && ind > hideAt) hidden = true; else hideAt = null;
      el.classList.toggle('hid', hidden);
      if (!hidden && b.type === 'toggle' && collapsed.has(b.id)) hideAt = ind;
      if (b.type === 'toggle') {
        const i = idx(b.id); const nx = blocks[i + 1];
        el.classList.toggle('empty-toggle', !collapsed.has(b.id) && !(nx && (nx.indent || 0) > ind));
      }
      const tx = el.querySelector(':scope > .blk-body > .tx, :scope > .blk-body > .code-wrap > .tx');
      if (tx) tx.classList.toggle('is-empty', !tx.textContent && !tx.querySelector('.im,.wl,img'));
    });
    root.classList.toggle('doc-empty', blocks.length === 1 && blocks[0].type === 'p' && !blocks[0].text);
    opts.onStructure && opts.onStructure();
  }

  function focusBlock(id, off = 0, cell) {
    const el = elOf(id); if (!el) return;
    let tx = cell ? el.querySelector(`[data-cell="${cell}"]`) : el.querySelector('.tx');
    const b = blocks[idx(id)];
    if (b && b.type === 'math') { el.classList.add('editing'); }
    if (b && (b.type === 'hr' || b.type === 'image') && !cell) { const f = el.querySelector('[tabindex="0"]'); f && f.focus(); return; }
    if (!tx) return;
    tx.focus({ preventScroll: false });
    setCaret(tx, off === -1 ? textLen(tx) : off);
    keepVisible(tx);
  }
  function keepVisible(el) {
    const r = el.getBoundingClientRect(); const vv = window.visualViewport;
    const bottom = vv ? vv.height + vv.offsetTop - 64 : innerHeight - 64;
    if (r.bottom > bottom || r.top < 60) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Зчитати текст блоку з DOM у модель
  function sync(id) {
    const b = blocks[idx(id)]; const el = elOf(id); if (!b || !el) return;
    if (b.type === 'table') { b.rows = $$('tr', el).map(tr => $$('.cell', tr).map(c => domToInline(c))); return; }
    if (b.type === 'image') { b.alt = el.querySelector('.cap').textContent; return; }
    const tx = el.querySelector('.tx'); if (!tx) return;
    if (b.type === 'code' || b.type === 'math') b.text = tx.textContent.replace(/​/g, '');
    else b.text = domToInline(tx);
    tx.classList.toggle('is-empty', !tx.textContent && !tx.querySelector('.im,.wl'));
  }
  const curBlockId = () => { const a = document.activeElement; const b = a && a.closest && a.closest('.blk'); return b && root.contains(b) ? b.dataset.id : null; };

  // ---------- структурні дії ----------
  function setType(id, type, extra = {}) {
    const i = idx(id); if (i < 0) return;
    const b = blocks[i];
    sync(id);
    checkpoint();
    const text = TEXT_TYPES.has(b.type) && (type === 'code' || type === 'math') ? inlineToText(b.text) : (b.type === 'code' || b.type === 'math') && TEXT_TYPES.has(type) ? escInline(b.text) : b.text;
    const nb = { id: b.id, type, text, indent: b.indent || 0, ...extra };
    if (type === 'todo') nb.checked = !!extra.checked;
    if (type === 'callout') nb.kind = extra.kind || b.kind || 'note';
    if (type === 'code') nb.lang = extra.lang || '';
    if (type === 'table') nb.rows = extra.rows || [['', ''], ['', '']];
    if (/^h/.test(type)) nb.text = (nb.text || '').replace(/\n/g, ' ');
    blocks[i] = nb;
    rerender(id); refresh(); afterStructural();
    if (type === 'hr') { const n = newBlock('p', { indent: nb.indent }); blocks.splice(i + 1, 0, n); insertEl(n, id); refresh(); focusBlock(n.id); stable = snap(); return; }
    if (type === 'math') { elOf(id).classList.add('editing'); }
    focusBlock(id, type === 'table' ? 0 : -1, type === 'table' ? '0,0' : undefined);
  }

  function split(id) {
    const i = idx(id); const b = blocks[i]; const tx = txOf(id);
    const [left, right] = rangeHtmlParts(tx);
    checkpoint();
    // Порожній пункт списку: вийти зі списку (або зменшити відступ)
    if (LIST_TYPES.has(b.type) && !left && !right) {
      if ((b.indent || 0) > 0) { b.indent--; rerender(id); refresh(); afterStructural(); focusBlock(id); return; }
      b.type = 'p'; b.text = ''; delete b.checked; rerender(id); refresh(); afterStructural(); focusBlock(id); return;
    }
    if ((b.type === 'quote' || b.type === 'callout') && !right && /\n$/.test(left + '\n') && left.endsWith('\n')) { b.text = left.replace(/\n$/, ''); }
    else b.text = left;
    let ntype = LIST_TYPES.has(b.type) ? b.type : 'p';
    let nind = b.indent || 0;
    // Enter у відкритому розгортному блоці створює вкладений рядок
    if (b.type === 'toggle' && !collapsed.has(b.id)) { ntype = 'p'; nind++; }
    if (/^h/.test(b.type) && !left && right) { // Enter на початку заголовка: порожній рядок над ним
      const n = newBlock('p', { indent: nind }); blocks.splice(i, 0, n); b.text = right; rerender(id); list.insertBefore(mount(n), elOf(id)); refresh(); afterStructural(); focusBlock(id, 0); return;
    }
    const n = newBlock(ntype, { text: right, indent: nind });
    if (ntype === 'todo') n.checked = false;
    // Розгорнутий toggle із вмістом: новий рядок іде одразу після toggle, всередину
    let at = i + 1;
    if (b.type === 'toggle' && collapsed.has(b.id)) { at = subtreeEnd(i) + 1; }
    blocks.splice(at, 0, n);
    rerender(id);
    insertEl(n, blocks[at - 1].id);
    refresh(); afterStructural();
    focusBlock(n.id, 0);
  }
  function subtreeEnd(i) { const ind = blocks[i].indent || 0; let j = i; while (j + 1 < blocks.length && (blocks[j + 1].indent || 0) > ind) j++; return j; }

  function mergeUp(id) {
    const i = idx(id); const b = blocks[i];
    if (b.type !== 'p') { checkpoint(); const tx = txOf(id); const keep = domToInline(tx); blocks[i] = { id: b.id, type: 'p', text: keep, indent: b.indent || 0 }; rerender(id); refresh(); afterStructural(); focusBlock(id, 0); return; }
    if ((b.indent || 0) > 0) { checkpoint(); b.indent--; refresh(); afterStructural(); focusBlock(id, 0); return; }
    // шукаємо попередній видимий текстовий блок
    let j = i - 1; while (j >= 0 && elOf(blocks[j].id).classList.contains('hid')) j--;
    if (j < 0) return;
    const p = blocks[j];
    sync(id);
    checkpoint();
    if (!TEXT_TYPES.has(p.type)) {
      if (!b.text) { blocks.splice(i, 1); elOf(id).remove(); refresh(); afterStructural(); focusBlock(p.id); return; }
      if (p.type === 'hr' || p.type === 'image') { blocks.splice(j, 1); elOf(p.id).remove(); refresh(); afterStructural(); focusBlock(id, 0); return; }
      focusBlock(p.id, -1); return;
    }
    const tx = txOf(p.id); const off = textLen(tx);
    p.text = (p.text || '') + b.text;
    // діти злитого блоку піднімаються під попередній
    blocks.splice(i, 1); elOf(id).remove();
    rerender(p.id); refresh(); afterStructural(); focusBlock(p.id, off);
  }
  function mergeDown(id) {
    const i = idx(id); const n = blocks[i + 1]; if (!n) return;
    const b = blocks[i]; sync(id);
    if (!TEXT_TYPES.has(n.type)) { if (n.type === 'hr' || n.type === 'image') { checkpoint(); blocks.splice(i + 1, 1); elOf(n.id).remove(); refresh(); afterStructural(); } return; }
    checkpoint();
    const off = textLen(txOf(id));
    b.text = (b.text || '') + (n.text || '');
    blocks.splice(i + 1, 1); elOf(n.id).remove();
    rerender(id); refresh(); afterStructural(); focusBlock(id, off);
  }
  function indent(id, dir) {
    const i = idx(id); const b = blocks[i];
    const max = i > 0 ? (blocks[i - 1].indent || 0) + 1 : 0;
    const end = subtreeEnd(i);
    const ni = Math.max(0, Math.min(max, (b.indent || 0) + dir));
    if (ni === (b.indent || 0)) return;
    const off = txOf(id) ? caretOffset(txOf(id)) : 0;
    checkpoint();
    const d = ni - (b.indent || 0);
    for (let k = i; k <= end; k++) blocks[k].indent = Math.max(0, (blocks[k].indent || 0) + d);
    refresh(); afterStructural(); focusBlock(id, off);
  }
  function moveBlock(id, dir) {
    const i = idx(id); const end = subtreeEnd(i); const chunk = blocks.slice(i, end + 1);
    let target;
    if (dir < 0) { if (i === 0) return; let j = i - 1; const ind = blocks[i].indent || 0; while (j > 0 && (blocks[j].indent || 0) > ind) j--; target = j; }
    else { if (end + 1 >= blocks.length) return; target = subtreeEnd(end + 1) + 1 - chunk.length; }
    const off = txOf(id) ? caretOffset(txOf(id)) : 0;
    checkpoint();
    blocks.splice(i, chunk.length); blocks.splice(target, 0, ...chunk);
    normalizeIndents(); renderAll(); afterStructural(); focusBlock(id, off);
  }
  function normalizeIndents() { blocks.forEach((b, i) => { const max = i > 0 ? (blocks[i - 1].indent || 0) + 1 : 0; if ((b.indent || 0) > max) b.indent = max; }); }
  function duplicate(ids) {
    checkpoint();
    const last = Math.max(...ids.map(idx)); const copies = ids.map(id => ({ ...clone(blocks[idx(id)]), id: newBlock().id }));
    blocks.splice(last + 1, 0, ...copies); renderAll(); afterStructural(); focusBlock(copies[0].id, -1);
  }
  function removeBlocks(ids) {
    checkpoint();
    const first = Math.min(...ids.map(idx));
    blocks = blocks.filter(b => !ids.includes(b.id));
    if (!blocks.length) blocks = [newBlock()];
    renderAll(); afterStructural();
    const f = blocks[Math.min(first, blocks.length - 1)]; clearSelection(); focusBlock(f.id, first > 0 ? -1 : 0);
  }
  function insertBlocksAfter(id, nbs, focusLast = true) {
    checkpoint();
    const i = idx(id); blocks.splice(i + 1, 0, ...nbs); renderAll(); afterStructural();
    const f = focusLast ? nbs[nbs.length - 1] : nbs[0];
    if (f.type === 'math') elOf(f.id).classList.add('editing');
    focusBlock(f.id, -1, f.type === 'table' ? '0,0' : undefined);
  }

  // ---------- вибір блоків (Esc, перетягування через кілька блоків) ----------
  function selectBlocks(ids, anchor) {
    selected = new Set(ids); selAnchor = anchor ?? ids[0];
    $$('.blk', list).forEach(e => e.classList.toggle('sel', selected.has(e.dataset.id)));
    if (ids.length) { getSelection().removeAllRanges(); root.focus({ preventScroll: true }); }
  }
  function clearSelection() { if (!selected.size) return; selected = new Set(); $$('.blk.sel', list).forEach(e => e.classList.remove('sel')); }
  function selRange(a, b) { const i = idx(a), j = idx(b); const [x, y] = i < j ? [i, j] : [j, i]; return blocks.slice(x, y + 1).filter(bl => !elOf(bl.id).classList.contains('hid')).map(bl => bl.id); }
  let selFocus = null;

  // ---------- події клавіатури ----------
  list.addEventListener('keydown', e => {
    const tx = e.target.closest('.tx'); const bel = e.target.closest('.blk');
    if (!bel) return;
    const id = bel.dataset.id; const b = blocks[idx(id)]; if (!b) return;
    const mod = e.ctrlKey || e.metaKey;
    if (slash && slash.key(e)) return;
    if (e.isComposing) return;
    // Скасування
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'z' || (mod && e.code === 'KeyZ' && !e.shiftKey)) { e.preventDefault(); sync(id); doUndo(); return; }
    if (mod && (e.key.toLowerCase() === 'y' || (e.shiftKey && (e.key.toLowerCase() === 'z' || e.code === 'KeyZ')))) { e.preventDefault(); sync(id); doRedo(); return; }
    if (e.key === 'Escape') { e.preventDefault(); sync(id); if (b.type === 'math') bel.classList.remove('editing'); selectBlocks([id]); selFocus = id; return; }
    // Не-текстові блоки (лінія, зображення) у фокусі
    if (!tx) {
      if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlocks([id]); return; }
      if (e.key === 'Enter') { e.preventDefault(); const n = newBlock('p', { indent: b.indent || 0 }); insertBlocksAfter(id, [n]); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') { e.preventDefault(); goPrev(id); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') { e.preventDefault(); goNext(id); return; }
      if (b.type === 'math' && !e.target.closest('.tx')) { if (e.key.length === 1 || e.key === 'F2') { bel.classList.add('editing'); focusBlock(id, -1); } }
      return;
    }
    const isCode = b.type === 'code', isMath = b.type === 'math', isCell = tx.classList.contains('cell'), isCap = tx.classList.contains('cap');
    const sel = getSelection(); const collapsedSel = sel.isCollapsed;
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) { e.preventDefault(); sync(id); moveBlock(id, e.key === 'ArrowUp' ? -1 : 1); return; }
    if (mod && !e.shiftKey && e.key.toLowerCase() === 'd') { e.preventDefault(); sync(id); duplicate([id]); return; }
    if (mod && e.key === 'Enter') { e.preventDefault(); if (b.type === 'todo') toggleCheck(id); else if (b.type === 'toggle') toggleCollapse(id); else if (isCode || isMath) exitTo(id); return; }
    if (mod && e.altKey && /^[0-3]$/.test(e.key)) { e.preventDefault(); setType(id, e.key === '0' ? 'p' : 'h' + e.key); return; }
    if (mod && e.shiftKey && /^Digit[789]$/.test(e.code)) { e.preventDefault(); setType(id, { Digit7: 'ol', Digit8: 'ul', Digit9: 'todo' }[e.code]); return; }
    if (mod && !isCode && !isMath) {
      const k = e.key.toLowerCase();
      if (k === 'b' && !e.shiftKey) { e.preventDefault(); document.execCommand('bold'); return; }
      if (k === 'i' && !e.shiftKey) { e.preventDefault(); document.execCommand('italic'); return; }
      if (k === 'u' && !e.shiftKey) { e.preventDefault(); return; }
      if (k === 'e' && !e.shiftKey) { e.preventDefault(); wrapSel('code'); return; }
      if (k === 'k' && !e.shiftKey) { e.preventDefault(); linkSel(tx); return; }
      if (e.shiftKey && (k === 's' || k === 'x')) { e.preventDefault(); document.execCommand('strikeThrough'); return; }
      if (e.shiftKey && k === 'h') { e.preventDefault(); wrapSel('mark'); return; }
      if (e.shiftKey && k === 'm') { e.preventDefault(); inlineMath(tx); return; }
      if (k === 'a' && !e.shiftKey) {
        // Друге Ctrl+A виділяє весь документ
        if (sel.toString().length >= tx.textContent.length && tx.textContent.length > 0 || !tx.textContent.length) { e.preventDefault(); sync(id); selectBlocks(blocks.map(x => x.id)); return; }
      }
    }
    if (e.key === 'Tab') {
      if (isCode) { e.preventDefault(); document.execCommand('insertText', false, '  '); return; }
      if (isCell) { e.preventDefault(); cellNav(id, tx, e.shiftKey ? -1 : 1); return; }
      e.preventDefault(); sync(id); indent(id, e.shiftKey ? -1 : 1); return;
    }
    if (e.key === 'Enter') {
      if (isCode) { e.preventDefault(); insertPlainNewline(tx); return; } // у коді Enter — новий рядок; вихід: Ctrl+Enter або стрілка вниз
      if (isMath) { e.preventDefault(); if (e.shiftKey) { insertPlainNewline(tx); return; } exitTo(id); return; }
      if (isCell) { e.preventDefault(); if (e.shiftKey) { document.execCommand('insertLineBreak'); return; } cellNav(id, tx, 0, 1); return; }
      if (isCap) { e.preventDefault(); const n = newBlock('p', { indent: b.indent || 0 }); sync(id); insertBlocksAfter(id, [n]); return; }
      if (e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); return; }
      e.preventDefault(); sync(id); split(id); return;
    }
    if (e.key === 'Backspace' && collapsedSel && caretOffset(tx) === 0) {
      if (isCell || isCap) { if (isCap && !tx.textContent) { e.preventDefault(); selectBlocks([id]); } return; }
      if ((isCode || isMath) && tx.textContent.length) return;
      e.preventDefault();
      if (isCode || isMath) { checkpoint(); blocks[idx(id)] = { id, type: 'p', text: '', indent: b.indent || 0 }; rerender(id); refresh(); afterStructural(); focusBlock(id); return; }
      mergeUp(id); return;
    }
    if (e.key === 'Delete' && collapsedSel && caretOffset(tx) === textLen(tx) && !isCode && !isMath && !isCell) { e.preventDefault(); mergeDown(id); return; }
    if (e.key === 'ArrowUp' && !e.shiftKey && collapsedSel && atFirstLine(tx)) { if (isCell && cellNav(id, tx, 0, -1, true)) { e.preventDefault(); return; } e.preventDefault(); sync(id); goPrev(id, true); return; }
    if (e.key === 'ArrowDown' && !e.shiftKey && collapsedSel && atLastLine(tx)) { if (isCell && cellNav(id, tx, 0, 1, true)) { e.preventDefault(); return; } e.preventDefault(); sync(id); goNext(id, true); return; }
    if (e.key === 'ArrowLeft' && !e.shiftKey && collapsedSel && caretOffset(tx) === 0 && !isCell) { e.preventDefault(); sync(id); goPrev(id); return; }
    if (e.key === 'ArrowRight' && !e.shiftKey && collapsedSel && caretOffset(tx) === textLen(tx) && !isCell) { e.preventDefault(); sync(id); goNext(id, false, true); return; }
  });

  // Перенос рядка в коді: зберігаємо відступ попереднього рядка
  function insertPlainNewline(tx) {
    const before = textBeforeCaret(tx); const line = before.slice(before.lastIndexOf('\n') + 1);
    const ind = /^\s*/.exec(line)[0];
    const text = '\n' + ind;
    const sel = getSelection(); const r = sel.getRangeAt(0); r.deleteContents();
    const node = document.createTextNode(text); r.insertNode(node);
    // Якщо це кінець блоку, браузеру потрібен ще один символ, щоб показати новий порожній рядок
    if (!node.nextSibling || (node.nextSibling.nodeType === 3 && !node.nextSibling.nodeValue)) { if (!tx.textContent.endsWith('\n\n') || true) { const z = document.createTextNode('\u200b'); node.after(z); } }
    const r2 = document.createRange(); r2.setStart(node, node.nodeValue.length); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2);
    tx.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertLineBreak' }));
  }
  function visibleIds() { return blocks.filter(b => !elOf(b.id).classList.contains('hid')).map(b => b.id); }
  function goPrev(id, end) { const v = visibleIds(); const i = v.indexOf(id); if (i > 0) { const p = blocks[idx(v[i - 1])]; if (p.type === 'math') elOf(p.id).classList.add('editing'); focusBlock(v[i - 1], -1); } }
  function goNext(id, _, start) { const v = visibleIds(); const i = v.indexOf(id); if (i >= 0 && i < v.length - 1) { const n = blocks[idx(v[i + 1])]; if (n.type === 'math') elOf(n.id).classList.add('editing'); focusBlock(v[i + 1], 0); } else if (i === v.length - 1) { const b = blocks[idx(id)]; if (b.type !== 'p' || b.text) { const n = newBlock('p'); insertBlocksAfter(id, [n]); } } }
  function exitTo(id) {
    sync(id); const el = elOf(id); el.classList.remove('editing');
    const b = blocks[idx(id)]; if (b.type === 'math') rerender(id);
    const i = idx(id);
    if (i === blocks.length - 1) { const n = newBlock('p', { indent: b.indent || 0 }); insertBlocksAfter(id, [n]); }
    else goNext(id, false, true);
    afterStructural();
  }
  function cellNav(id, tx, dx, dy = 0, onlyVertical) {
    const [r, c] = tx.dataset.cell.split(',').map(Number);
    const b = blocks[idx(id)]; sync(id);
    const rows = b.rows.length, cols = b.rows[0].length;
    let nr = r + dy, nc = c + dx;
    if (dx) { if (nc >= cols) { nc = 0; nr++; } if (nc < 0) { nc = cols - 1; nr--; } }
    if (nr < 0) { if (onlyVertical) return false; return false; }
    if (nr >= rows) {
      if (onlyVertical) { goNext(id, false, true); return true; }
      checkpoint(); b.rows.push(Array(cols).fill('')); rerender(id); afterStructural();
    }
    focusBlock(id, -1, `${nr},${nc}`); return true;
  }
  function toggleCheck(id) { const b = blocks[idx(id)]; sync(id); checkpoint(); b.checked = !b.checked; const off = txOf(id) ? caretOffset(txOf(id)) : 0; const had = document.activeElement && elOf(id).contains(document.activeElement); rerender(id); refresh(); afterStructural(); if (had) focusBlock(id, off); }
  function toggleCollapse(id) { collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); const el = elOf(id); el.querySelector('.tgl').classList.toggle('open', !collapsed.has(id)); refresh(); }

  // Вибір блоків: клавіші
  root.addEventListener('keydown', e => {
    if (!selected.size || e.target !== root) return;
    const mod = e.ctrlKey || e.metaKey;
    const ids = blocks.map(b => b.id).filter(id => selected.has(id));
    if (e.key === 'Escape') { e.preventDefault(); clearSelection(); return; }
    if (e.key === 'Backspace' || e.key === 'Delete') { e.preventDefault(); removeBlocks(ids); return; }
    if (e.key === 'Enter') { e.preventDefault(); const id = selFocus || ids[0]; clearSelection(); focusBlock(id, -1); return; }
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(ids); return; }
    if (mod && (e.key.toLowerCase() === 'z')) { e.preventDefault(); clearSelection(); e.shiftKey ? doRedo() : doUndo(); return; }
    if (mod && e.key.toLowerCase() === 'a') { e.preventDefault(); selectBlocks(blocks.map(b => b.id)); return; }
    if (mod && e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && ids.length === 1) { e.preventDefault(); moveBlock(ids[0], e.key === 'ArrowUp' ? -1 : 1); selectBlocks(ids); return; }
    if (e.key === 'Tab') { e.preventDefault(); checkpoint(); ids.forEach(id => { const b = blocks[idx(id)]; b.indent = Math.max(0, (b.indent || 0) + (e.shiftKey ? -1 : 1)); }); normalizeIndents(); refresh(); afterStructural(); return; }
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const v = visibleIds(); let i = v.indexOf(selFocus || ids[0]);
      i = Math.max(0, Math.min(v.length - 1, i + (e.key === 'ArrowUp' ? -1 : 1)));
      selFocus = v[i];
      selectBlocks(e.shiftKey ? selRange(selAnchor, selFocus) : [selFocus], e.shiftKey ? selAnchor : selFocus);
      elOf(selFocus).scrollIntoView({ block: 'nearest' });
      return;
    }
    if (e.key.length === 1 && !mod) { // друкування замінює вибрані блоки
      e.preventDefault(); checkpoint();
      const first = idx(ids[0]); const n = newBlock('p', { text: escInline(e.key), indent: blocks[first].indent || 0 });
      blocks = blocks.filter(b => !selected.has(b.id)); blocks.splice(first, 0, n); clearSelection(); renderAll(); afterStructural(); focusBlock(n.id, 1);
    }
  });
  root.addEventListener('copy', e => {
    if (!selected.size) return;
    e.preventDefault();
    const bs = blocks.filter(b => selected.has(b.id));
    const base = Math.min(...bs.map(b => b.indent || 0));
    e.clipboardData.setData('text/plain', serializeBlocks(bs.map(b => ({ ...b, indent: (b.indent || 0) - base }))));
  });
  root.addEventListener('cut', e => {
    if (!selected.size) return;
    e.preventDefault();
    const bs = blocks.filter(b => selected.has(b.id));
    e.clipboardData.setData('text/plain', serializeBlocks(bs));
    removeBlocks(bs.map(b => b.id));
  });

  // ---------- набирання тексту ----------
  list.addEventListener('input', e => {
    const tx = e.target.closest('.tx'); const bel = e.target.closest('.blk'); if (!tx || !bel) return;
    const id = bel.dataset.id; const b = blocks[idx(id)]; if (!b) return;
    if (b.type === 'math') { sync(id); const v = bel.querySelector('.math-view'); v.innerHTML = b.text.trim() ? renderTex(b.text, true) : `<span class="muted">${esc(t('ed.emptyMath'))}</span>`; typing(); return; }
    if (b.type === 'code') { sync(id); typing(); return; }
    if (e.inputType === 'insertText' && tx.classList.contains('cell') && e.data && /[*~=`$]/.test(e.data)) autoInline(tx);
    if (e.inputType === 'insertText' && TEXT_TYPES.has(b.type) && !tx.classList.contains('cell') && !tx.classList.contains('cap')) {
      if (e.data === ' ' && autoBlock(id, tx)) return;
      if (e.data === '-' || e.data === '`' || e.data === '$') { if (autoFence(id, tx)) return; }
      if (e.data && /[*~=`$]/.test(e.data)) autoInline(tx);
      if (e.data === '/') openSlash(id, tx);
      if (e.data === '[') { const before = textBeforeCaret(tx); if (before.endsWith('[[')) { deleteBefore(tx, 2); openWiki(id, tx); } }
    }
    sync(id); typing();
    if (slash) slash.update();
    refreshEmpty(tx);
  });
  const refreshEmpty = tx => tx.classList.toggle('is-empty', !tx.textContent && !tx.querySelector('.im,.wl'));
  function textBeforeCaret(tx) {
    const sel = getSelection(); if (!sel.rangeCount) return '';
    const r = document.createRange(); r.selectNodeContents(tx); r.setEnd(sel.getRangeAt(0).startContainer, sel.getRangeAt(0).startOffset);
    return r.toString();
  }
  function deleteBefore(tx, n) {
    const sel = getSelection(); for (let i = 0; i < n; i++) sel.modify ? sel.modify('extend', 'backward', 'character') : null;
    document.execCommand('delete');
  }
  // «# », «- », «1. », «[] », «> », «+ » на початку блоку
  function autoBlock(id, tx) {
    const before = textBeforeCaret(tx).replace(/ /g, ' ');
    const b = blocks[idx(id)];
    const map = [[/^#{1} $/, 'h1'], [/^#{2} $/, 'h2'], [/^#{3} $/, 'h3'], [/^[-*] $/, 'ul'], [/^\d+[.)] $/, 'ol'], [/^\[ ?\] $/, 'todo'], [/^\[x\] $/i, 'todo', { checked: true }], [/^> $/, 'quote'], [/^" $/, 'quote'], [/^\+ $/, 'toggle'], [/^! $/, 'callout']];
    for (const [re, type, extra] of map) {
      if (!re.test(before)) continue;
      if (b.type === type && type !== 'todo') return false;
      deleteBefore(tx, before.length);
      sync(id); setType(id, type, extra || {}); focusBlock(id, 0);
      return true;
    }
    return false;
  }
  function autoFence(id, tx) {
    const all = tx.textContent;
    if (all === '---' || all === '***') { setType(id, 'hr'); return true; }
    if (all === '```') { tx.textContent = ''; sync(id); setType(id, 'code'); return true; }
    if (all === '$$') { tx.textContent = ''; sync(id); setType(id, 'math'); return true; }
    return false;
  }
  // **жирний**, *курсив*, ~~закреслений~~, ==виділення==, `код`, $формула$ — перетворюються одразу після закривального знака
  function autoInline(tx) {
    const sel = getSelection(); if (!sel.isCollapsed) return;
    const node = sel.anchorNode; if (!node || node.nodeType !== 3) return;
    if (node.parentElement.closest('code')) return;
    const before = node.nodeValue.slice(0, sel.anchorOffset);
    const rules = [
      [/\*\*([^*\s][^*]*?[^*\s]|[^*\s])\*\*$/, 'strong'], [/~~([^~\s][^~]*?)~~$/, 's'], [/==([^=\s][^=]*?)==$/, 'mark'],
      [/(?<![*\w])\*([^*\s][^*]*?)\*$/, 'em'], [/`([^`]+)`$/, 'code'], [/(?<![$\w\\])\$([^$\s](?:[^$]*[^$\s])?)\$$/, 'math'],
    ];
    for (const [re, tag] of rules) {
      const m = re.exec(before); if (!m) continue;
      const start = sel.anchorOffset - m[0].length;
      const r = document.createRange(); r.setStart(node, start); r.setEnd(node, sel.anchorOffset);
      r.deleteContents();
      let el;
      if (tag === 'math') { el = h(`<span class="im" contenteditable="false" data-tex="${esc(m[1])}">${renderTex(m[1], false)}</span>`); }
      else { el = document.createElement(tag); el.textContent = m[1]; }
      r.insertNode(el);
      const after = document.createTextNode('​'); el.after(after);
      const r2 = document.createRange(); r2.setStart(after, 1); r2.collapse(true); sel.removeAllRanges(); sel.addRange(r2);
      return;
    }
  }
  function wrapSel(tag) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0);
    const anc = (r.commonAncestorContainer.nodeType === 1 ? r.commonAncestorContainer : r.commonAncestorContainer.parentElement).closest(tag);
    if (anc) { const p = anc.parentNode; while (anc.firstChild) p.insertBefore(anc.firstChild, anc); anc.remove(); }
    else if (!r.collapsed) { const el = document.createElement(tag); el.appendChild(r.extractContents()); r.insertNode(el); sel.removeAllRanges(); const r2 = document.createRange(); r2.selectNodeContents(el); sel.addRange(r2); }
    const id = curBlockId(); if (id) { sync(id); typing(); }
  }
  function linkSel(tx) {
    const sel = getSelection(); if (!sel.rangeCount) return;
    const r = sel.getRangeAt(0).cloneRange();
    const existing = (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement).closest('a:not(.wl)');
    const box = h(`<form class="pop-form"><input type="url" placeholder="${esc(t('ed.linkPh'))}" value="${esc(existing ? existing.getAttribute('href') : '')}"><button class="btn primary sm">${t('misc.ok')}</button></form>`);
    const rect = caretRect();
    const p = popover(null, box, { at: { x: rect ? rect.left : 100, y: rect ? rect.bottom + 6 : 100 }, sheet: false });
    const inp = box.querySelector('input'); setTimeout(() => inp.focus(), 0);
    box.onsubmit = ev => {
      ev.preventDefault(); let url = inp.value.trim(); p.close();
      tx.focus(); sel.removeAllRanges(); sel.addRange(r);
      if (existing) { if (!url) { const pa = existing.parentNode; while (existing.firstChild) pa.insertBefore(existing.firstChild, existing); existing.remove(); } else existing.setAttribute('href', url); }
      else if (url) {
        if (!/^[a-z]+:/i.test(url)) url = 'https://' + url;
        if (r.collapsed) document.execCommand('insertHTML', false, `<a href="${esc(url)}">${esc(url)}</a>`);
        else document.execCommand('createLink', false, url);
      }
      const id = curBlockId(); if (id) { sync(id); typing(); }
    };
  }
  function inlineMath(tx, existingEl) {
    const sel = getSelection();
    const r = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const initial = existingEl ? existingEl.dataset.tex : (r && !r.collapsed ? r.toString() : '');
    const box = h(`<form class="pop-form math-pop"><input class="mono" value="${esc(initial)}" placeholder="${esc(t('ed.mathPh'))}" spellcheck="false"><div class="math-prev"></div></form>`);
    const rect = existingEl ? existingEl.getBoundingClientRect() : caretRect();
    const p = popover(null, box, { at: { x: rect ? rect.left : 100, y: rect ? rect.bottom + 6 : 100 }, sheet: false });
    const inp = box.querySelector('input'); const prev = box.querySelector('.math-prev');
    const draw = () => { prev.innerHTML = inp.value.trim() ? renderTex(inp.value, false) : ''; };
    draw(); inp.oninput = draw; setTimeout(() => { inp.focus(); inp.select(); }, 0);
    box.onsubmit = ev => {
      ev.preventDefault(); const v = inp.value.trim(); p.close();
      tx.focus();
      if (existingEl) { if (v) { existingEl.dataset.tex = v; existingEl.innerHTML = renderTex(v, false); } else existingEl.remove(); }
      else if (v && r) {
        sel.removeAllRanges(); sel.addRange(r); r.deleteContents();
        const el = h(`<span class="im" contenteditable="false" data-tex="${esc(v)}">${renderTex(v, false)}</span>`);
        r.insertNode(el); const after = document.createTextNode('​'); el.after(after);
        const r2 = document.createRange(); r2.setStart(after, 1); sel.removeAllRanges(); sel.addRange(r2);
      }
      const id = curBlockId() || (tx.closest('.blk') && tx.closest('.blk').dataset.id); if (id) { sync(id); typing(); }
    };
  }

  // ---------- меню «/» ----------
  function openSlash(id, tx) {
    const before = textBeforeCaret(tx);
    if (before.length > 1 && !/\s\/$/.test(before)) return;
    const rect = caretRect();
    const box = h('<div class="menu slash" role="listbox"></div>');
    const p = popover(null, box, { at: { x: rect ? rect.left : 0, y: rect ? rect.bottom + 4 : 0 }, sheet: false, onClose: () => { slash = null; } });
    let items = SLASH(), act = 0, q = '';
    const draw = () => {
      const qq = q.toLowerCase();
      items = SLASH().filter(it => !qq || it.l.toLowerCase().includes(qq) || it.s.includes(qq));
      act = Math.min(act, Math.max(0, items.length - 1));
      box.innerHTML = items.length ? items.map((it, i) => `<button class="menu-i ${i === act ? 'act' : ''}" data-k="${it.k}" tabindex="-1">${icon(it.i)}<span class="menu-l">${esc(it.l)}</span></button>`).join('') : `<div class="menu-h">${esc(t('ed.noResults'))}</div>`;
      const a = box.querySelector('.act'); a && a.scrollIntoView({ block: 'nearest' });
      p.place();
    };
    draw();
    box.addEventListener('pointerdown', e => e.preventDefault());
    box.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) choose(b.dataset.k); });
    const choose = k => {
      p.close();
      deleteBefore(tx, q.length + 1);
      sync(id);
      applyCommand(id, k, tx);
    };
    slash = {
      key(e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % Math.max(1, items.length); draw(); return true; }
        if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + items.length) % Math.max(1, items.length); draw(); return true; }
        if (e.key === 'Enter' || e.key === 'Tab') { if (items[act]) { e.preventDefault(); choose(items[act].k); return true; } p.close(); return false; }
        if (e.key === 'Escape') { e.preventDefault(); p.close(); return true; }
        return false;
      },
      update() {
        const b = textBeforeCaret(tx); const i = b.lastIndexOf('/');
        if (i < 0) { p.close(); return; }
        q = b.slice(i + 1);
        if (q.length > 24 || /\s\s/.test(q)) { p.close(); return; }
        draw();
        if (!items.length && q.endsWith(' ')) p.close();
      },
    };
  }
  function applyCommand(id, k, tx) {
    const b = blocks[idx(id)];
    const empty = !b.text || !b.text.trim();
    if (k === 'imath') { inlineMath(tx); return; }
    if (k === 'wiki') { openWiki(id, tx); return; }
    if (k === 'image') { pickImage(id, empty); return; }
    if (k === 'callout') { if (empty) setType(id, 'callout', { kind: 'note' }); else insertBlocksAfter(id, [newBlock('callout', { kind: 'note', indent: b.indent || 0 })]); return; }
    if (empty) { setType(id, k); return; }
    const n = newBlock(k, { indent: b.indent || 0 });
    if (k === 'table') n.rows = [['', ''], ['', '']];
    if (k === 'todo') n.checked = false;
    insertBlocksAfter(id, k === 'hr' ? [n, newBlock('p', { indent: b.indent || 0 })] : [n]);
  }
  function pickImage(id, replaceEmpty) {
    const inp = h('<input type="file" accept="image/*" multiple hidden>');
    document.body.appendChild(inp);
    inp.onchange = async () => { const files = [...inp.files]; inp.remove(); await insertImages(id, files, replaceEmpty); };
    inp.click();
  }
  async function insertImages(id, files, replaceEmpty) {
    if (!opts.addImage) return;
    const nbs = [];
    for (const f of files) {
      if (f.size > 30 * 1024 * 1024) { toast(t('ed.imgTooBig')); continue; }
      const ref = await opts.addImage(f);
      if (ref) nbs.push(newBlock('image', { src: 'asset:' + ref, alt: '' }));
    }
    if (!nbs.length) return;
    const b = blocks[idx(id)];
    if (replaceEmpty && b && b.type === 'p' && !b.text) {
      checkpoint(); const i = idx(id); blocks.splice(i, 1, ...nbs, newBlock('p', { indent: b.indent || 0 })); renderAll(); afterStructural(); focusBlock(blocks[i + nbs.length].id);
    } else insertBlocksAfter(id, [...nbs, newBlock('p', { indent: b ? b.indent || 0 : 0 })]);
  }

  // ---------- посилання на нотатки [[ ]] ----------
  function openWiki(id, tx) {
    const sel = getSelection(); const r = sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    const rect = caretRect();
    const box = h(`<div class="wiki-pop"><input placeholder="${esc(t('ed.wikiPh'))}"><div class="menu"></div></div>`);
    const p = popover(null, box, { at: { x: rect ? rect.left : 100, y: rect ? rect.bottom + 6 : 100 }, sheet: false });
    const inp = box.querySelector('input'), res = box.querySelector('.menu');
    let items = [], act = 0;
    const draw = () => {
      const q = inp.value.trim();
      items = (opts.searchNotes ? opts.searchNotes(q) : []).slice(0, 8);
      if (q && opts.createNote) items.push({ create: true, title: q });
      act = Math.min(act, Math.max(0, items.length - 1));
      res.innerHTML = items.map((it, i) => `<button class="menu-i ${i === act ? 'act' : ''}" data-i="${i}" tabindex="-1">${icon(it.create ? 'plus' : 'notes')}<span class="menu-l">${esc(it.create ? t('ed.wikiNew', { t: it.title }) : it.title || t('entry.untitled'))}</span></button>`).join('') || `<div class="menu-h">${esc(t('ed.noResults'))}</div>`;
    };
    const choose = async it => {
      p.close();
      let target = it;
      if (it.create) target = await opts.createNote(it.title);
      tx.focus();
      if (r) { sel.removeAllRanges(); sel.addRange(r); }
      const el = h(`<a class="wl" contenteditable="false" data-wiki="${esc(target.id)}" data-title="${esc(target.title || '')}" href="#">${esc(target.title || t('entry.untitled'))}</a>`);
      const rr = sel.getRangeAt(0); rr.insertNode(el); const after = document.createTextNode('​'); el.after(after);
      const r2 = document.createRange(); r2.setStart(after, 1); sel.removeAllRanges(); sel.addRange(r2);
      sync(id); typing();
    };
    draw(); setTimeout(() => inp.focus(), 0);
    inp.oninput = () => { act = 0; draw(); };
    inp.onkeydown = e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); act = (act + 1) % Math.max(1, items.length); draw(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); act = (act - 1 + items.length) % Math.max(1, items.length); draw(); }
      if (e.key === 'Enter') { e.preventDefault(); if (items[act]) choose(items[act]); }
    };
    res.addEventListener('pointerdown', e => e.preventDefault());
    res.addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) choose(items[+b.dataset.i]); });
  }

  // ---------- вставка ----------
  list.addEventListener('paste', async e => {
    const tx = e.target.closest('.tx'); const bel = e.target.closest('.blk'); if (!tx || !bel) return;
    const id = bel.dataset.id; const b = blocks[idx(id)];
    const files = [...(e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); sync(id); await insertImages(id, files, b.type === 'p' && !b.text); return; }
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;
    e.preventDefault();
    if (b.type === 'code' || b.type === 'math' || tx.classList.contains('cap')) { document.execCommand('insertText', false, text); return; }
    const sel = getSelection();
    if (/^https?:\/\/\S+$/.test(text.trim()) && !sel.isCollapsed) { document.execCommand('createLink', false, text.trim()); sync(id); typing(); return; }
    if (!text.includes('\n') || tx.classList.contains('cell')) {
      const html = inlineToHtml(text.replace(/\n/g, ' '), wikiOpts);
      document.execCommand('insertHTML', false, html); sync(id); typing(); return;
    }
    // Багаторядкова вставка: розбираємо як Markdown на блоки
    const parsed = parseBlocks(text);
    if (!parsed.length) return;
    sync(id); checkpoint();
    const [left, right] = rangeHtmlParts(tx);
    const i = idx(id);
    const base = b.indent || 0;
    parsed.forEach(p => { p.indent = (p.indent || 0) + base; });
    if (!left && TEXT_TYPES.has(parsed[0].type) && b.type === 'p') { blocks.splice(i, 1); }
    else { b.text = left; i; }
    const at = left || b.type !== 'p' || !TEXT_TYPES.has(parsed[0].type) ? i + 1 : i;
    blocks.splice(at, 0, ...parsed);
    let last = parsed[parsed.length - 1];
    if (right) { if (TEXT_TYPES.has(last.type)) last.text += right; else { const n = newBlock('p', { text: right, indent: base }); blocks.splice(at + parsed.length, 0, n); last = n; } }
    normalizeIndents(); renderAll(); afterStructural();
    focusBlock(last.id, -1);
  });

  // ---------- миша і дотики ----------
  list.addEventListener('click', e => {
    const bel = e.target.closest('.blk'); if (!bel) return;
    const id = bel.dataset.id; const b = blocks[idx(id)];
    if (e.target.closest('.tdc')) { e.preventDefault(); toggleCheck(id); return; }
    if (e.target.closest('.tgl')) { e.preventDefault(); toggleCollapse(id); return; }
    if (e.target.closest('.co-k')) { e.preventDefault(); calloutMenu(e.target.closest('.co-k'), id); return; }
    if (e.target.closest('.blk-add')) { e.preventDefault(); addBelow(id); return; }
    if (e.target.closest('[data-tbl]')) { e.preventDefault(); tableAdd(id, e.target.closest('[data-tbl]').dataset.tbl); return; }
    if (e.target.closest('.math-view')) { bel.classList.add('editing'); focusBlock(id, -1); return; }
    const im = e.target.closest('.im'); if (im) { e.preventDefault(); inlineMath(im.closest('.tx'), im); return; }
    const wl = e.target.closest('.wl'); if (wl) { e.preventDefault(); sync(id); emit.flush(); opts.openWiki && opts.openWiki(wl.dataset.wiki, wl.dataset.title); return; }
    const a = e.target.closest('a[href]');
    if (a && (e.ctrlKey || e.metaKey || isTouch() || !a.closest('[contenteditable="true"]'))) { e.preventDefault(); window.open(a.href, '_blank', 'noopener'); return; }
    if (a) { linkPopover(a); }
    if (b && b.type === 'toggle' && bel.classList.contains('empty-toggle') && e.target === bel.querySelector('.blk-body')) { addChild(id); }
  });
  list.addEventListener('focusout', e => {
    if (rendering) return;
    const bel = e.target.closest('.blk'); if (!bel || !bel.isConnected) return;
    const id = bel.dataset.id; const b = blocks[idx(id)];
    if (!b) return;
    sync(id);
    if (b.type === 'math' && !(e.relatedTarget && bel.contains(e.relatedTarget))) { bel.classList.remove('editing'); const v = bel.querySelector('.math-view'); if (v) v.innerHTML = b.text.trim() ? renderTex(b.text, true) : `<span class="muted">${esc(t('ed.emptyMath'))}</span>`; }
  });
  list.addEventListener('change', e => {
    if (e.target.classList.contains('code-lang')) { const id = e.target.closest('.blk').dataset.id; checkpoint(); blocks[idx(id)].lang = e.target.value.trim(); afterStructural(); }
  });
  function linkPopover(a) {
    const box = h(`<div class="link-pop"><a href="${esc(a.href)}" target="_blank" rel="noopener" class="link-url">${esc(a.href.replace(/^https?:\/\//, '').slice(0, 48))}</a><button class="icon-btn sm" data-e title="${esc(t('misc.edit'))}">${icon('link')}</button></div>`);
    const p = popover(a, box, { sheet: false });
    box.querySelector('[data-e]').onclick = () => { p.close(); const r = document.createRange(); r.selectNodeContents(a); const s = getSelection(); s.removeAllRanges(); s.addRange(r); linkSel(a.closest('.tx')); };
  }
  function calloutMenu(btn, id) {
    menu(btn, CALLOUTS.map(k => ({ label: t('ed.callout.' + k), icon: k === 'warning' ? 'alert' : k === 'tip' ? 'target' : k === 'important' ? 'info' : 'callout', active: blocks[idx(id)].kind === k, act: () => { sync(id); checkpoint(); blocks[idx(id)].kind = k; rerender(id); refresh(); afterStructural(); } })));
  }
  function addBelow(id) {
    sync(id);
    const i = idx(id); const b = blocks[i];
    if (b.type === 'p' && !b.text) { focusBlock(id); document.execCommand('insertText', false, '/'); return; }
    const n = newBlock('p', { indent: b.indent || 0 });
    checkpoint(); const at = (b.type === 'toggle' && collapsed.has(b.id)) ? subtreeEnd(i) + 1 : i + 1;
    blocks.splice(at, 0, n); insertEl(n, blocks[at - 1].id); refresh(); afterStructural();
    focusBlock(n.id); document.execCommand('insertText', false, '/');
  }
  function addChild(id) { const i = idx(id); const b = blocks[i]; const n = newBlock('p', { indent: (b.indent || 0) + 1 }); checkpoint(); blocks.splice(i + 1, 0, n); insertEl(n, id); refresh(); afterStructural(); focusBlock(n.id); }
  function tableAdd(id, what) {
    sync(id); checkpoint(); const b = blocks[idx(id)];
    if (what === 'row') b.rows.push(Array(b.rows[0].length).fill(''));
    else b.rows.forEach(r => r.push(''));
    rerender(id); afterStructural();
    focusBlock(id, 0, what === 'row' ? `${b.rows.length - 1},0` : `0,${b.rows[0].length - 1}`);
  }

  // Меню блоку (клік по «ручці»), перетягування блоків
  list.addEventListener('pointerdown', e => {
    const grip = e.target.closest('.blk-grip'); if (!grip) return;
    e.preventDefault();
    const bel = grip.closest('.blk'); const id = bel.dataset.id;
    sync(id);
    const y0 = e.clientY; let dragging = false, line = null, target = null;
    const mv = ev => {
      if (!dragging && Math.abs(ev.clientY - y0) < 5) return;
      if (!dragging) { dragging = true; bel.classList.add('dragging'); line = h('<div class="drop-line"></div>'); root.appendChild(line); }
      const els = $$('.blk:not(.hid)', list).filter(x => x !== bel);
      let best = null, before = true;
      for (const x of els) { const r = x.getBoundingClientRect(); if (ev.clientY < r.top + r.height / 2) { best = x; before = true; break; } best = x; before = false; }
      target = best ? { id: best.dataset.id, before } : null;
      if (best) { const r = best.getBoundingClientRect(), rr = root.getBoundingClientRect(); line.style.top = (before ? r.top : r.bottom) - rr.top + 'px'; }
    };
    const up = () => {
      removeEventListener('pointermove', mv); removeEventListener('pointerup', up);
      if (!dragging) { blockMenu(grip, id); return; }
      bel.classList.remove('dragging'); line && line.remove();
      if (!target) return;
      const i = idx(id); const end = subtreeEnd(i); const chunk = blocks.slice(i, end + 1);
      if (chunk.some(b => b.id === target.id)) return;
      checkpoint();
      blocks.splice(i, chunk.length);
      let at = idx(target.id); if (!target.before) at = subtreeEnd(at) + 1;
      const prevInd = at > 0 ? (blocks[at - 1].indent || 0) : -1;
      const nextInd = blocks[at] ? (blocks[at].indent || 0) : 0;
      const want = target.before ? nextInd : Math.min(chunk[0].indent || 0, prevInd + 1);
      const d = Math.max(0, Math.min(prevInd + 1, want)) - (chunk[0].indent || 0);
      chunk.forEach(b => { b.indent = Math.max(0, (b.indent || 0) + d); });
      blocks.splice(at, 0, ...chunk); normalizeIndents(); renderAll(); afterStructural();
    };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  function blockMenu(anchor, id) {
    const b = blocks[idx(id)];
    const turn = [['p', 'ed.text', 'notes'], ['h1', 'ed.h1', 'heading'], ['h2', 'ed.h2', 'heading'], ['h3', 'ed.h3', 'heading'], ['ul', 'ed.ul', 'list'], ['ol', 'ed.ol', 'olist'], ['todo', 'ed.todo', 'todo'], ['toggle', 'ed.toggle', 'toggle'], ['quote', 'ed.quote', 'quote'], ['callout', 'ed.callout', 'callout'], ['code', 'ed.code', 'code'], ['math', 'ed.math', 'sigma']];
    const items = [];
    if (TEXT_TYPES.has(b.type) || b.type === 'code' || b.type === 'math') {
      items.push({ header: t('ed.turnInto') });
      turn.forEach(([k, l, i]) => items.push({ label: t(l), icon: i, active: b.type === k, act: () => setType(id, k) }));
      items.push('-');
    }
    if (b.type === 'table') {
      const cell = (document.activeElement && document.activeElement.dataset && document.activeElement.dataset.cell) || null;
      const [r, c] = (cell || '0,0').split(',').map(Number);
      items.push({ label: t('ed.delRow'), icon: 'trash', act: () => { sync(id); checkpoint(); if (b.rows.length > 1) b.rows.splice(r, 1); rerender(id); afterStructural(); } });
      items.push({ label: t('ed.delCol'), icon: 'trash', act: () => { sync(id); checkpoint(); if (b.rows[0].length > 1) b.rows.forEach(row => row.splice(c, 1)); rerender(id); afterStructural(); } });
      items.push('-');
    }
    items.push({ label: t('ed.duplicate'), icon: 'copy', hint: 'Ctrl+D', act: () => duplicate([id]) });
    items.push({ label: t('ed.moveUp'), icon: 'up', hint: 'Ctrl+Shift+↑', act: () => moveBlock(id, -1) });
    items.push({ label: t('ed.moveDown'), icon: 'down', hint: 'Ctrl+Shift+↓', act: () => moveBlock(id, 1) });
    items.push({ label: t('ed.delete'), icon: 'trash', danger: true, hint: 'Del', act: () => removeBlocks([id]) });
    menu(anchor, items);
  }

  // Перетягування мишею з одного блоку на інший перемикає на вибір цілих блоків
  list.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0 || e.target.closest('.blk-gut')) return;
    clearSelection();
    const start = e.target.closest('.blk'); if (!start) return;
    let active = false;
    const mv = ev => {
      const over = document.elementFromPoint(ev.clientX, ev.clientY); const b = over && over.closest && over.closest('.blk');
      if (!b || !list.contains(b)) return;
      if (b !== start || active) { active = true; selectBlocks(selRange(start.dataset.id, b.dataset.id), start.dataset.id); selFocus = b.dataset.id; }
    };
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
    addEventListener('pointermove', mv); addEventListener('pointerup', up);
  });
  // Клік нижче останнього блоку — новий рядок у кінці
  root.querySelector('.ed-tail').addEventListener('click', () => {
    const last = blocks[blocks.length - 1];
    if (last.type === 'p' && !last.text) { focusBlock(last.id); return; }
    const n = newBlock('p'); checkpoint(); blocks.push(n); insertEl(n, last.id); refresh(); afterStructural(); focusBlock(n.id);
  });
  root.addEventListener('pointerdown', e => { if (selected.size && !e.target.closest('.blk.sel')) clearSelection(); });

  // ---------- панель форматування над виділенням (миша) ----------
  let fmtBar = null;
  const onSel = () => {
    if (destroyed) return;
    const sel = getSelection();
    const tx = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentElement)?.closest('.tx');
    const ok = !isTouch() && sel.rangeCount && !sel.isCollapsed && tx && root.contains(tx) && !tx.classList.contains('code') && !tx.classList.contains('mathsrc') && tx.contains(sel.focusNode);
    if (!ok) { if (fmtBar) { fmtBar.remove(); fmtBar = null; } return; }
    if (!fmtBar) {
      fmtBar = h(`<div class="fmt-bar">${[['bold', 'bold', 'Ctrl+B'], ['italic', 'italic', 'Ctrl+I'], ['strike', 'strike', 'Ctrl+Shift+S'], ['code', 'inlinecode', 'Ctrl+E'], ['mark', 'mark', 'Ctrl+Shift+H'], ['link', 'link', 'Ctrl+K'], ['math', 'sigma', 'Ctrl+Shift+M']].map(([k, i, hk]) => `<button data-f="${k}" title="${hk}">${icon(i)}</button>`).join('')}</div>`);
      fmtBar.addEventListener('pointerdown', e => e.preventDefault());
      fmtBar.addEventListener('click', e => {
        const f = e.target.closest('[data-f]'); if (!f) return;
        const tx2 = getSelection().anchorNode && (getSelection().anchorNode.nodeType === 1 ? getSelection().anchorNode : getSelection().anchorNode.parentElement).closest('.tx');
        ({ bold: () => document.execCommand('bold'), italic: () => document.execCommand('italic'), strike: () => document.execCommand('strikeThrough'), code: () => wrapSel('code'), mark: () => wrapSel('mark'), link: () => linkSel(tx2), math: () => inlineMath(tx2) })[f.dataset.f]();
        const id = curBlockId(); if (id) { sync(id); typing(); }
      });
      document.body.appendChild(fmtBar);
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    fmtBar.style.left = Math.max(8, Math.min(innerWidth - fmtBar.offsetWidth - 8, r.left + r.width / 2 - fmtBar.offsetWidth / 2)) + 'px';
    fmtBar.style.top = Math.max(8, r.top - fmtBar.offsetHeight - 8) + 'px';
  };
  document.addEventListener('selectionchange', onSel);

  // ---------- панель над клавіатурою (телефон) ----------
  let kb = null;
  const vv = window.visualViewport;
  const placeKb = () => { if (!kb || !vv) return; kb.style.bottom = Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px'; };
  root.addEventListener('focusin', () => {
    if (!isTouch() || kb) return;
    kb = h(`<div class="kb-bar">${[['slash', 'plus'], ['todo', 'todo'], ['ul', 'list'], ['h', 'heading'], ['bold', 'bold'], ['italic', 'italic'], ['math', 'sigma'], ['out', 'outdent'], ['in', 'indent'], ['undo', 'undo'], ['redo', 'redo'], ['hide', 'keyboard']].map(([k, i]) => `<button data-kb="${k}" aria-label="${k}">${icon(i)}</button>`).join('')}</div>`);
    kb.addEventListener('pointerdown', e => e.preventDefault());
    kb.addEventListener('click', e => {
      const k = e.target.closest('[data-kb]'); if (!k) return;
      const id = curBlockId(); const tx = id && txOf(id);
      const a = k.dataset.kb;
      if (a === 'hide') { document.activeElement.blur(); return; }
      if (a === 'undo') { id && sync(id); doUndo(); return; }
      if (a === 'redo') { id && sync(id); doRedo(); return; }
      if (!id) return;
      const b = blocks[idx(id)];
      if (a === 'slash') { if (b.text) { addBelow(id); } else document.execCommand('insertText', false, '/'); return; }
      if (a === 'todo') { setType(id, b.type === 'todo' ? 'p' : 'todo'); return; }
      if (a === 'ul') { setType(id, b.type === 'ul' ? 'p' : 'ul'); return; }
      if (a === 'h') { setType(id, { p: 'h1', h1: 'h2', h2: 'h3', h3: 'p' }[b.type] || 'h2'); return; }
      if (a === 'bold') { document.execCommand('bold'); sync(id); typing(); return; }
      if (a === 'italic') { document.execCommand('italic'); sync(id); typing(); return; }
      if (a === 'math') { inlineMath(tx); return; }
      if (a === 'in' || a === 'out') { sync(id); indent(id, a === 'in' ? 1 : -1); }
    });
    document.body.appendChild(kb); document.body.classList.add('kb-open'); placeKb();
  });
  root.addEventListener('focusout', () => {
    setTimeout(() => { if (kb && !root.contains(document.activeElement)) { kb.remove(); kb = null; document.body.classList.remove('kb-open'); } }, 150);
  });
  vv && vv.addEventListener('resize', placeKb); vv && vv.addEventListener('scroll', placeKb);

  renderAll();

  return {
    el: root,
    getMarkdown() { const id = curBlockId(); if (id) sync(id); return serializeBlocks(blocks); },
    setMarkdown(md) {
      const f = focusInfo();
      blocks = parseBlocks(md || ''); if (!blocks.length) blocks = [newBlock()];
      undo = []; redo = []; stable = snap(); renderAll();
      if (f && blocks[idx(f.id)]) focusBlock(f.id, f.off);
    },
    focus(end) { const b = end ? blocks[blocks.length - 1] : blocks[0]; focusBlock(b.id, end ? -1 : 0); },
    isFocused: () => root.contains(document.activeElement),
    hasPending: () => burst,
    flush() { const id = curBlockId(); if (id) sync(id); emit.flush(); },
    outline: () => headings(blocks),
    scrollTo(id) { const e = elOf(id); if (e) { e.scrollIntoView({ block: 'start', behavior: 'smooth' }); const tx = e.querySelector('.tx'); tx && setTimeout(() => focusBlock(id, -1), 300); } },
    words: () => { const txt = blocks.map(b => b.type === 'table' ? (b.rows || []).flat().join(' ') : b.type === 'image' ? '' : inlineToText(b.text || '')).join(' '); return (txt.match(/[\p{L}\p{N}]+/gu) || []).length; },
    setFont(f) { root.className = root.className.replace(/font-\w+/, 'font-' + f); },
    destroy() {
      destroyed = true; const id = curBlockId(); if (id) sync(id); emit.flush();
      document.removeEventListener('selectionchange', onSel);
      fmtBar && fmtBar.remove(); kb && kb.remove(); document.body.classList.remove('kb-open');
      vv && vv.removeEventListener('resize', placeKb); vv && vv.removeEventListener('scroll', placeKb);
      root.remove();
    },
  };
}
