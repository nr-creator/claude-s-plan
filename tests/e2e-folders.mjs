import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'uk-UA', timezoneId: 'Europe/Zurich' });
const p = await ctx.newPage(); const errors = [];
p.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const S = fn => p.evaluate(fn);
let n = 0; const step = async (name, fn) => { try { await fn(); n++; console.log('ok', name); } catch (e) { console.error('FAIL', name, errors.join('\n')); await p.screenshot({ path: 'tests/fail.png' }); throw e; } };
await p.goto('http://localhost:8123/#/notes'); await p.waitForTimeout(600);
await S(() => localStorage.setItem('plan.welcomed', '1'));

await step('create folder and subfolder', async () => {
  await p.click('.notes-side [data-newfolder]'); await p.waitForTimeout(150); await p.keyboard.type('Університет'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  assert.equal(await S(() => window.__plan.store.folders().length), 1);
  assert.ok(await p.isVisible('.crumbs b:has-text("Університет")'));
  await p.click('.notes-bar [data-fmenu]'); await p.click('.menu-i:has-text("Нова підпапка")'); await p.waitForTimeout(150); await p.keyboard.type('Матаналіз'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
  const fs = await S(() => window.__plan.store.folders().map(f => [f.name, !!f.parent]));
  assert.deepEqual(fs.sort(), [['Матаналіз', true], ['Університет', false]].sort());
});
await step('new note lands in the open folder', async () => {
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300);
  await p.keyboard.type('Границі'); await p.keyboard.press('Enter'); await p.keyboard.type('Означення через ε-δ. #важливо #екзамен');
  await p.waitForTimeout(700);
  const e = await S(() => { const s = window.__plan.store; const e = s.entries().find(x => x.title === 'Границі'); return { folder: s.folderById(e.folder).name, body: e.body }; });
  assert.equal(e.folder, 'Матаналіз');
  assert.ok(await p.isVisible('.pn-tags .tagchip:has-text("#важливо")'));
});
await step('tag suggestions complete existing tags', async () => {
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.notes-side [data-scope*="\\"all\\""]'); await p.waitForTimeout(200);
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300);
  await p.keyboard.type('Список літератури'); await p.keyboard.press('Enter');
  await p.keyboard.type('Демидович #ек'); await p.waitForTimeout(200);
  assert.ok(await p.isVisible('.slash .menu-i:has-text("екзамен")'));
  await p.keyboard.press('Enter'); await p.waitForTimeout(700);
  const body = await S(() => window.__plan.store.entries().find(x => x.title === 'Список літератури').body);
  assert.equal(body.trim(), 'Демидович #екзамен');
  assert.equal(await S(() => window.__plan.store.entries().find(x => x.title === 'Список літератури').folder), undefined);
});
await step('tag scope and side counts', async () => {
  await p.keyboard.press('Escape'); await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  await p.click('.ns-tags .tagchip:has-text("#екзамен")'); await p.waitForTimeout(300);
  assert.equal(await p.locator('.note-card').count(), 2);
  assert.ok((await p.textContent('.crumbs')).includes('#екзамен'));
});
await step('drag a note into a folder', async () => {
  await p.click('.notes-side [data-scope*="\\"all\\""]'); await p.waitForTimeout(200);
  await p.dragAndDrop('.note-card:has-text("Список літератури")', '.ns-row:has-text("Університет")'); await p.waitForTimeout(400);
  assert.equal(await S(() => { const s = window.__plan.store; return s.folderById(s.entries().find(x => x.title === 'Список літератури').folder).name; }), 'Університет');
  // У папці «Університет» видно і її нотатку, і нотатки підпапки
  await p.click('.ns-row:has-text("Університет") .ns-i'); await p.waitForTimeout(300);
  assert.equal(await p.locator('.note-card').count(), 2);
  assert.ok(await p.isVisible('.ftile:has-text("Матаналіз")'));
});
await step('list view and filter', async () => {
  await p.click('[data-nview="list"]'); await p.waitForTimeout(200);
  assert.equal(await p.locator('.note-row').count(), 2);
  await p.fill('[data-nfilter-in]', 'демид'); await p.waitForTimeout(200);
  assert.equal(await p.locator('.note-row').count(), 1);
  await p.fill('[data-nfilter-in]', ''); await p.click('[data-nview="grid"]');
});
await step('folder property in note panel', async () => {
  await p.click('.note-card:has-text("Границі")'); await p.waitForTimeout(400);
  await p.click('[data-prop="folder"]'); await p.click('.menu-i:has-text("Без папки")'); await p.waitForTimeout(300);
  assert.equal(await S(() => window.__plan.store.entries().find(x => x.title === 'Границі').folder), undefined);
  await p.click('[data-prop="folder"]'); await p.click('.menu-i:has-text("Матаналіз")'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
});
await step('blank notes disappear on close, navigation and reload', async () => {
  const count = () => S(() => window.__plan.store.entries({ all: true }).length);
  const c0 = await count();
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300); await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  assert.equal(await count(), c0);
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300);
  await p.click('.rail-nav [data-nav="today"]'); await p.waitForTimeout(400);
  assert.equal(await count(), c0);
  // Порожня нотатка, що лишилася з минулої сесії, прибирається при наступному запуску
  await S(() => window.__plan.store.createEntry({ title: '' }));
  await p.reload(); await p.waitForTimeout(700);
  assert.equal(await count(), c0);
  // Нотатка з набраною і стертою назвою теж прибирається
  await p.goto('http://localhost:8123/#/notes'); await p.waitForTimeout(300);
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300);
  await p.keyboard.type('тимчасово'); await p.waitForTimeout(600); for (let i = 0; i < 9; i++) await p.keyboard.press('Backspace');
  await p.keyboard.press('Escape'); await p.waitForTimeout(400);
  assert.equal(await count(), c0);
  // А нотатка з назвою, закритою одразу після набору, лишається
  await p.click('.notes-bar [data-act="new-note"]'); await p.waitForTimeout(300);
  await p.keyboard.type('Швидко'); await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  assert.equal(await count(), c0 + 1);
});
await step('quick add with hashtag and palette tag search', async () => {
  await p.fill('.qa-in', 'ідея для проєкту #курсова'); await p.waitForTimeout(150);
  assert.ok(await p.isVisible('.qa-chips .tagchip:has-text("#курсова")'));
  await p.press('.qa-in', 'Enter'); await p.waitForTimeout(400);
  assert.equal(await S(() => window.__plan.store.entries().find(x => x.title.startsWith('ідея')).title), 'ідея для проєкту #курсова');
  await p.keyboard.press('Control+k'); await p.keyboard.type('#кур'); await p.waitForTimeout(200);
  await p.keyboard.press('Enter'); await p.waitForTimeout(400);
  assert.ok((await p.textContent('.crumbs')).includes('#курсова'));
  await p.screenshot({ path: 'tests/folders-tag.png' });
});
await step('delete folder moves notes up', async () => {
  await p.click('.ns-row:has-text("Матаналіз") .ns-i'); await p.waitForTimeout(200);
  await p.click('.notes-bar [data-fmenu]'); await p.click('.menu-i.danger'); await p.click('.modal [data-y]'); await p.waitForTimeout(400);
  assert.equal(await S(() => { const s = window.__plan.store; return s.folderById(s.entries().find(x => x.title === 'Границі').folder).name; }), 'Університет');
  assert.equal(await S(() => window.__plan.store.folders().length), 1);
});
await p.goto('http://localhost:8123/#/notes'); await p.waitForTimeout(400);
await p.click('.ns-row:has-text("Університет") .ns-i'); await p.waitForTimeout(300);
await p.screenshot({ path: 'tests/folders-view.png' });
const m = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, locale: 'uk-UA' });
const q = await m.newPage(); q.on('pageerror', e => errors.push('mobile: ' + e.message));
await q.goto('http://localhost:8123/#/notes'); await q.waitForTimeout(500);
await q.evaluate(async () => { const s = window.__plan.store; localStorage.setItem('plan.welcomed', '1'); const f = await s.createFolder({ name: 'Університет' }); await s.createEntry({ title: 'Нотатка #тест', folder: f.id }); });
await q.waitForTimeout(300); await q.click('[data-scopepick]'); await q.waitForTimeout(300);
await q.screenshot({ path: 'tests/folders-mobile.png' });
console.log(`folders ok: ${n}`); console.log(errors.join('\n') || 'no page errors');
await browser.close();
