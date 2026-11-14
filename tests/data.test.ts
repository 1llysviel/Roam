import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, validateAll } from '../scripts/lib/load';
import { dateRange } from '../src/lib/dates';

const l = loadAll();

test('种子数据通过 Schema 与引用校验', () => {
  assert.deepEqual(validateAll(l), []);
});

test('覆盖 12/11–12/25 每一天，并包含所有目的地', () => {
  const days = dateRange(l.data.trip.start_date, l.data.trip.end_date);
  assert.equal(days.length, 15);
  const nights = l.data.stays.map((s) => s.night);
  assert.deepEqual(nights, days.slice(0, -1));
  const names = l.data.places.map((p) => p.name_en).join('|');
  for (const n of ['London', 'Cambridge', 'York', 'Durham', 'Lumley Castle', 'Beamish Hall', 'Edinburgh', 'Oxford', 'Heathrow Terminal 3']) assert.match(names, new RegExp(n));
});

test('12/25 T3 21:50 为用户提供，航班未标为航司核实或已订', () => {
  const f = l.data.activities.find((a) => a.id === 'act-1225-flight')!;
  assert.equal(f.time?.start, '21:50');
  assert.equal(f.time?.basis, 'user_stated');
  assert.equal(l.reviews.filter((r) => r.claim_id === 'cl-flight-t3-2150').length, 0);
  assert.notEqual(l.data.bookings.find((b) => b.id === 'bk-return-flight')!.status, 'booked');
});

test('16:45 大巴为 proposed，不是已订班次', () => {
  const c = l.data.legs.find((x) => x.id === 'leg-1225-coach')!;
  assert.equal(c.depart, '16:45');
  assert.equal(c.timing_basis, 'proposed');
  assert.equal(l.data.bookings.find((b) => b.id === 'bk-coach-1225')!.status, 'unknown');
});

test('提到的酒店不会自动变成 booked；种子数据中没有任何 booked', () => {
  assert.equal(l.data.bookings.filter((b) => b.status === 'booked').length, 0);
});

test('12/25 酒店、Victoria、Heathrow CBS、T3 分开表示，未定酒店保留空缺', () => {
  for (const id of ['pl-london-hotel-b', 'pl-victoria-coach', 'pl-lhr-cbs', 'pl-lhr-t3']) assert.ok(l.data.places.find((p) => p.id === id));
  assert.equal(l.data.places.find((p) => p.id === 'pl-london-hotel-b')!.coord, null);
  assert.equal(l.data.stays.find((s) => s.night === '2026-12-24')!.selected_place_id, null);
});

test('无真实路线数据时交通段不标 actual_network，时长不伪造', () => {
  assert.equal(l.data.legs.filter((x) => x.route_precision === 'actual_network').length, 0);
  assert.equal(l.data.legs.filter((x) => x.duration_min !== null).length, 0);
});

test('校验器拒绝没有依据的 booked，以及与未确认预订关联的 booked 时间', () => {
  const bad = structuredClone(l);
  bad.data.bookings[0].status = 'booked';
  assert.ok(validateAll(bad).some((e) => /evidence/.test(e)));
  const bad2 = structuredClone(l);
  bad2.data.activities.find((a) => a.id === 'act-1225-flight')!.time!.basis = 'booked';
  assert.ok(validateAll(bad2).some((e) => /booked/.test(e)));
});

test('缺坐标的地点必须标 coord_source: none（不猜测上图）', () => {
  const bad = structuredClone(l);
  bad.data.places.find((p) => p.id === 'pl-york-hotel')!.coord_source = 'initial_draft';
  assert.ok(validateAll(bad).some((e) => /coord_source/.test(e)));
});

test('每晚住宿城市与同行计划表一致', () => {
  const expect: Record<string, string> = {
    '2026-12-11': 'london', '2026-12-12': 'london', '2026-12-13': 'london', '2026-12-14': 'london',
    '2026-12-15': 'york', '2026-12-16': 'york', '2026-12-17': 'durham', '2026-12-18': 'durham',
    '2026-12-19': 'edinburgh', '2026-12-20': 'edinburgh', '2026-12-21': 'london', '2026-12-22': 'london',
    '2026-12-23': 'london', '2026-12-24': 'london',
  };
  for (const s of l.data.stays) assert.equal(s.city, expect[s.night], s.night);
  assert.equal(l.data.stays.find((s) => s.night === '2026-12-17')!.selected_place_id, 'pl-lumley-castle');
  assert.equal(l.data.stays.find((s) => s.night === '2026-12-18')!.selected_place_id, 'pl-beamish-hall');
});

test('「可以考虑 / 可以吃 / 有票才加」类建议不算选定，不计入预订完成率', () => {
  for (const id of ['bk-bar-convent', 'bk-legacy', 'bk-durham-castle', 'bk-coach-1225', 'bk-coach-814']) {
    assert.equal(l.data.bookings.find((b) => b.id === id)!.selected, false, id);
  }
  assert.equal(l.data.stays.find((s) => s.night === '2026-12-15')!.selected_place_id, null);
  assert.equal(l.data.activities.find((a) => a.id === 'act-1216-legacy')!.plan_status, 'proposed');
  assert.equal(l.data.activities.find((a) => a.id === 'act-1217-castle')!.plan_status, 'candidate');
});

test('计划表给出的 4h10m 只作为待核实陈述，不写入人工核实时长', () => {
  assert.equal(l.data.legs.find((x) => x.id === 'leg-1221-to-london')!.duration_min, null);
  assert.match(l.data.claims.find((c) => c.id === 'cl-rail-london-1221')!.statement_zh, /4 小时 10 分钟/);
});
