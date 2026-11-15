// Стан застосунку в пам'яті + збереження в IndexedDB.
// Кожен запис живе в одному просторі (space). Простір = окремий репозиторій GitHub або поки що лише цей пристрій.
import * as db from './db.js';
import { canon } from './format.js';
import { uid, nowISO, todayYmd, addDays, clone } from './util.js';
import { DEFAULTS as LOOK_DEFAULTS } from './theme.js';

const LS_SPACES = 'plan.spaces', LS_SETTINGS = 'plan.settings';
const listeners = new Map();
export const on = (ev, fn) => { if (!listeners.has(ev)) listeners.set(ev, new Set()); listeners.get(ev).add(fn); return () => listeners.get(ev).delete(fn); };
export const emit = (ev, ...a) => (listeners.get(ev) || []).forEach(f => { try { f(...a); } catch (e) { console.error(e); } });

const recs = new Map();
let version = 0, cache = {};
const bump = (detail) => { version++; cache = {}; emit('change', detail); };

// ---- Налаштування і простори (localStorage) ----
const defaultSettings = () => ({
  lang: (navigator.language || 'uk').toLowerCase().startsWith('en') ? 'en' : 'uk',
  theme: 'auto', weekStart: 1, noteFont: 'sans', noteWidth: 'normal', view: 'agenda', notify: false, startHour: 7,
});
export let settings = defaultSettings();
export let spaces = [];

function loadLS() {
  try { settings = { ...defaultSettings(), ...JSON.parse(localStorage.getItem(LS_SETTINGS) || '{}') }; } catch { settings = defaultSettings(); }
  // Вигляд: окремий об'єкт; старе поле theme переносимо в look.mode
  const look = settings.look || {};
  if (!settings.look && settings.theme) look.mode = settings.theme;
  settings.look = { ...LOOK_DEFAULTS, ...look };
  try { spaces = JSON.parse(localStorage.getItem(LS_SPACES) || '[]'); } catch { spaces = []; }
  if (!spaces.length) spaces = [{ id: 'local', name: '', kind: 'personal', color: 'ink', remote: null }];
}
export function saveLook(patch) {
  settings.look = { ...settings.look, ...patch };
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  emit('look', patch);
}
export function saveSettings(patch) {
  Object.assign(settings, patch);
  localStorage.setItem(LS_SETTINGS, JSON.stringify(settings));
  emit('settings', patch);
}
export function saveSpaces(list) {
  spaces = list;
  localStorage.setItem(LS_SPACES, JSON.stringify(spaces));
  bump({ spaces: true });
  emit('spaces');
}
export const space = id => spaces.find(s => s.id === id);
export const personalSpace = () => spaces.find(s => s.kind === 'personal') || spaces[0];
export const sharedSpaces = () => spaces.filter(s => s.kind === 'shared');
export const hiddenSpaces = new Set(JSON.parse(localStorage.getItem('plan.hidden') || '[]'));
export function toggleSpaceVisible(id) {
  hiddenSpaces.has(id) ? hiddenSpaces.delete(id) : hiddenSpaces.add(id);
  localStorage.setItem('plan.hidden', JSON.stringify([...hiddenSpaces])); bump({ visibility: true });
}

// ---- Записи ----
export const keyOf = (spaceId, path) => `${spaceId}/${path}`;
export const pathFor = (kind, id, ext) => kind === 'entry' ? `entries/${id}.md` : kind === 'subject' ? `subjects/${id}.md` : kind === 'folder' ? `folders/${id}.md` : `assets/${id}.${ext}`;
export const allRecs = () => recs.values();
export const getRec = key => recs.get(key);
export const recFor = (spaceId, kind, id) => {
  if (kind === 'asset') { for (const r of recs.values()) if (r.space === spaceId && r.kind === 'asset' && r.data.id === id) return r; return null; }
  return recs.get(keyOf(spaceId, pathFor(kind, id)));
};

export async function init() {
  loadLS();
  for (const r of await db.all('records')) recs.set(r.key, r);
  // Кошик: записи, видалені понад 30 днів тому, видаляємо остаточно
  const limit = new Date(Date.now() - 30 * 86400000).toISOString();
  for (const r of recs.values()) if (r.data && r.data.deletedAt && r.data.deletedAt < limit && !r.purge) await purgeRec(r, true);
  bump({ init: true });
}

const loginFor = spaceId => (space(spaceId) || {}).login || null;

async function persist(r) { recs.set(r.key, r); await db.put('records', r); }

// Внутрішній запис зміни: дані стають «брудними», тобто чекають на відправку
async function writeRec(spaceId, kind, data, opts = {}) {
  const path = pathFor(kind, data.id, data.ext);
  const key = keyOf(spaceId, path);
  const prev = recs.get(key);
  const r = prev ? { ...prev } : { key, space: spaceId, path, kind, base: null, baseSha: null, rev: 0 };
  r.data = canon(data);
  r.dirty = true; r.rev = (r.rev || 0) + 1; r.purge = false;
  await persist(r);
  if (!opts.silent) bump({ key, kind, space: spaceId, id: data.id });
  emit('dirty', spaceId);
  return r;
}

function stamp(spaceId, data, isNew) {
  const t = nowISO(), who = loginFor(spaceId);
  if (isNew) { data.createdAt = data.createdAt || t; if (who) data.createdBy = who; }
  data.updatedAt = t; if (who) data.updatedBy = who; else delete data.updatedBy;
  return data;
}

export async function createEntry(fields, spaceId = personalSpace().id) {
  const data = stamp(spaceId, { id: uid(), title: '', ...fields }, true);
  await writeRec(spaceId, 'entry', data);
  return { ...canon(data), space: spaceId };
}

// Багато записів одним проходом (імпорт): одна транзакція, одне оновлення інтерфейсу
export async function createEntries(list, spaceId) {
  const out = [];
  for (const fields of list) {
    const data = canon(stamp(spaceId, { id: uid(), title: '', ...fields }, true));
    const path = pathFor('entry', data.id);
    out.push({ key: keyOf(spaceId, path), space: spaceId, path, kind: 'entry', data, base: null, baseSha: null, dirty: true, rev: 1, purge: false });
  }
  await putRecs(out);
  emit('dirty', spaceId);
  return out.length;
}

export async function updateEntry(spaceId, id, patch, opts) {
  const r = recFor(spaceId, 'entry', id);
  if (!r) return null;
  const data = { ...r.data, ...patch };
  stamp(spaceId, data, false);
  await writeRec(spaceId, 'entry', data, opts);
  return { ...canon(data), space: spaceId };
}

export const deleteEntry = (spaceId, id) => updateEntry(spaceId, id, { deletedAt: nowISO() });
export const restoreEntry = (spaceId, id) => updateEntry(spaceId, id, { deletedAt: null });

async function purgeRec(r, silent) {
  if (!r.baseSha) { recs.delete(r.key); await db.del('records', r.key); if (r.kind === 'asset') await db.del('blobs', r.key); }
  else { const n = { ...r, purge: true, dirty: true }; await persist(n); emit('dirty', r.space); }
  if (!silent) bump({ key: r.key });
}
export async function purgeEntry(spaceId, id) { const r = recFor(spaceId, 'entry', id); if (r) await purgeRec(r); }
export async function emptyTrash() {
  for (const r of [...recs.values()]) if (!r.purge && r.data && r.data.deletedAt) await purgeRec(r, true);
  bump({ trash: true });
}

// Перенесення між просторами: копія в цільовий, остаточне видалення з вихідного (разом із конспектами занять)
export async function moveEntry(fromSpace, id, toSpace) {
  if (fromSpace === toSpace) return;
  const ids = [id, ...entries({ withDeleted: true }).filter(e => e.space === fromSpace && e.parent === id).map(e => e.id)];
  for (const x of ids) {
    const r = recFor(fromSpace, 'entry', x); if (!r) continue;
    const data = stamp(toSpace, clone(r.data), false);
    await writeRec(toSpace, 'entry', data, { silent: true });
    await purgeRec(r, true);
  }
  bump({ moved: id });
}

// ---- Предмети ----
export async function createSubject(fields, spaceId = personalSpace().id) {
  const data = stamp(spaceId, { id: uid(), name: '', color: 'teal', ...fields }, true);
  await writeRec(spaceId, 'subject', data);
  return { ...canon(data), space: spaceId };
}
export async function updateSubject(spaceId, id, patch) {
  const r = recFor(spaceId, 'subject', id); if (!r) return;
  const data = stamp(spaceId, { ...r.data, ...patch }, false);
  await writeRec(spaceId, 'subject', data);
}
export async function deleteSubject(spaceId, id) {
  await updateSubject(spaceId, id, { deletedAt: nowISO() });
}

// ---- Папки нотаток (окремо від предметів; можуть бути вкладеними) ----
export async function createFolder(fields, spaceId = personalSpace().id) {
  const data = stamp(spaceId, { id: uid(), name: '', parent: null, ...fields }, true);
  await writeRec(spaceId, 'folder', data);
  return { ...canon(data), space: spaceId };
}
export async function updateFolder(spaceId, id, patch) {
  const r = recFor(spaceId, 'folder', id); if (!r) return;
  const data = stamp(spaceId, { ...r.data, ...patch }, false);
  await writeRec(spaceId, 'folder', data);
}
// Видалення папки: нотатки і підпапки піднімаються на рівень вище, нічого не губиться
export async function deleteFolder(spaceId, id) {
  const f = folderById(id); if (!f) return;
  for (const e of entries({ all: true })) if (e.folder === id) await updateEntry(e.space, e.id, { folder: f.parent || null }, { silent: true });
  for (const c of folders()) if (c.parent === id) await updateFolder(c.space, c.id, { parent: f.parent || null });
  await updateFolder(spaceId, id, { deletedAt: nowISO() });
}
export function folders() {
  if (cache.f) return cache.f;
  const out = [];
  for (const r of recs.values()) {
    if (r.kind !== 'folder' || r.purge || r.data.deletedAt || !space(r.space)) continue;
    out.push({ ...r.data, space: r.space });
  }
  out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || (a.name || '').localeCompare(b.name || ''));
  return (cache.f = out);
}
export const folderById = id => id ? folders().find(f => f.id === id) : null;
// Ланцюжок від кореня до папки (для «хлібних крихт»)
export function folderPath(id) {
  const out = []; let f = folderById(id), guard = 0;
  while (f && guard++ < 50) { out.unshift(f); f = folderById(f.parent); }
  return out;
}
// Чи є папка a предком папки b (щоб не вкласти папку саму в себе)
export function isAncestor(a, b) { let f = folderById(b), guard = 0; while (f && guard++ < 50) { if (f.parent === a) return true; f = folderById(f.parent); } return false; }

// ---- Порожні записи ----
// Порожній = без назви, без тексту, без дати, не задача і не конспект заняття. Такі прибираємо автоматично.
export const isBlank = e => !!e && !(e.title || '').trim() && !(e.body || '').replace(/&nbsp;/g, '').trim() && !e.date && !e.task && !e.parent && !e.pinned;
export async function purgeBlank(exceptKey) {
  let n = 0;
  for (const r of [...recs.values()]) {
    if (r.kind !== 'entry' || r.purge || r.data.deletedAt || !isBlank(r.data)) continue;
    if (exceptKey && exceptKey === `${r.space}|${r.data.id}`) continue;
    await purgeRec(r, true); n++;
  }
  if (n) bump({ blank: n });
  return n;
}

// ---- Зображення ----
export async function addAsset(spaceId, bytes, ext, mime) {
  const id = uid();
  const data = { id, ext, mime, size: bytes.length };
  const path = pathFor('asset', id, ext);
  await db.put('blobs', bytes, keyOf(spaceId, path));
  await writeRec(spaceId, 'asset', data, { silent: true });
  return `${id}.${ext}`;
}
const urlCache = new Map();
export let fetchRemoteBlob = null; // задає модуль синхронізації
export const setRemoteBlobFetcher = f => { fetchRemoteBlob = f; };
export async function assetURL(spaceId, ref) {
  const id = ref.split('.')[0];
  const ck = spaceId + '/' + ref;
  if (urlCache.has(ck)) return urlCache.get(ck);
  let r = recFor(spaceId, 'asset', id);
  if (!r) { for (const s of spaces) { r = recFor(s.id, 'asset', id); if (r) break; } }
  if (!r) return null;
  let bytes = await db.get('blobs', r.key);
  if (!bytes && fetchRemoteBlob && r.baseSha) {
    try { bytes = await fetchRemoteBlob(r.space, r.baseSha); if (bytes) await db.put('blobs', bytes, r.key); } catch (e) { console.warn(e); }
  }
  if (!bytes) return null;
  const url = URL.createObjectURL(new Blob([bytes], { type: r.data.mime || 'image/jpeg' }));
  urlCache.set(ck, url); return url;
}

// ---- Вибірки (кешуються до наступної зміни) ----
export function entries(opts = {}) {
  const k = 'e' + (opts.withDeleted ? 'd' : '') + (opts.all ? 'a' : '');
  if (cache[k]) return cache[k];
  const out = [];
  for (const r of recs.values()) {
    if (r.kind !== 'entry' || r.purge) continue;
    if (!opts.withDeleted && r.data.deletedAt) continue;
    if (!opts.all && hiddenSpaces.has(r.space)) continue;
    if (!space(r.space)) continue;
    out.push({ ...r.data, space: r.space });
  }
  return (cache[k] = out);
}
export function subjects(opts = {}) {
  const k = 's' + (opts.withArchived ? 'a' : '');
  if (cache[k]) return cache[k];
  const out = [];
  for (const r of recs.values()) {
    if (r.kind !== 'subject' || r.purge || r.data.deletedAt) continue;
    if (!space(r.space)) continue;
    if (!opts.withArchived && r.data.archived) continue;
    out.push({ ...r.data, space: r.space });
  }
  out.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
  return (cache[k] = out);
}
export const subjectById = id => id ? subjects({ withArchived: true }).find(s => s.id === id) : null;
export const entry = (spaceId, id) => { const r = recFor(spaceId, 'entry', id); return r && !r.purge ? { ...r.data, space: spaceId } : null; };
export const findEntry = id => { for (const s of spaces) { const e = entry(s.id, id); if (e) return e; } return null; };
export const trash = () => entries({ withDeleted: true, all: true }).filter(e => e.deletedAt).sort((a, b) => b.deletedAt.localeCompare(a.deletedAt));
export const pendingCount = spaceId => { let n = 0; for (const r of recs.values()) if (r.space === spaceId && r.dirty) n++; return n; };

// ---- Сирий доступ для синхронізації ----
export async function putRecs(list, notify = true) {
  for (const r of list) recs.set(r.key, r);
  await db.putMany('records', list);
  if (notify) bump({ sync: true });
}
export async function removeRecs(keys, notify = true) {
  for (const k of keys) recs.delete(k);
  await db.delMany('records', keys);
  if (notify) bump({ sync: true });
}
export const getMeta = k => db.get('meta', k);
export const setMeta = (k, v) => db.put('meta', v, k);
export const putBlob = (k, v) => db.put('blobs', v, k);
export const getBlob = k => db.get('blobs', k);
export const touch = () => bump({});
export const getVersion = () => version;
export { todayYmd, addDays };
