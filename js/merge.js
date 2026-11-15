// Злиття трьох версій запису: base (остання спільна), local (цей пристрій), remote (GitHub).
// Поле змінила лише одна сторона → береться її значення. Обидві змінили однаково → те саме.
// Обидві по-різному → текст конспекту зливається по рядках, інші поля — за пізнішим updatedAt.
import { deepEqual } from './util.js';

const SKIP = new Set(['updatedAt', 'updatedBy']);
const SET_FIELDS = new Set(['doneDates', 'exdates']);

export function merge3(base, local, remote) {
  const later = (local.updatedAt || '') > (remote.updatedAt || '') ? 'local' : 'remote';
  if (!base) {
    if (deepEqual(local, remote)) return { data: remote, conflicts: [] };
    const win = later === 'local' ? local : remote, lose = later === 'local' ? remote : local;
    return { data: win, conflicts: ['*'], winner: later, loser: lose };
  }
  const out = {}, conflicts = [];
  const keys = new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)]);
  for (const k of keys) {
    if (SKIP.has(k)) continue;
    const b = base[k], l = local[k], r = remote[k];
    let v;
    if (deepEqual(l, r)) v = l;
    else if (deepEqual(l, b)) v = r;
    else if (deepEqual(r, b)) v = l;
    else if (SET_FIELDS.has(k)) v = mergeSets(b, l, r);
    else if (k === 'body' && typeof (l ?? '') === 'string' && typeof (r ?? '') === 'string') {
      const m = mergeText(b || '', l || '', r || '', later);
      v = m.text; if (m.conflict) conflicts.push(k);
    } else { v = later === 'local' ? l : r; conflicts.push(k); }
    if (v !== undefined && v !== null) out[k] = v;
  }
  const t = later === 'local' ? local : remote;
  out.updatedAt = (local.updatedAt || '') > (remote.updatedAt || '') ? local.updatedAt : remote.updatedAt;
  if (t.updatedBy) out.updatedBy = t.updatedBy;
  const res = { data: out, conflicts };
  if (conflicts.length) { res.winner = later; res.loser = later === 'local' ? remote : local; }
  return res;
}

function mergeSets(b, l, r) {
  const B = new Set(b || []), L = new Set(l || []), R = new Set(r || []);
  const out = new Set([...L, ...R]);
  for (const x of B) if (!L.has(x) || !R.has(x)) out.delete(x);
  return [...out].sort();
}

// ---- Рядкове злиття (як у git) ----
function lcsHunks(a, b) {
  const n = a.length, m = b.length;
  const W = m + 1;
  const dp = new Uint32Array((n + 1) * W);
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--)
    dp[i * W + j] = a[i] === b[j] ? dp[(i + 1) * W + j + 1] + 1 : Math.max(dp[(i + 1) * W + j], dp[i * W + j + 1]);
  const hunks = []; let i = 0, j = 0, cur = null;
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { if (cur) { hunks.push(cur); cur = null; } i++; j++; continue; }
    if (!cur) cur = { bs: i, be: i, lines: [] };
    if (j < m && (i >= n || dp[i * W + j + 1] >= dp[(i + 1) * W + j])) { cur.lines.push(b[j]); j++; }
    else { i++; cur.be = i; }
  }
  if (cur) hunks.push(cur);
  return hunks;
}

export function mergeText(base, local, remote, later = 'remote', label = '') {
  if (local === remote) return { text: local, conflict: false };
  const B = base.split('\n'), L = local.split('\n'), R = remote.split('\n');
  if (B.length * Math.max(L.length, R.length) > 9e6) {
    return { text: later === 'local' ? local : remote, conflict: true };
  }
  const hs = [...lcsHunks(B, L).map(x => ({ ...x, side: 'L' })), ...lcsHunks(B, R).map(x => ({ ...x, side: 'R' }))].sort((x, y) => x.bs - y.bs || x.be - y.be);
  const out = []; let pos = 0, conflict = false;
  let k = 0;
  while (k < hs.length) {
    const group = [hs[k]]; let start = hs[k].bs, end = hs[k].be; k++;
    while (k < hs.length && (hs[k].bs < end || (hs[k].bs === start && hs[k].be === start) || (hs[k].bs === end && end === start))) { group.push(hs[k]); end = Math.max(end, hs[k].be); k++; }
    for (let x = pos; x < start; x++) out.push(B[x]);
    const sides = new Set(group.map(g => g.side));
    const apply = side => {
      const res = []; let p = start;
      for (const g of group.filter(g => g.side === side)) { for (let x = p; x < g.bs; x++) res.push(B[x]); res.push(...g.lines); p = g.be; }
      for (let x = p; x < end; x++) res.push(B[x]);
      return res;
    };
    if (sides.size === 1) out.push(...apply([...sides][0]));
    else {
      const a = apply('L'), b = apply('R');
      if (a.join('\n') === b.join('\n')) out.push(...a);
      else {
        conflict = true;
        const win = later === 'local' ? a : b, lose = later === 'local' ? b : a;
        out.push(...win);
        if (lose.some(l => l.trim())) {
          if (out.length && out[out.length - 1].trim()) out.push('');
          out.push(`> [!conflict] ${label}`.trimEnd(), ...lose.map(l => '> ' + l));
          out.push('');
        }
      }
    }
    pos = end;
  }
  for (let x = pos; x < B.length; x++) out.push(B[x]);
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n'), conflict };
}
