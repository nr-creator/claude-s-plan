// LaTeX → MathML. Браузери (Chrome, Firefox, Safari) малюють MathML самі, тож бібліотеки не потрібні.
// Підтримано те, що трапляється в навчанні: дроби, корені, степені, індекси, грецькі літери, суми, інтеграли,
// границі, матриці, системи (cases), вирівнювання, \text, \mathbb і т. ін.

const X = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ϵ', varepsilon: 'ε', zeta: 'ζ', eta: 'η', theta: 'θ', vartheta: 'ϑ', iota: 'ι',
  kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο', pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς',
  tau: 'τ', upsilon: 'υ', phi: 'ϕ', varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
};
const UGREEK = { Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ', Psi: 'Ψ', Omega: 'Ω' };
const MI = { infty: '∞', partial: '∂', nabla: '∇', emptyset: '∅', varnothing: '∅', hbar: 'ℏ', ell: 'ℓ', aleph: 'ℵ', Re: 'ℜ', Im: 'ℑ', wp: '℘', angle: '∠', triangle: '△', degree: '°', imath: 'ı', jmath: 'ȷ', complement: '∁' };
const MO = {
  pm: '±', mp: '∓', times: '×', div: '÷', cdot: '⋅', ast: '∗', star: '⋆', circ: '∘', bullet: '∙', le: '≤', leq: '≤', ge: '≥', geq: '≥', leqslant: '⩽', geqslant: '⩾',
  ne: '≠', neq: '≠', approx: '≈', equiv: '≡', sim: '∼', simeq: '≃', cong: '≅', propto: '∝', ll: '≪', gg: '≫', in: '∈', notin: '∉', ni: '∋',
  subset: '⊂', subseteq: '⊆', supset: '⊃', supseteq: '⊇', subsetneq: '⊊', cup: '∪', cap: '∩', setminus: '∖', forall: '∀', exists: '∃', nexists: '∄',
  neg: '¬', lnot: '¬', land: '∧', wedge: '∧', lor: '∨', vee: '∨', oplus: '⊕', otimes: '⊗', to: '→', rightarrow: '→', leftarrow: '←', gets: '←',
  Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔', leftrightarrow: '↔', iff: '⟺', implies: '⟹', impliedby: '⟸', mapsto: '↦',
  longrightarrow: '⟶', longleftarrow: '⟵', Longrightarrow: '⟹', uparrow: '↑', downarrow: '↓', perp: '⊥', parallel: '∥', mid: '∣', nmid: '∤',
  cdots: '⋯', ldots: '…', dots: '…', vdots: '⋮', ddots: '⋱', langle: '⟨', rangle: '⟩', lfloor: '⌊', rfloor: '⌋', lceil: '⌈', rceil: '⌉',
  lvert: '|', rvert: '|', vert: '|', Vert: '‖', lVert: '‖', rVert: '‖', colon: ':', triangleq: '≜', coloneqq: '≔', because: '∵', therefore: '∴',
  top: '⊤', bot: '⊥', vdash: '⊢', models: '⊨', prec: '≺', succ: '≻', sqcup: '⊔', prime: '′', backslash: '∖', aleph: 'ℵ', circledast: '⊛',
  '{': '{', '}': '}', '|': '‖', '#': '#', '%': '%', '$': '$', '&': '&', '_': '_',
};
const BIG = { sum: '∑', prod: '∏', coprod: '∐', int: '∫', iint: '∬', iiint: '∭', oint: '∮', bigcup: '⋃', bigcap: '⋂', bigoplus: '⨁', bigotimes: '⨂', bigvee: '⋁', bigwedge: '⋀' };
const FUNCS = new Set('sin cos tan cot sec csc arcsin arccos arctan sinh cosh tanh coth log ln lg exp det deg dim gcd lcm ker arg hom Pr min max sup inf lim liminf limsup sgn tg ctg arctg arcctg sh ch th cth mod'.split(' '));
const LIMITS = new Set('lim max min sup inf liminf limsup sum prod coprod bigcup bigcap bigoplus bigotimes bigvee bigwedge'.split(' '));
const ACCENT = { hat: '^', widehat: '^', bar: '¯', overline: '¯', vec: '→', tilde: '~', widetilde: '~', dot: '˙', ddot: '¨', check: 'ˇ', breve: '˘', acute: '´', grave: '`', overrightarrow: '→', overleftarrow: '←' };
const UNDER = { underline: '_', underbrace: '⏟' };
const SPACE = { quad: '1em', qquad: '2em', ',': '0.167em', ':': '0.222em', ';': '0.278em', '>': '0.222em', ' ': '0.25em', enspace: '0.5em', '!': '-0.167em', thinspace: '0.167em' };
const DELIMS = new Set(['(', ')', '[', ']', '|', '.', '/', '<', '>']);

function mapFont(font, s) {
  const cp = c => c.codePointAt(0);
  return [...s].map(ch => {
    const up = ch >= 'A' && ch <= 'Z', lo = ch >= 'a' && ch <= 'z', dg = ch >= '0' && ch <= '9';
    const A = cp(ch) - 65, a = cp(ch) - 97, d = cp(ch) - 48;
    if (font === 'bf') { if (up) return String.fromCodePoint(0x1D400 + A); if (lo) return String.fromCodePoint(0x1D41A + a); if (dg) return String.fromCodePoint(0x1D7CE + d); }
    if (font === 'bb') {
      const ex = { C: 'ℂ', H: 'ℍ', N: 'ℕ', P: 'ℙ', Q: 'ℚ', R: 'ℝ', Z: 'ℤ' };
      if (up) return ex[ch] || String.fromCodePoint(0x1D538 + A); if (lo) return String.fromCodePoint(0x1D552 + a); if (dg) return String.fromCodePoint(0x1D7D8 + d);
    }
    if (font === 'cal') {
      const ex = { B: 'ℬ', E: 'ℰ', F: 'ℱ', H: 'ℋ', I: 'ℐ', L: 'ℒ', M: 'ℳ', R: 'ℛ', e: 'ℯ', g: 'ℊ', o: 'ℴ' };
      if (ex[ch]) return ex[ch]; if (up) return String.fromCodePoint(0x1D49C + A); if (lo) return String.fromCodePoint(0x1D4B6 + a);
    }
    if (font === 'frak') {
      const ex = { C: 'ℭ', H: 'ℌ', I: 'ℑ', R: 'ℜ', Z: 'ℨ' };
      if (ex[ch]) return ex[ch]; if (up) return String.fromCodePoint(0x1D504 + A); if (lo) return String.fromCodePoint(0x1D51E + a);
    }
    if (font === 'sf') { if (up) return String.fromCodePoint(0x1D5A0 + A); if (lo) return String.fromCodePoint(0x1D5BA + a); }
    return ch;
  }).join('');
}

function tokenize(src) {
  const toks = []; let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(src.slice(i));
      if (!m) { i++; continue; }
      toks.push({ t: 'cmd', v: m[1] }); i += m[0].length;
      if (/^[A-Za-z]/.test(m[1])) while (src[i] === ' ') i++; // пробіли після команди не значимі
      continue;
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) { const m = /^[0-9]+(?:[.,][0-9]+)?/.exec(src.slice(i)); toks.push({ t: 'num', v: m[0] }); i += m[0].length; continue; }
    toks.push({ t: 'ch', v: c }); i++;
  }
  return toks;
}

class P {
  constructor(src, display) { this.src = src; this.k = tokenize(src); this.i = 0; this.display = display; }
  peek() { return this.k[this.i]; }
  next() { return this.k[this.i++]; }
  isCh(v) { const t = this.peek(); return t && t.t === 'ch' && t.v === v; }
  isCmd(v) { const t = this.peek(); return t && t.t === 'cmd' && t.v === v; }
  // Сирий текст у дужках (для \text, \mathrm, назв середовищ)
  rawGroup() {
    const t = this.peek();
    if (!t) return '';
    if (!(t.t === 'ch' && t.v === '{')) { this.next(); return t.v; }
    this.next(); let depth = 1, out = '';
    while (this.peek()) {
      const x = this.next();
      if (x.t === 'ch' && x.v === '{') depth++;
      if (x.t === 'ch' && x.v === '}' && --depth === 0) break;
      out += x.t === 'cmd' ? (/^[A-Za-z]/.test(x.v) ? '\\' + x.v + ' ' : x.v) : x.v;
    }
    return out;
  }
  // Текстовий вміст \text{...} беремо з початкового рядка, щоб зберегти пробіли
  rawText() {
    const before = this.k.slice(0, this.i);
    const t = this.peek();
    if (!t || !(t.t === 'ch' && t.v === '{')) return this.rawGroup();
    // знайти позицію в джерелі: прохід по src з урахуванням дужок
    const idx = this.findSrcBrace(before.length);
    if (idx < 0) return this.rawGroup();
    let depth = 0, j = idx, out = '';
    for (; j < this.src.length; j++) {
      const c = this.src[j];
      if (c === '\\' && j + 1 < this.src.length) { if (depth >= 1) out += this.src[j + 1] === ' ' ? ' ' : this.src[j + 1]; j++; continue; }
      if (c === '{') { if (depth++ === 0) continue; }
      if (c === '}') { if (--depth === 0) break; }
      if (depth >= 1) out += c;
    }
    this.rawGroup();
    return out;
  }
  findSrcBrace(tokIndex) {
    // Ретокенізуємо з позиціями
    let i = 0, n = 0; const s = this.src;
    while (i < s.length) {
      if (s[i] === '\\') { const m = /^\\([A-Za-z]+|.)/.exec(s.slice(i)); if (!m) { i++; continue; } if (n === tokIndex) return -1; n++; i += m[0].length; if (/^[A-Za-z]/.test(m[1])) while (s[i] === ' ') i++; continue; }
      if (/\s/.test(s[i])) { i++; continue; }
      if (/[0-9]/.test(s[i])) { const m = /^[0-9]+(?:[.,][0-9]+)?/.exec(s.slice(i)); if (n === tokIndex) return -1; n++; i += m[0].length; continue; }
      if (n === tokIndex) return s[i] === '{' ? i : -1;
      n++; i++;
    }
    return -1;
  }
  group() {
    // Аргумент: {…} або один токен
    if (this.isCh('{')) { this.next(); const r = this.expr(['}']); if (this.isCh('}')) this.next(); return row(r); }
    const a = this.atom(); return a ?? '<mrow></mrow>';
  }
  expr(stops = []) {
    const out = [];
    while (this.peek()) {
      const t = this.peek();
      if (t.t === 'ch' && stops.includes(t.v)) break;
      if (t.t === 'cmd' && (stops.includes('\\' + t.v))) break;
      if (t.t === 'ch' && t.v === '}' ) { this.next(); continue; }
      const a = this.scripted();
      if (a != null) out.push(a);
    }
    return out;
  }
  scripted() {
    const t = this.peek();
    const bigName = t && t.t === 'cmd' && (BIG[t.v] || LIMITS.has(t.v)) ? t.v : null;
    this.fn = false;
    let base = this.atom();
    if (base == null) return null;
    const isFn = this.fn; this.fn = false;
    const fnSpace = r => isFn && !this.isCh('(') ? r + '<mspace width="0.1667em"></mspace>' : r;
    let sub = null, sup = null;
    for (;;) {
      if (this.isCh('^')) { this.next(); sup = this.group(); continue; }
      if (this.isCh('_')) { this.next(); sub = this.group(); continue; }
      if (this.isCh("'")) { let p = ''; while (this.isCh("'")) { this.next(); p += '′'; } sup = sup ? row([`<mo>${p}</mo>`, sup]) : `<mo>${p}</mo>`; continue; }
      if (this.isCmd('limits')) { this.next(); continue; }
      if (this.isCmd('nolimits')) { this.next(); continue; }
      break;
    }
    if (!sub && !sup) return fnSpace(base);
    const under = bigName && LIMITS.has(bigName) && (this.display || !BIG[bigName]);
    if (under) {
      if (sub && sup) return fnSpace(`<munderover>${base}${sub}${sup}</munderover>`);
      if (sub) return fnSpace(`<munder>${base}${sub}</munder>`);
      return fnSpace(`<mover>${base}${sup}</mover>`);
    }
    if (sub && sup) return fnSpace(`<msubsup>${base}${sub}${sup}</msubsup>`);
    if (sub) return fnSpace(`<msub>${base}${sub}</msub>`);
    return fnSpace(`<msup>${base}${sup}</msup>`);
  }
  delim() {
    const t = this.next(); if (!t) return '';
    let v = t.v;
    if (t.t === 'cmd') v = MO[t.v] || (t.v === '{' ? '{' : t.v === '}' ? '}' : t.v === '|' ? '‖' : t.v);
    if (v === '.') return '';
    return `<mo stretchy="true">${X(v)}</mo>`;
  }
  env(name) {
    if (name === 'array' && this.isCh('{')) this.rawGroup();
    const rows = []; let cells = [], cur = [];
    const endCell = () => { cells.push(row(cur)); cur = []; };
    while (this.peek()) {
      if (this.isCmd('end')) { this.next(); this.rawGroup(); break; }
      if (this.isCh('&')) { this.next(); endCell(); continue; }
      if (this.isCmd('\\')) { this.next(); endCell(); rows.push(cells); cells = []; continue; }
      const a = this.scripted(); if (a != null) cur.push(a);
    }
    if (cur.length || cells.length) { endCell(); rows.push(cells); }
    const align = (name === 'aligned' || name === 'align' || name === 'align*' || name === 'split') ? ' columnalign="right left right left"' : (name === 'cases' ? ' columnalign="left left"' : '');
    const tbl = `<mtable${align}${name.includes('matrix') ? '' : ' displaystyle="true"'}>${rows.map(r => `<mtr>${r.map(c => `<mtd>${c}</mtd>`).join('')}</mtr>`).join('')}</mtable>`;
    const wrap = { pmatrix: ['(', ')'], bmatrix: ['[', ']'], Bmatrix: ['{', '}'], vmatrix: ['|', '|'], Vmatrix: ['‖', '‖'], cases: ['{', ''] }[name];
    if (!wrap) return tbl;
    return row([`<mo stretchy="true">${wrap[0]}</mo>`, tbl, wrap[1] ? `<mo stretchy="true">${wrap[1]}</mo>` : '']);
  }
  atom() {
    const t = this.next();
    if (!t) return null;
    if (t.t === 'num') return `<mn>${X(t.v)}</mn>`;
    if (t.t === 'ch') {
      const c = t.v;
      if (c === '{') { const r = this.expr(['}']); if (this.isCh('}')) this.next(); return row(r); }
      if (c === '}') return null;
      if (c === '^' || c === '_') { const g = this.group(); return c === '^' ? `<msup><mrow></mrow>${g}</msup>` : `<msub><mrow></mrow>${g}</msub>`; }
      if (c === '&') return null;
      if (c === '~') return '<mspace width="0.333em"></mspace>';
      if (/\p{L}/u.test(c)) return `<mi>${X(c)}</mi>`;
      if (c === '-') return '<mo>−</mo>';
      if (c === '*') return '<mo>∗</mo>';
      if ('()[]|'.includes(c)) return `<mo stretchy="false">${X(c)}</mo>`;
      return `<mo>${X(c)}</mo>`;
    }
    const v = t.v;
    if (v === 'frac' || v === 'dfrac' || v === 'tfrac' || v === 'cfrac') { const a = this.group(), b = this.group(); return `<mfrac>${a}${b}</mfrac>`; }
    if (v === 'binom' || v === 'dbinom' || v === 'tbinom') { const a = this.group(), b = this.group(); return row(['<mo>(</mo>', `<mfrac linethickness="0">${a}${b}</mfrac>`, '<mo>)</mo>']); }
    if (v === 'sqrt') {
      if (this.isCh('[')) { this.next(); const n = this.expr([']']); if (this.isCh(']')) this.next(); const b = this.group(); return `<mroot>${b}${row(n)}</mroot>`; }
      return `<msqrt>${this.group()}</msqrt>`;
    }
    if (GREEK[v]) return `<mi>${GREEK[v]}</mi>`;
    if (UGREEK[v]) return `<mi mathvariant="normal">${UGREEK[v]}</mi>`;
    if (MI[v]) return `<mi mathvariant="normal">${MI[v]}</mi>`;
    if (BIG[v]) return `<mo largeop="true" movablelimits="${LIMITS.has(v)}">${BIG[v]}</mo>`;
    if (FUNCS.has(v)) {
      if (v === 'mod') return '<mo lspace="0.5em" rspace="0.5em">mod</mo>';
      this.fn = true; return `<mi>${v}</mi>`;
    }
    if (v === 'operatorname') { this.fn = true; return `<mi>${X(this.rawText())}</mi>`; }
    if (MO[v] && !(v in SPACE)) return `<mo>${X(MO[v])}</mo>`;
    if (v in SPACE) return `<mspace width="${SPACE[v]}"></mspace>`;
    if (ACCENT[v]) { const g = this.group(); return `<mover accent="true">${g}<mo stretchy="${v.startsWith('wide') || v.startsWith('over')}">${ACCENT[v]}</mo></mover>`; }
    if (UNDER[v]) { const g = this.group(); return `<munder accentunder="true">${g}<mo stretchy="true">${UNDER[v]}</mo></munder>`; }
    if (v === 'overbrace') { const g = this.group(); return `<mover>${g}<mo stretchy="true">⏞</mo></mover>`; }
    if (v === 'text' || v === 'textrm' || v === 'mbox' || v === 'textit' || v === 'textbf' || v === 'textsf' || v === 'texttt') return `<mtext>${X(this.rawText())}</mtext>`;
    if (v === 'mathrm' || v === 'rm' || v === 'mathup') return `<mi mathvariant="normal">${X(this.rawGroup().replace(/\\ /g, ' '))}</mi>`;
    if (v === 'mathit') return `<mi>${X(this.rawGroup())}</mi>`;
    if (v === 'mathbf' || v === 'bf' || v === 'boldsymbol' || v === 'bm') { const s = this.rawGroup(); const g = s.replace(/\\([A-Za-z]+)/g, (m, n) => GREEK[n] || UGREEK[n] || m).replace(/\s+/g, ''); return `<mi mathvariant="normal">${X(mapFont('bf', g))}</mi>`; }
    if (v === 'mathbb' || v === 'Bbb') return `<mi mathvariant="normal">${X(mapFont('bb', this.rawGroup().replace(/\s+/g, '')))}</mi>`;
    if (v === 'mathcal' || v === 'mathscr') return `<mi mathvariant="normal">${X(mapFont('cal', this.rawGroup().replace(/\s+/g, '')))}</mi>`;
    if (v === 'mathfrak') return `<mi mathvariant="normal">${X(mapFont('frak', this.rawGroup().replace(/\s+/g, '')))}</mi>`;
    if (v === 'mathsf') return `<mi mathvariant="normal">${X(mapFont('sf', this.rawGroup().replace(/\s+/g, '')))}</mi>`;
    if (v === 'left') { const l = this.delim(); const inner = this.expr(['\\right']); let r = ''; if (this.isCmd('right')) { this.next(); r = this.delim(); } return row([l, ...inner, r]); }
    if (v === 'right') { this.delim(); return null; }
    if (/^(big|Big|bigg|Bigg)[lrm]?$/.test(v)) { const t2 = this.next(); if (!t2) return null; const c = t2.t === 'cmd' ? (MO[t2.v] || t2.v) : t2.v; const size = { big: '1.2em', Big: '1.6em', bigg: '2.1em', Bigg: '2.6em' }[v.replace(/[lrm]$/, '')]; return `<mo minsize="${size}" maxsize="${size}">${X(c)}</mo>`; }
    if (v === 'begin') { const name = this.rawGroup(); return this.env(name); }
    if (v === 'end') { this.rawGroup(); return null; }
    if (v === '\\') return '<mspace linebreak="newline"></mspace>';
    if (v === 'color' || v === 'textcolor') { const c = this.rawGroup(); const g = this.group(); return `<mstyle mathcolor="${X(c)}">${g}</mstyle>`; }
    if (v === 'pmod') { const g = this.group(); return row(['<mo>(</mo><mo>mod</mo>', g, '<mo>)</mo>']); }
    if (v === 'not') { const nx = this.atom() || ''; return nx.replace(/<mo>(.*?)<\/mo>/, (m, s) => `<mo>${s}̸</mo>`); }
    if (v === 'displaystyle') return null;
    if (v === 'phantom') { this.group(); return '<mspace width="1em"></mspace>'; }
    return `<merror><mtext>\\${X(v)}</mtext></merror>`;
  }
}
const row = items => items.length === 1 ? items[0] : `<mrow>${items.join('')}</mrow>`;

const cache = new Map();
export function renderTex(src, display = false) {
  const key = (display ? 'D' : 'I') + src;
  if (cache.has(key)) return cache.get(key);
  let out;
  try {
    const p = new P(String(src || ''), display);
    const body = p.expr();
    out = `<math${display ? ' display="block"' : ''}><semantics>${row(body.filter(Boolean))}<annotation encoding="application/x-tex">${X(src)}</annotation></semantics></math>`;
  } catch (e) {
    out = `<math><merror><mtext>${X(src)}</mtext></merror></math>`;
  }
  if (cache.size > 2000) cache.clear();
  cache.set(key, out);
  return out;
}
