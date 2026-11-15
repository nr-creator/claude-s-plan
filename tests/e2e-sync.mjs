import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
import { createFake } from './fake-github.mjs';
const url = 'http://localhost:8123/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const fake = createFake({ users: { tokA: 'artem', tokB: 'friend' } });
fake.addRepo('artem/plan-data', ['artem']);
fake.addRepo('friend/plan-data', ['friend']);
fake.addRepo('study/shared', ['artem', 'friend']);
const errors = [];
async function device(name) {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 850 }, locale: 'uk-UA', timezoneId: 'Europe/Zurich' });
  await ctx.route('https://api.github.com/**', r => fake.handle(r));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(`${name} pageerror: ${e.message}\n${e.stack}`));
  p.on('console', m => { if (m.type() === 'error') errors.push(`${name}: ${m.text()}`); });
  await p.goto(url); await p.waitForTimeout(500);
  p.ctx = ctx; p.dev = name;
  return p;
}
const E = (p, fn, arg) => p.evaluate(fn, arg);
const sync = p => E(p, () => window.__plan.sync.syncAll());
const connect = (p, spaces) => E(p, spaces => { window.__plan.store.saveSpaces(spaces); }, spaces);
const files = full => fake.files(full);
const entriesOf = p => E(p, () => window.__plan.store.entries({ all: true, withDeleted: true }).map(e => ({ id: e.id, title: e.title, body: e.body, space: e.space, deletedAt: e.deletedAt, time: e.time })));
let n = 0; const step = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name); throw e; } };

const A1 = await device('A1'), A2 = await device('A2'), B = await device('B');
const personalA = { id: 'local', name: '', kind: 'personal', color: 'teal', login: 'artem', remote: { owner: 'artem', repo: 'plan-data', token: 'tokA', branch: 'main' } };
let X, Y;
await step('local entries then connect empty repo', async () => {
  X = await E(A1, async () => (await window.__plan.store.createEntry({ title: 'Лекція', date: '2026-11-16', time: '08:30', body: 'рядок 1\nрядок 2\nрядок 3' })).id);
  Y = await E(A1, async () => (await window.__plan.store.createEntry({ title: 'Для видалення' })).id);
  await connect(A1, [personalA]); await sync(A1);
  const f = files('artem/plan-data');
  assert.ok(f['README.md']); assert.ok(f[`entries/${X}.md`].includes('title: "Лекція"'));
  assert.equal(await E(A1, () => window.__plan.store.pendingCount('local')), 0);
});
await step('second device pulls', async () => {
  await connect(A2, [{ ...personalA }]); await sync(A2);
  const list = await entriesOf(A2);
  assert.equal(list.length, 2); assert.equal(list.find(e => e.id === X).time, '08:30');
});
await step('idle sync costs 1 request', async () => {
  const before = fake.stats.requests; await sync(A2); assert.equal(fake.stats.requests - before, 1);
});
await step('field-level merge', async () => {
  await A2.ctx.setOffline(true);
  await E(A2, id => window.__plan.store.updateEntry('local', id, { title: 'Лекція 1' }), X);
  await sync(A2); // офлайн — нічого
  await E(A1, id => window.__plan.store.updateEntry('local', id, { time: '09:00' }), X);
  await sync(A1);
  await A2.ctx.setOffline(false); await sync(A2); await sync(A1);
  for (const p of [A1, A2]) { const e = (await entriesOf(p)).find(e => e.id === X); assert.equal(e.title, 'Лекція 1'); assert.equal(e.time, '09:00'); }
  assert.equal((await E(A2, () => window.__plan.sync.getConflicts())).length, 0);
});
await step('line-level body merge', async () => {
  await E(A2, id => window.__plan.store.updateEntry('local', id, { body: 'рядок 1 (A2)\nрядок 2\nрядок 3' }), X);
  await E(A1, id => window.__plan.store.updateEntry('local', id, { body: 'рядок 1\nрядок 2\nрядок 3 (A1)' }), X);
  await sync(A1); await sync(A2); await sync(A1);
  for (const p of [A1, A2]) assert.equal((await entriesOf(p)).find(e => e.id === X).body, 'рядок 1 (A2)\nрядок 2\nрядок 3 (A1)');
});
await step('same-field conflict is logged', async () => {
  await E(A1, id => window.__plan.store.updateEntry('local', id, { title: 'Назва A1' }), X);
  await new Promise(r => setTimeout(r, 20));
  await E(A2, id => window.__plan.store.updateEntry('local', id, { title: 'Назва A2' }), X);
  await sync(A1); await sync(A2); await sync(A1);
  for (const p of [A1, A2]) assert.equal((await entriesOf(p)).find(e => e.id === X).title, 'Назва A2');
  const c = await E(A2, () => window.__plan.sync.getConflicts());
  assert.equal(c.length, 1); assert.deepEqual(c[0].fields, ['title']); assert.equal(c[0].other.title, 'Назва A1');
});
await step('delete and purge propagate', async () => {
  await E(A1, id => window.__plan.store.deleteEntry('local', id), Y); await sync(A1); await sync(A2);
  assert.ok((await entriesOf(A2)).find(e => e.id === Y).deletedAt);
  await E(A1, id => window.__plan.store.purgeEntry('local', id), Y); await sync(A1);
  assert.ok(!files('artem/plan-data')[`entries/${Y}.md`]);
  await sync(A2); assert.ok(!(await entriesOf(A2)).find(e => e.id === Y));
});
await step('stale head retries (non fast-forward)', async () => {
  await E(A1, () => window.__plan.store.createEntry({ title: 'з A1' }));
  await E(A2, () => window.__plan.store.createEntry({ title: 'з A2' }));
  await sync(A1);
  await sync(A2); // голова A2 застаріла → 422 → забрати → повторити
  await sync(A1);
  const titles = Object.values(files('artem/plan-data')).join('\n');
  assert.ok(titles.includes('з A1') && titles.includes('з A2'));
  assert.equal((await entriesOf(A1)).filter(e => !e.deletedAt).length, 3);
  assert.ok(fake.stats.byRoute['PATCH /R/git/refs/heads/main'] >= 1);
});
const shared = { id: 'shared', name: 'Навчання', kind: 'shared', color: 'violet', remote: { owner: 'study', repo: 'shared', token: 'tokA', branch: 'main' } };
let Z;
await step('move to shared space; friend sees it', async () => {
  await connect(A1, [personalA, { ...shared, login: 'artem' }]);
  await connect(B, [{ id: 'local', name: '', kind: 'personal', color: 'teal', login: 'friend', remote: { owner: 'friend', repo: 'plan-data', token: 'tokB', branch: 'main' } }, { ...shared, login: 'friend', remote: { ...shared.remote, token: 'tokB' } }]);
  Z = await E(A1, async () => (await window.__plan.store.createEntry({ title: 'Конспект для двох', body: '# Тема\n\n$$\\int x\\,dx$$' })).id);
  await sync(A1);
  await E(A1, id => window.__plan.store.moveEntry('local', id, 'shared'), Z);
  await sync(A1); await sync(B);
  const z = (await entriesOf(B)).find(e => e.id === Z);
  assert.equal(z.space, 'shared'); assert.equal(z.title, 'Конспект для двох');
  assert.ok(!files('artem/plan-data')[`entries/${Z}.md`]); assert.ok(files('study/shared')[`entries/${Z}.md`]);
  assert.ok(!files('friend/plan-data')[`entries/${Z}.md`]);
  assert.ok(files('study/shared')[`entries/${Z}.md`].includes('createdBy: artem'));
});
await step('image asset syncs to friend', async () => {
  const ref = await E(A1, async () => { const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), c => c.charCodeAt(0)); return window.__plan.store.addAsset('shared', png, 'png', 'image/png'); });
  await E(A1, ({ id, ref }) => window.__plan.store.updateEntry('shared', id, { body: `![схема](asset:${ref})` }), { id: Z, ref });
  await sync(A1); await sync(B);
  const u = await E(B, ref => window.__plan.store.assetURL('shared', ref), ref);
  assert.ok(u && u.startsWith('blob:'));
  const w = await E(B, u => new Promise(r => { const i = new Image(); i.onload = () => r(i.naturalWidth); i.onerror = () => r(-1); i.src = u; }), u);
  assert.equal(w, 1);
});
await step('folders sync and survive deletion', async () => {
  const fid = await E(A1, async () => { const s = window.__plan.store; const f = await s.createFolder({ name: 'Університет' }, 'local'); const sub = await s.createFolder({ name: 'Матаналіз', parent: f.id }, 'local'); return sub.id; });
  await E(A1, ({ id, fid }) => window.__plan.store.updateEntry('local', id, { folder: fid }), { id: X, fid });
  await sync(A1); await sync(A2);
  assert.ok(files('artem/plan-data')[`folders/${fid}.md`].includes('Матаналіз'));
  const f2 = await E(A2, id => { const s = window.__plan.store; const e = s.entry('local', id); return s.folderPath(e.folder).map(f => f.name).join('/'); }, X);
  assert.equal(f2, 'Університет/Матаналіз');
});
await step('history of an entry', async () => {
  const h = await E(A1, id => window.__plan.sync.history('local', `entries/${id}.md`), X);
  assert.ok(h.length >= 4, 'history ' + h.length);
  const old = await E(A1, ({ id, sha }) => window.__plan.sync.versionAt('local', `entries/${id}.md`, sha), { id: X, sha: h[h.length - 1].sha });
  assert.equal(old.title, 'Лекція');
});
await step('wrong token shows readable error', async () => {
  const st = await E(B, async () => { const s = window.__plan.store; s.saveSpaces(s.spaces.map(x => x.id === 'local' ? { ...x, remote: { ...x.remote, token: 'bad' } } : x)); await window.__plan.sync.syncAll(); return window.__plan.sync.status(); });
  assert.equal(st.local.status, 'error'); assert.equal(st.local.error.code, '401'); assert.equal(st.shared.status, 'idle');
});
await A1.goto(url + '#/settings'); await A1.waitForTimeout(500);
await A1.screenshot({ path: 'tests/shot-settings.png' });
await B.goto(url + '#/settings'); await B.waitForTimeout(500);
await B.screenshot({ path: 'tests/shot-settings-err.png' });
console.log(`sync ok: ${n}; requests: ${fake.stats.requests}`);
console.log(errors.join('\n') || 'no console errors');
await browser.close();
