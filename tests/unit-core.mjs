import assert from 'node:assert/strict';
import { parseQuick } from '../js/parse.js';
import { occurrences } from '../js/recur.js';
import { serialize, parse, canon } from '../js/format.js';
import { monthName, setLang, t } from '../js/i18n.js';

let n = 0; const ok = (name, fn) => { try { fn(); n++; } catch (e) { console.error('FAIL', name); throw e; } };
const today = '2026-11-14'; // субота
const subjects = [{ id: 's1', name: 'Матан' }, { id: 's2', name: 'Фізика' }, { id: 's3', name: 'Лінійна алгебра' }];
const P = (s, ig) => parseQuick(s, { today, subjects, ignore: new Set(ig || []) });

ok('tomorrow time subject', () => {
  const r = P('завтра 10:00 #матан лекція');
  assert.equal(r.date, '2026-11-15'); assert.equal(r.time, '10:00'); assert.equal(r.subject.id, 's1'); assert.equal(r.title, 'лекція');
});
ok('range', () => { const r = P('пт 9:30-11:00 пара'); assert.equal(r.date, '2026-11-20'); assert.equal(r.time, '09:30'); assert.equal(r.end, '11:00'); assert.equal(r.title, 'пара'); });
ok('range з до', () => { const r = P('з 9 до 10:30 семінар'); assert.equal(r.time, '09:00'); assert.equal(r.end, '10:30'); assert.equal(r.date, today); });
ok('date dd.mm', () => { const r = P('20.11 ДН Олі'); assert.equal(r.date, '2026-11-20'); assert.equal(r.title, 'ДН Олі'); });
ok('date past -> next year', () => { assert.equal(P('03.02 щось').date, '2027-02-03'); });
ok('dot time', () => { const r = P('9.30 зустріч'); assert.equal(r.time, '09:30'); assert.equal(r.date, today); });
ok('month name', () => { assert.equal(P('25 грудня концерт').date, '2026-12-25'); assert.equal(P('dec 25 party').date, '2026-12-25'); });
ok('weekly repeat', () => {
  const r = P('щопн 8:30 #фіз лекція');
  assert.deepEqual(r.repeat, { freq: 'weekly', days: [1] }); assert.equal(r.date, '2026-11-16'); assert.equal(r.subject.id, 's2'); assert.equal(r.title, 'лекція');
});
ok('weekly що що', () => { const r = P('щопн щср 8:30 пара'); assert.deepEqual(r.repeat.days, [1, 3]); assert.equal(r.title, 'пара'); });
ok('weekly multi', () => { const r = P('по пн, ср 10:00 англ'); assert.deepEqual(r.repeat.days, [1, 3]); assert.equal(r.title, 'англ'); });
ok("п'ятниця", () => { assert.equal(P("в п'ятницю кіно").date, '2026-11-20'); assert.equal(P('у п’ятницю кіно').title, 'кіно'); });
ok('next', () => { assert.equal(P('наступної суботи похід').date, '2026-11-21'); assert.equal(P('сб похід').date, today); });
ok('unknown # is a hashtag', () => { const r = P('#хімія_орг лаба #ідея'); assert.equal(r.subject, undefined); assert.equal(r.title, '#хімія_орг лаба #ідея'); assert.deepEqual(r.tags, ['хімія_орг', 'ідея']); });
ok('subject + tag', () => { const r = P('завтра #матан #важливо конспект'); assert.equal(r.subject.id, 's1'); assert.equal(r.title, '#важливо конспект'); assert.deepEqual(r.tags, ['важливо']); });
ok('subject substring', () => { assert.equal(P('#алгебра конспект').subject.id, 's3'); });
ok('task', () => { const r = P('! здати лабу пт'); assert.equal(r.task, true); assert.equal(r.title, 'здати лабу'); assert.equal(P('дедлайн курсової 1.12').task, true); });
ok('ignore', () => { const r = P('завтра зранку', ['date']); assert.equal(r.date, undefined); assert.equal(r.title, 'завтра зранку'); });
ok('plain note', () => { const r = P('ідея для проєкту'); assert.equal(r.date, undefined); assert.equal(r.title, 'ідея для проєкту'); });
ok('in 3 days', () => { assert.equal(P('через 3 дні звіт').date, '2026-11-17'); assert.equal(P('in 2 weeks trip').date, '2026-11-28'); });
ok('3pm', () => { assert.equal(P('call mom 3pm').time, '15:00'); assert.equal(P('о 15 обід').time, '15:00'); });
ok('no false weekday', () => { assert.equal(P('Середовище розробки').date, undefined); });
ok('lab numbers no time', () => { const r = P('лаба 2-3'); assert.equal(r.time, undefined); });

// Повтори
ok('weekly occ', () => {
  const e = { date: '2026-09-01', repeat: { freq: 'weekly', days: [1, 3] } };
  assert.deepEqual(occurrences(e, '2026-11-09', '2026-11-15'), ['2026-11-09', '2026-11-11']);
});
ok('biweekly', () => {
  const e = { date: '2026-09-07', repeat: { freq: 'weekly', interval: 2, days: [1] } };
  assert.deepEqual(occurrences(e, '2026-11-01', '2026-11-30'), ['2026-11-02', '2026-11-16', '2026-11-30']);
});
ok('count+exdate', () => {
  const e = { date: '2026-11-01', repeat: { freq: 'daily', count: 5 }, exdates: ['2026-11-03'] };
  assert.deepEqual(occurrences(e, '2026-10-01', '2026-12-01'), ['2026-11-01', '2026-11-02', '2026-11-04', '2026-11-05']);
});
ok('monthly 31', () => {
  const e = { date: '2026-01-31', repeat: { freq: 'monthly' } };
  assert.deepEqual(occurrences(e, '2026-01-01', '2026-06-30'), ['2026-01-31', '2026-03-31', '2026-05-31']);
});
ok('yearly', () => { assert.deepEqual(occurrences({ date: '2000-11-20', repeat: { freq: 'yearly' } }, '2026-01-01', '2026-12-31'), ['2026-11-20']); });
ok('until', () => { assert.deepEqual(occurrences({ date: '2026-11-01', repeat: { freq: 'weekly', until: '2026-11-15' } }, '2026-11-01', '2026-12-31'), ['2026-11-01', '2026-11-08', '2026-11-15']); });
ok('multiday', () => { assert.deepEqual(occurrences({ date: '2026-11-10', endDate: '2026-11-16' }, '2026-11-15', '2026-11-21'), ['2026-11-10']); });

// Формат
ok('roundtrip', () => {
  const o = canon({ id: 'a-1', title: 'Лекція: "вступ"', date: '2026-11-15', time: '10:00', task: false, repeat: { freq: 'weekly', days: [1] }, body: '# Привіт\n\n- пункт' });
  const s = serialize(o);
  assert.ok(s.startsWith('---\nid: a-1\ntitle: "Лекція: \\"вступ\\""\ndate: 2026-11-15'));
  assert.deepEqual(parse(s), o);
});
ok('reserved strings', () => { const o = { id: 'x', title: 'true' }; assert.deepEqual(parse(serialize(o)), o); const p = { id: 'y', title: '123' }; assert.deepEqual(parse(serialize(p)), p); });

setLang('uk');
ok('month nominative', () => { assert.equal(monthName('2026-11-14'), 'Листопад 2026'); });
ok('plural', () => { assert.equal(t('imp.found', { n: 1 }), '1 подія'); assert.equal(t('imp.found', { n: 3 }), '3 події'); assert.equal(t('imp.found', { n: 11 }), '11 подій'); assert.equal(t('imp.found', { n: 22 }), '22 події'); });
console.log('core ok:', n);
