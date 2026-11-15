import { chromium } from '/opt/npm-tools/node_modules/playwright/index.mjs';
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'] });
const errors = [];
async function seed(p) {
  await p.evaluate(async () => {
    const s = window.__plan.store; localStorage.setItem('plan.welcomed', '1');
    const m = await s.createSubject({ name: 'Матаналіз', color: 'blue', teacher: 'Коваль О. П.', room: '214' });
    const f = await s.createSubject({ name: 'Фізика', color: 'orange' });
    const a = await s.createSubject({ name: 'Алгоритми', color: 'violet' });
    await s.createEntry({ title: 'Лекція', date: '2026-09-01', time: '08:30', end: '09:50', repeat: { freq: 'weekly', days: [1, 3, 5] }, subject: m.id, location: 'ауд. 214' });
    await s.createEntry({ title: 'Лабораторна', date: '2026-09-01', time: '10:10', end: '11:30', repeat: { freq: 'weekly', days: [2, 4] }, subject: f.id });
    await s.createEntry({ title: 'Семінар', date: '2026-09-01', time: '12:00', end: '13:20', repeat: { freq: 'weekly', days: [3] }, subject: a.id });
    await s.createEntry({ title: 'Розв’язати ДЗ 4', date: '2026-11-18', task: true, subject: m.id });
    await s.createEntry({ title: 'Спортзал', date: '2026-11-17', time: '18:00', end: '19:30' });
    await s.createEntry({ title: 'Кава з Олею', date: '2026-11-19', time: '12:30', end: '13:30' });
    await s.createEntry({ title: 'Лекція 7: Інтеграли', subject: m.id, body: '# Суми Рімана\n\nІнтеграл $\\int_a^b f(x)\\,dx$ — границя сум.\n\n- [x] прочитати розділ 5\n- [ ] задачі 1–12' });
    await s.createEntry({ title: 'Ідеї для курсової', body: '- тема 1\n- тема 2' });
  });
}
async function shot(opts, name, url, before) {
  const ctx = await browser.newContext({ viewport: opts.vp || { width: 1440, height: 900 }, colorScheme: opts.dark ? 'dark' : 'light', locale: 'uk-UA', timezoneId: 'Europe/Zurich', isMobile: !!opts.mobile, hasTouch: !!opts.mobile, deviceScaleFactor: opts.mobile ? 2 : 1 });
  const p = await ctx.newPage(); p.on('pageerror', e => errors.push(name + ': ' + e.message));
  await p.goto('http://localhost:8123/'); await p.waitForTimeout(400); await seed(p);
  if (opts.look) await p.evaluate(l => window.__plan.store.saveLook(l), opts.look);
  await p.goto('http://localhost:8123/' + url); await p.reload(); await p.waitForTimeout(700);
  if (before) await before(p);
  await p.screenshot({ path: `tests/look-${name}.png` });
  await ctx.close();
}
await shot({}, 'today-light', '#/today');
await shot({ dark: true }, 'week-dark', '#/cal/week/2026-11-16');
await shot({}, 'appearance', '#/appearance');
await shot({ dark: true, look: { accent: '#8b5cf6', tint: 'cool', eventStyle: 'solid', radius: 'round' } }, 'midnight-month', '#/cal/month/2026-11-14');
await shot({ look: { preset: 'warm', mode: 'light', accent: '#f97316', tint: 'warm', density: 'spacious', radius: 'round', font: 'rounded', sideCollapsed: true } }, 'warm-notes', '#/notes', async p => { await p.click('.note-card'); await p.waitForTimeout(500); });
await shot({ mobile: true, vp: { width: 390, height: 844 }, dark: true }, 'mobile-dark', '#/today');
console.log(errors.join('\n') || 'no page errors');
await browser.close();
