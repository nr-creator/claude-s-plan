import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, locale: 'uk-UA', timezoneId: 'Europe/Zurich' });
const p = await ctx.newPage(); const errors = [];
p.on('pageerror', e => errors.push(e.message + '\n' + e.stack));
const css = v => p.evaluate(v => document.documentElement.style.getPropertyValue(v), v);
const look = () => p.evaluate(() => window.__plan.store.settings.look);
await p.goto('http://localhost:8123/#/appearance'); await p.waitForTimeout(600);
await p.click('[data-preset="midnight"]'); await p.waitForTimeout(150);
assert.equal(await p.evaluate(() => document.documentElement.dataset.theme), 'dark');
assert.equal((await look()).preset, 'midnight');
await p.click('[data-accent="#f97316"]'); await p.waitForTimeout(150);
assert.equal((await look()).preset, 'custom'); assert.equal(await css('--accent'), '#f97316');
await p.click('[data-look="density"][data-val="compact"]'); assert.equal(await css('--row'), '34px');
await p.click('[data-look="radius"][data-val="round"]'); assert.equal(await css('--r'), '14px');
await p.selectOption('[data-look-sel="font"]', 'serif'); assert.ok((await css('--font')).includes('Georgia'));
await p.click('[data-look="mode"][data-val="light"]');
// Чорний акцент на світлій темі працює, на темній — підсвічується, щоб його було видно
await p.evaluate(() => { const i = document.querySelector('[data-accent-pick]'); i.value = '#000000'; i.dispatchEvent(new Event('change', { bubbles: true })); });
await p.waitForTimeout(100);
assert.equal(await css('--accent'), '#000000');
await p.click('[data-look="mode"][data-val="dark"]'); await p.waitForTimeout(100);
assert.notEqual(await css('--accent'), '#000000');
await p.click('[data-look-chk="black"]'); assert.equal(await css('--bg'), '#000000');
// Масштаб повзунком
await p.evaluate(() => { const r = document.querySelector('[data-look-range="scale"]'); r.value = 115; r.dispatchEvent(new Event('input', { bubbles: true })); r.dispatchEvent(new Event('change', { bubbles: true })); });
assert.equal(await p.evaluate(() => document.documentElement.style.fontSize), '115%');
await p.screenshot({ path: 'tests/look-ui-custom.png' });
// Календар: Ctrl+колесо змінює висоту години, вихідні ховаються
await p.goto('http://localhost:8123/#/cal/week/2026-11-16'); await p.waitForTimeout(400);
const h0 = (await look()).hourHeight;
await p.hover('.tg-body'); await p.keyboard.down('Control'); await p.mouse.wheel(0, -100); await p.mouse.wheel(0, -100); await p.keyboard.up('Control'); await p.waitForTimeout(200);
assert.equal((await look()).hourHeight, h0 + 8);
await p.evaluate(() => window.__plan.store.saveLook({ showWeekends: false })); await p.reload(); await p.waitForTimeout(500);
assert.equal(await p.locator('.tg-day').count(), 5);
// Згортання панелі
await p.keyboard.press('Control+\\'); await p.waitForTimeout(200);
assert.ok(await p.evaluate(() => document.body.classList.contains('side-collapsed')));
// Швидке додавання за клавішею N
await p.evaluate(() => window.__plan.store.saveLook({ quickAdd: 'key' })); await p.reload(); await p.waitForTimeout(500);
assert.ok(!(await p.isVisible('.qa-in')));
await p.keyboard.press('n'); await p.waitForTimeout(150);
assert.ok(await p.isVisible('.qa-in'));
await p.screenshot({ path: 'tests/look-ui-qa-float.png' });
await p.keyboard.type('завтра 10:00 тест'); await p.keyboard.press('Enter'); await p.waitForTimeout(300);
assert.ok(!(await p.isVisible('.qa-in')));
// Скидання
await p.goto('http://localhost:8123/#/appearance'); await p.waitForTimeout(300);
p.once('dialog', d => d.accept());
await p.click('[data-look-reset]'); await p.click('.modal [data-y]'); await p.waitForTimeout(200);
assert.equal((await look()).accent, '#3b82f6'); assert.equal((await look()).sideCollapsed, false);
// Тема перемикається кнопкою вгорі
const before = await p.evaluate(() => document.documentElement.dataset.theme);
await p.click('[data-act="theme"]'); await p.waitForTimeout(100);
assert.notEqual(await p.evaluate(() => document.documentElement.dataset.theme), before);
console.log(errors.join('\n') || 'look ui ok, no page errors');
await browser.close();
