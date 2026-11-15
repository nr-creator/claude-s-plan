import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { merge3, mergeText } from '../js/merge.js';
import { parseIcs, resolveOverrides, toIcs } from '../js/ics.js';
import { unzip } from '../js/zip.js';
import { qrMatrix } from '../js/qr.js';

let n = 0; const ok = async (name, fn) => { try { await fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };

await ok('merge fields', () => {
  const base = { id: 'a', title: 'T', date: '2026-11-15', time: '10:00', body: 'x', updatedAt: '1' };
  const local = { ...base, time: '11:00', updatedAt: '2' };
  const remote = { ...base, title: 'T2', updatedAt: '3' };
  const m = merge3(base, local, remote);
  assert.equal(m.data.time, '11:00'); assert.equal(m.data.title, 'T2'); assert.equal(m.conflicts.length, 0); assert.equal(m.data.updatedAt, '3');
});
await ok('merge same field', () => {
  const base = { id: 'a', title: 'T', updatedAt: '1' };
  const m = merge3(base, { ...base, title: 'L', updatedAt: '5' }, { ...base, title: 'R', updatedAt: '3' });
  assert.equal(m.data.title, 'L'); assert.deepEqual(m.conflicts, ['title']); assert.equal(m.loser.title, 'R');
});
await ok('merge text lines', () => {
  const base = 'a\nb\nc\nd';
  const r = mergeText(base, 'a\nB\nc\nd', 'a\nb\nc\nD');
  assert.equal(r.text, 'a\nB\nc\nD'); assert.equal(r.conflict, false);
  const c = mergeText(base, 'a\nL\nc\nd', 'a\nR\nc\nd', 'remote');
  assert.equal(c.conflict, true); assert.ok(c.text.startsWith('a\nR\n\n> [!conflict]\n> L\n'), JSON.stringify(c.text));
  const ins = mergeText('a\nb', 'a\nx\nb', 'a\nb\ny');
  assert.equal(ins.text, 'a\nx\nb\ny');
});
await ok('merge sets', () => {
  const base = { id: 'a', doneDates: ['1'], updatedAt: '1' };
  const m = merge3(base, { ...base, doneDates: ['1', '2'], updatedAt: '2' }, { ...base, doneDates: ['3'], updatedAt: '3' });
  assert.deepEqual(m.data.doneDates, ['2', '3']);
});

const ICS = `BEGIN:VCALENDAR\r
PRODID:-//Google Inc//Google Calendar 70.9054//EN\r
X-WR-CALNAME:Навчання\r
X-WR-TIMEZONE:Europe/Zurich\r
BEGIN:VEVENT\r
DTSTART;TZID=Europe/Zurich:20260907T083000\r
DTEND;TZID=Europe/Zurich:20260907T095000\r
RRULE:FREQ=WEEKLY;UNTIL=20261220T225959Z;BYDAY=MO,WE\r
EXDATE;TZID=Europe/Zurich:20261102T083000\r
UID:abc123@google.com\r
SUMMARY:Матан\\, лекція\r
DESCRIPTION:Ауд. 214<br>Принести <a href="https://x.ua">конспект</a>\r
LOCATION:Корпус 1\r
BEGIN:VALARM\r
ACTION:DISPLAY\r
DESCRIPTION:Reminder\r
END:VALARM\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART;TZID=Europe/Zurich:20261111T100000\r
DTEND;TZID=Europe/Zurich:20261111T113000\r
RECURRENCE-ID;TZID=Europe/Zurich:20261111T083000\r
UID:abc123@google.com\r
SUMMARY:Матан (перенесено)\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART;VALUE=DATE:20261220\r
DTEND;VALUE=DATE:20261223\r
UID:hol@google.com\r
SUMMARY:Канікули\r
END:VEVENT\r
BEGIN:VEVENT\r
DTSTART:20261201T090000Z\r
DURATION:PT2H\r
UID:utc@x\r
SUMMARY:Довгий опис який\r
  переноситься\r
END:VEVENT\r
END:VCALENDAR\r
`;
process.env.TZ = 'Europe/Zurich';
await ok('ics parse', () => {
  const c = parseIcs(ICS);
  assert.equal(c.name, 'Навчання');
  const ev = resolveOverrides(c.events);
  const m = ev.find(e => e.uid === 'abc123@google.com');
  assert.equal(m.title, 'Матан, лекція'); assert.equal(m.date, '2026-09-07'); assert.equal(m.time, '08:30'); assert.equal(m.end, '09:50');
  assert.deepEqual(m.repeat, { freq: 'weekly', days: [1, 3], until: '2026-12-20' });
  assert.deepEqual(m.exdates, ['2026-11-02', '2026-11-11']);
  assert.equal(m.body, 'Ауд. 214\nПринести конспект (https://x.ua)');
  const o = ev.find(e => e.uid === 'abc123@google.com_2026-11-11'); assert.equal(o.time, '10:00'); assert.ok(!o.repeat);
  const h = ev.find(e => e.uid === 'hol@google.com'); assert.equal(h.endDate, '2026-12-22'); assert.ok(!h.time);
  const u = ev.find(e => e.uid === 'utc@x'); assert.equal(u.time, '10:00'); assert.equal(u.end, '12:00'); assert.equal(u.title, 'Довгий опис який переноситься');
});
await ok('ics export roundtrip', () => {
  const s = toIcs([{ id: 'x', title: 'Лекція; тест', date: '2026-11-16', time: '08:30', end: '09:50', repeat: { freq: 'weekly', days: [1, 3] }, exdates: ['2026-11-18'], body: 'рядок\nдругий' }], 'План');
  const back = parseIcs(s).events[0];
  assert.equal(back.title, 'Лекція; тест'); assert.equal(back.time, '08:30'); assert.deepEqual(back.repeat.days, [1, 3]); assert.deepEqual(back.exdates, ['2026-11-18']); assert.equal(back.body, 'рядок\nдругий');
});
await ok('zip', async () => {
  const buf = readFileSync(new URL('./fixture.zip', import.meta.url));
  const files = await unzip(buf);
  assert.deepEqual(files.map(f => f.name).sort(), ['a.ics', 'b.ics']);
  assert.ok(new TextDecoder().decode(files.find(f => f.name === 'a.ics').bytes).includes('BEGIN:VCALENDAR'));
});
await ok('qr', () => {
  const text = 'https://nerov.github.io/plan/#setup=' + 'A'.repeat(600);
  const M = qrMatrix(new TextEncoder().encode(text), 'M');
  writeFileSync(new URL('./qr.json', import.meta.url), JSON.stringify({ text, m: M.map(r => r.map(x => x ? 1 : 0)) }));
  const M2 = qrMatrix(new TextEncoder().encode('Привіт'), 'M');
  writeFileSync(new URL('./qr2.json', import.meta.url), JSON.stringify({ text: 'Привіт', m: M2.map(r => r.map(x => x ? 1 : 0)) }));
});
console.log('io ok:', n);
