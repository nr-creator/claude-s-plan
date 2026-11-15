import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const url = 'http://localhost:8123/';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
async function page(w, h, mobile) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: mobile, hasTouch: mobile, locale: 'uk-UA', timezoneId: 'Europe/Zurich' });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${w}] ${m.type()}: ${m.text()}`); });
  p.on('pageerror', e => errors.push(`[${w}] pageerror: ${e.message}\n${e.stack}`));
  return p;
}
const p = await page(1400, 900, false);
await p.goto(url); await p.waitForTimeout(800);
await p.screenshot({ path: 'tests/shot-1-today-empty.png' });
// Швидке додавання
const qa = p.locator('.qa-in');
for (const s of ['завтра 10:00-11:30 #матан лекція', 'щопн щср 8:30-9:50 #фізика пара', '! здати лабу пт #матан', 'ідея для курсової', 'сьогодні 18:00 спортзал']) {
  await qa.fill(s); await p.waitForTimeout(100);
  if (s.startsWith('завтра')) await p.screenshot({ path: 'tests/shot-2-qa-chips.png', clip: { x: 252, y: 0, width: 1148, height: 160 } });
  await qa.press('Enter'); await p.waitForTimeout(250);
}
await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/shot-3-today.png' });
await p.goto(url + '#/cal/week/2026-11-16'); await p.waitForTimeout(600);
await p.screenshot({ path: 'tests/shot-4-week.png' });
await p.goto(url + '#/cal/month/2026-11-14'); await p.waitForTimeout(500);
await p.screenshot({ path: 'tests/shot-5-month.png' });
await p.goto(url + '#/notes'); await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/shot-6-notes.png' });
await p.goto(url + '#/subjects'); await p.waitForTimeout(400);
await p.screenshot({ path: 'tests/shot-7-subjects.png' });
console.log(errors.join('\n') || 'no console errors');
await browser.close();
