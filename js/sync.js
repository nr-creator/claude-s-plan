// Синхронізація з GitHub.
// Суть: на пристрої повна копія даних. Забрати чуже = порівняти хеші файлів у репозиторії з тими, що пам'ятаємо,
// і завантажити лише змінені. Відправити своє = усі зміни з черги одним комітом (Git Data API).
import * as store from './store.js';
import { api, GhError } from './github.js';
import { parse, serialize, canon } from './format.js';
import { merge3 } from './merge.js';
import { gitBlobSha, utf8, fromUtf8, b64ToBytes, bytesToB64, deepEqual, uid, nowISO } from './util.js';

const KINDS = [['entries/', 'entry', /^entries\/([\w-]+)\.md$/], ['subjects/', 'subject', /^subjects\/([\w-]+)\.md$/], ['folders/', 'folder', /^folders\/([\w-]+)\.md$/], ['assets/', 'asset', /^assets\/([\w-]+)\.(\w+)$/]];
const kindOf = path => { for (const [, k, re] of KINDS) { const m = re.exec(path); if (m) return { kind: k, id: m[1], ext: m[2] }; } return null; };
const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };

const state = {}; // spaceId → { status, error, lastSync }
let running = null, again = false, timer = null;

export const status = () => {
  const out = {};
  for (const s of store.spaces) out[s.id] = { ...(state[s.id] || {}), status: s.remote ? (state[s.id] || {}).status || 'idle' : 'local', pending: store.pendingCount(s.id) };
  return out;
};
const set = (id, patch) => { state[id] = { ...(state[id] || {}), ...patch }; store.emit('sync', status()); };

export async function getConflicts() { return (await store.getMeta('conflicts')) || []; }
async function logConflict(c) {
  const list = await getConflicts();
  list.unshift({ id: uid(), at: nowISO(), ...c });
  await store.setMeta('conflicts', list.slice(0, 200));
  store.emit('conflict', c);
}
export async function dismissConflict(id) { await store.setMeta('conflicts', (await getConflicts()).filter(c => c.id !== id)); store.emit('conflicts'); }

export function start() {
  store.setRemoteBlobFetcher(fetchBlob);
  const kick = () => syncAll();
  addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  store.on('dirty', () => { clearTimeout(timer); timer = setTimeout(kick, 2000); });
  store.on('spaces', kick);
  setInterval(() => { if (document.visibilityState === 'visible') kick(); }, 60000);
  kick();
}

export async function syncAll() {
  if (running) { again = true; return running; }
  running = (async () => {
    do {
      again = false;
      for (const sp of store.spaces) if (sp.remote && sp.remote.token) await syncSpace(sp);
    } while (again);
  })();
  try { await running; } finally { running = null; }
}

async function syncSpace(sp) {
  const r = sp.remote;
  if (!navigator.onLine) { set(sp.id, { status: 'offline' }); return; }
  set(sp.id, { status: 'syncing', error: null });
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      const head = await getHead(sp);
      await pull(sp, head);
      const ok = await push(sp, head);
      if (ok) break;
    }
    set(sp.id, { status: 'idle', lastSync: nowISO(), error: null });
  } catch (e) {
    console.warn('sync', sp.id, e);
    const code = e instanceof GhError ? e.code : 'other';
    set(sp.id, { status: code === 'net' ? 'offline' : 'error', error: { code, message: e.message } });
  }
}

async function getHead(sp) {
  const r = sp.remote;
  try {
    const ref = await api.ref(r);
    const sha = ref.object.sha;
    const meta = (await store.getMeta('head:' + sp.id)) || {};
    if (meta.sha === sha && meta.tree) return { sha, tree: meta.tree };
    const c = await api.commit(r, sha);
    return { sha, tree: c.tree.sha };
  } catch (e) {
    // Порожній репозиторій: створюємо перший коміт з README
    if (e instanceof GhError && (e.status === 409 || (e.status === 404 && /empty/i.test(e.message)))) {
      const readme = '# Дані застосунку «План»\n\nТут лежать записи (entries/), предмети (subjects/), папки (folders/) і зображення (assets/).\nКожен запис — окремий Markdown-файл. Редагувати можна й вручну.\n';
      await api.putFile(r, 'README.md', bytesToB64(utf8(readme)), 'Ініціалізація');
      const ref = await api.ref(r); const c = await api.commit(r, ref.object.sha);
      return { sha: ref.object.sha, tree: c.tree.sha };
    }
    throw e;
  }
}

async function pull(sp, head) {
  const meta = (await store.getMeta('head:' + sp.id)) || {};
  if (meta.sha === head.sha) return;
  const tree = await api.tree(sp.remote, head.tree);
  const remote = new Map();
  for (const it of tree.tree) if (it.type === 'blob' && kindOf(it.path)) remote.set(it.path, it.sha);
  const local = new Map();
  for (const rec of store.allRecs()) if (rec.space === sp.id) local.set(rec.path, rec);

  const need = [];
  for (const [path, sha] of remote) { const rec = local.get(path); if (!rec || rec.baseSha !== sha) need.push([path, sha]); }
  const fetched = new Map();
  await pool(need.filter(([p]) => kindOf(p).kind !== 'asset'), 8, async ([path, sha]) => {
    const b = await api.blob(sp.remote, sha);
    fetched.set(path, canon(parse(fromUtf8(b64ToBytes(b.content)))));
  });

  const puts = [], dels = [];
  for (const [path, sha] of need) {
    const k = kindOf(path); const rec = local.get(path); const key = store.keyOf(sp.id, path);
    if (k.kind === 'asset') {
      const data = { id: k.id, ext: k.ext, mime: MIME[k.ext] || 'application/octet-stream' };
      puts.push({ ...(rec || {}), key, space: sp.id, path, kind: 'asset', data: rec ? rec.data : data, base: data, baseSha: sha, dirty: rec ? rec.dirty : false, rev: rec ? rec.rev : 0 });
      continue;
    }
    const rdata = fetched.get(path); if (!rdata) continue;
    if (!rdata.id) rdata.id = k.id;
    if (!rec || !rec.dirty) { puts.push({ key, space: sp.id, path, kind: k.kind, data: rdata, base: rdata, baseSha: sha, dirty: false, rev: rec ? rec.rev : 0, purge: false }); continue; }
    if (rec.purge) {
      // Видалено тут, але змінено там: зміна не повинна зникнути — повертаємо запис
      puts.push({ ...rec, data: rdata, base: rdata, baseSha: sha, dirty: false, purge: false });
      await logConflict({ space: sp.id, recId: k.id, kind: k.kind, title: rdata.title || rdata.name || '', fields: ['deleted'], winner: 'remote', other: null });
      continue;
    }
    const m = merge3(rec.base, rec.data, rdata);
    const data = canon(m.data);
    puts.push({ ...rec, data, base: rdata, baseSha: sha, dirty: !deepEqual(data, rdata) });
    if (m.conflicts.length) await logConflict({ space: sp.id, recId: k.id, kind: k.kind, title: data.title || data.name || '', fields: m.conflicts, winner: m.winner, other: m.loser });
  }
  for (const [path, rec] of local) {
    if (remote.has(path) || !rec.baseSha) continue;
    if (rec.dirty && !rec.purge) {
      // Видалено там, змінено тут: зберігаємо локальну версію, вона відправиться як нова
      puts.push({ ...rec, base: null, baseSha: null });
      await logConflict({ space: sp.id, recId: rec.data.id, kind: rec.kind, title: rec.data.title || rec.data.name || '', fields: ['deleted-remote'], winner: 'local', other: null });
    } else dels.push(rec.key);
  }
  if (puts.length) await store.putRecs(puts, false);
  if (dels.length) await store.removeRecs(dels, false);
  await store.setMeta('head:' + sp.id, { sha: head.sha, tree: head.tree });
  if (puts.length || dels.length) store.touch();
}

async function push(sp, head) {
  const r = sp.remote;
  const dirty = [...store.allRecs()].filter(x => x.space === sp.id && x.dirty);
  if (!dirty.length) return true;
  let base = { ...head };
  for (let i = 0; i < dirty.length; i += 250) {
    const chunk = dirty.slice(i, i + 250);
    const entries = [], snaps = [];
    for (const rec of chunk) {
      if (rec.purge) { if (rec.baseSha) entries.push({ path: rec.path, mode: '100644', type: 'blob', sha: null }); snaps.push({ rec, sha: null }); continue; }
      if (rec.kind === 'asset') {
        const bytes = await store.getBlob(rec.key);
        if (!bytes) { snaps.push({ rec, skip: true }); continue; }
        const b = await api.createBlob(r, bytesToB64(bytes));
        entries.push({ path: rec.path, mode: '100644', type: 'blob', sha: b.sha }); snaps.push({ rec, sha: b.sha, data: rec.data }); continue;
      }
      const text = serialize(rec.data);
      entries.push({ path: rec.path, mode: '100644', type: 'blob', content: text });
      snaps.push({ rec, sha: await gitBlobSha(utf8(text)), data: rec.data, rev: rec.rev });
    }
    if (!entries.length) { await finish(snaps); continue; }
    const tree = await api.createTree(r, base.tree, entries);
    const msg = `${entries.length} ${entries.length === 1 ? 'зміна' : 'змін'} · ${deviceName()}`;
    const commit = await api.createCommit(r, msg, tree.sha, [base.sha]);
    try { await api.updateRef(r, commit.sha); }
    catch (e) { if (e instanceof GhError && (e.status === 422 || e.status === 409)) return false; throw e; } // хтось встиг раніше: забрати і повторити
    base = { sha: commit.sha, tree: tree.sha };
    await store.setMeta('head:' + sp.id, base);
    await finish(snaps);
  }
  return true;
}

async function finish(snaps) {
  const puts = [], dels = [];
  for (const s of snaps) {
    if (s.skip) continue;
    const cur = store.getRec(s.rec.key); if (!cur) continue;
    if (s.sha === null) { if (cur.purge) dels.push(cur.key); continue; }
    const still = cur.rev !== s.rec.rev; // поки відправляли, запис встигли змінити ще раз
    puts.push({ ...cur, base: s.data, baseSha: s.sha, dirty: still });
  }
  if (puts.length) await store.putRecs(puts, false);
  if (dels.length) await store.removeRecs(dels, false);
  store.emit('sync', status());
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const it = items[i++]; await fn(it); } }));
}

function deviceName() {
  const ua = navigator.userAgent;
  return /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : /Mac/.test(ua) ? 'macOS' : 'web';
}

export async function fetchBlob(spaceId, sha) {
  const sp = store.space(spaceId); if (!sp || !sp.remote) return null;
  const b = await api.blob(sp.remote, sha); return b64ToBytes(b.content);
}

// Перевірка простору перед збереженням: хто ми, чи є доступ на запис
export async function check(remote) {
  const user = await api.user(remote);
  const repo = await api.repo(remote);
  if (repo.permissions && repo.permissions.push === false) throw new GhError(403, '403', 'no push');
  return { login: user.login, branch: repo.default_branch || 'main', fullName: repo.full_name, private: repo.private };
}

// Історія версій одного файлу
export async function history(spaceId, path) {
  const sp = store.space(spaceId); if (!sp || !sp.remote) return null;
  const list = await api.commits(sp.remote, path);
  return list.map(c => ({ sha: c.sha, date: c.commit.author.date, author: (c.author && c.author.login) || c.commit.author.name, message: c.commit.message }));
}
export async function versionAt(spaceId, path, sha) {
  const sp = store.space(spaceId);
  const f = await api.fileAt(sp.remote, path, sha);
  return canon(parse(fromUtf8(b64ToBytes(f.content))));
}
export async function resetSpaceMeta(spaceId) { await store.setMeta('head:' + spaceId, null); }
