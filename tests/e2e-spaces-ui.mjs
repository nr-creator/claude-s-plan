// Кольори просторів у календарі, свій колір події, кнопки швидкого додавання і їх налаштування
import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const URL = 'http://localhost:8123/';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const errs = [];
const ok = (c, m) => { if (!c) { console.error('FAIL', m); process.exitCode = 1; } else console.log('ok', m); };
async function setup(ctxOpts, scheme) {
  const c = await b.newContext({ ...ctxOpts, colorScheme: scheme });
  await c.addInitScript(() => {
    if (localStorage.getItem('plan.spaces')) return;
    localStorage.setItem('plan.spaces', JSON.stringify([
      { id: 'local', name: '', kind: 'personal', color: 'ink', remote: null },
      { id: 'sh', name: 'Друг', kind: 'shared', color: 'teal', remote: null }]));
    localStorage.setItem('plan.welcomed', '1');
    localStorage.setItem('plan.settings', JSON.stringify({ lang: 'uk' }));
  });
  const p = await c.newPage(); p.on('pageerror', e => errs.push(e.message));
  await p.goto(URL + '#/cal/week/2026-11-16'); await p.waitForFunction(() => window.__plan);
  return p;
}
const p = await setup({ viewport: { width: 1280, height: 820 } }, 'dark');
await p.evaluate(async () => {
  const { store } = window.__plan;
  await store.createEntry({ title: 'Моє', date: '2026-11-17', time: '10:00', end: '11:30' }, 'local');
  await store.createEntry({ title: 'Спільне', date: '2026-11-17', time: '12:00', end: '13:00' }, 'sh');
  await store.createEntry({ title: 'Червоне', date: '2026-11-18', time: '09:00', end: '10:00', color: 'red' }, 'local');
});
await p.waitForTimeout(400);
const cols = await p.$$eval('.ev', es => es.map(e => [e.querySelector('.ev-t').textContent, getComputedStyle(e).borderLeftColor, !!e.querySelector('.ev-sp')]));
console.log(cols);
const by = n => cols.find(c => c[0].includes(n));
ok(by('Моє')[1] !== by('Спільне')[1], 'private and shared events differ in color');
ok(by('Спільне')[2] && !by('Моє')[2], 'shared event carries the space icon');
ok(by('Червоне')[1] !== by('Моє')[1], 'own color wins');
// Кнопки: дві, обидві кольорові, без підписів
const btns = await p.$$eval('.qa-go', bs => bs.map(x => [getComputedStyle(x).backgroundColor, getComputedStyle(x.querySelector('span')).display]));
ok(btns.length === 2 && btns[0][0] !== btns[1][0] && btns.every(x => x[1] === 'none'), 'two colored icon-only buttons ' + JSON.stringify(btns));
await p.screenshot({ path: 'tests/spaces-desk.png' });
// Додавання кнопкою спільного простору
await p.fill('.qa-in', 'завтра 15:00 кава');
await p.click('.qa-go[data-space="sh"]');
await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__plan.store.entries().some(e => e.title === 'кава' && e.space === 'sh')), 'shared button adds to shared space');
// Свій колір у панелі
await p.click('.ev:has-text("Моє")'); await p.waitForSelector('[data-prop=color]');
await p.click('[data-prop=color]'); await p.click('.color-pop [data-col=violet]'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__plan.store.entries().find(e => e.title === 'Моє').color === 'violet'), 'color picker sets entry color');
await p.screenshot({ path: 'tests/spaces-panel.png' });
await p.click('[data-prop=color]'); await p.click('.color-pop [data-col=""]'); await p.waitForTimeout(300);
ok(!await p.evaluate(() => window.__plan.store.entries().find(e => e.title === 'Моє').color), 'auto clears color');
await p.keyboard.press('Escape');
// Налаштування: режим меню, підписи, колір і значок простору
await p.goto(URL + '#/settings'); await p.waitForSelector('.qa-sp');
await p.screenshot({ path: 'tests/spaces-settings.png', fullPage: true });
await p.click('[data-set=qaMode][data-val=menu]');
await p.click('[data-qsp=sh] [data-qsp-color]'); await p.click('.color-pop [data-col=pink]');
await p.click('[data-qsp=sh] [data-qsp-icon]'); await p.click('.icon-pop [data-ic=book]');
ok(await p.evaluate(() => { const s = window.__plan.store.space('sh'); return s.color === 'pink' && s.icon === 'book'; }), 'space color and icon saved');
await p.check('[data-set-chk=qaLabels]');
await p.goto(URL + '#/today'); await p.waitForSelector('.qa-go');
ok(await p.$$eval('.qa-go', x => x.length) === 1 && await p.$('[data-qa-menu]'), 'menu mode shows one button');
await p.fill('.qa-in', 'ідея'); await p.click('[data-qa-menu]'); await p.waitForSelector('.menu');
await p.screenshot({ path: 'tests/spaces-menu.png' });
await p.click('.menu-i:has-text("Друг")'); await p.waitForTimeout(300);
ok(await p.evaluate(() => window.__plan.store.entries().some(e => e.title === 'ідея' && e.space === 'sh')), 'menu adds to chosen space');
// Сховати простір з рядка
await p.goto(URL + '#/settings'); await p.waitForSelector('.qa-sp');
await p.click('[data-set=qaMode][data-val=buttons]');
await p.uncheck('[data-qsp=sh] [data-qsp-show]');
await p.goto(URL + '#/today'); await p.waitForSelector('.qa-go');
ok(await p.$$eval('.qa-go', x => x.length) === 1 && await p.$('.qa-go[data-space=local]'), 'hidden space leaves the bar');
// Телефон, світла тема
const m = await setup({ viewport: { width: 390, height: 800 }, isMobile: true, hasTouch: true }, 'light');
await m.evaluate(async () => { const { store } = window.__plan;
  await store.createEntry({ title: 'Моє', date: '2026-11-17', time: '10:00', end: '11:30' }, 'local');
  await store.createEntry({ title: 'Спільне', date: '2026-11-17', time: '12:00', end: '13:00' }, 'sh'); });
await m.goto(URL + '#/cal/day/2026-11-17'); await m.waitForTimeout(500);
await m.screenshot({ path: 'tests/spaces-mobile.png' });
await m.tap('.qa-in'); await m.fill('.qa-in', 'тест');
await m.tap('.qa-go[data-space="sh"]'); await m.waitForTimeout(300);
ok(await m.evaluate(() => document.activeElement.classList.contains('qa-in')), 'tapping a space button keeps the field focused');
ok(!errs.length, 'no page errors ' + errs.join('; '));
await b.close();
