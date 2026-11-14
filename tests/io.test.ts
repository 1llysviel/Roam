import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, validateAll } from '../scripts/lib/load';
import { applyChange, makeEditFile, type ChangeState, type EditOp } from '../src/lib/edits';
import { EXPORTERS, githubNewFileUrl, readInbound } from '../src/lib/io';
import { realBundle } from './helpers';

const l = loadAll();
const base: ChangeState = { data: l.data, reviews: l.reviews, sources: l.sources, geo: l.geo };
const trip = l.data.trip.id;

const iso = {
  type: 'FeatureCollection',
  features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[[-0.15, 51.49], [-0.14, 51.49], [-0.14, 51.5], [-0.15, 51.49]]] } }],
  roam: { query: { origin_place_id: 'pl-victoria-coach', direction: 'depart_from', mode: 'walk', minutes: 15, date: '2026-12-25', time: '15:00' }, source: 'local test', generated_at: '2026-11-14T00:00:00Z', license: 'CC0' },
};

// 一组覆盖各类操作的修改
const sampleOps: EditOp[] = [
  { type: 'add_place', place: { id: 'pl-u-york', name_zh: '约克测试酒店', name_en: 'York Test', kind: 'lodging', city: 'york', address: null, coord: null, coord_source: 'none', coord_precision: 'none' } },
  { type: 'select_stay', stay_ids: ['st-1215', 'st-1216'], place_id: 'pl-u-york' },
  { type: 'set', entity: 'booking', id: 'bk-u-york-1215', field: 'status', value: 'booked' },
  { type: 'set', entity: 'booking', id: 'bk-u-york-1215', field: 'evidence', value: '同行确认已付款' },
  { type: 'set', entity: 'booking', id: 'bk-lumley', field: 'owner', value: '小林' },
  { type: 'add_activity', activity: { id: 'act-u-nhm', date: '2026-12-13', order: 20, kind: 'sight', title_zh: '自然史博物馆', title_en: 'NHM', place_id: null, time: null, importance: 'normal', plan_status: 'selected' } },
  { type: 'add_source', source: { id: 'src-u-nhm', kind: 'official', title: 'NHM', url: 'https://www.nhm.ac.uk/', publisher: 'NHM', fetch: 'auto', lead: true, keywords: [] } },
  { type: 'add_claim', claim: { id: 'cl-u-nhm', subject_id: 'act-u-nhm', kind: 'opening', statement_zh: 'NHM 12/13 开放', target_date: '2026-12-13', importance: 'normal', critical: false, source_ids: ['src-u-nhm'], max_age_days: 7 } },
  { type: 'add_review', review: { id: 'rv-u-1', claim_id: 'cl-u-nhm', at: '2026-11-20T10:00:00Z', reviewer: 't', result: 'verified', verified_for_date: '2026-12-13', source_id: 'src-u-nhm', method: 'manual' } },
  { type: 'set', entity: 'activity', id: 'act-1213-free', field: 'removed', value: true },
  { type: 'add_geo', name: 'victoria-walk-15.geojson', geojson: iso },
];

test('样例修改本身合法', () => {
  const r = applyChange(base, sampleOps);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateAll({ ...l, data: r.data, reviews: r.reviews, sources: r.sources, geo: r.geo }), []);
});

test('导出包往返：A 导出 → 导入到原始数据 → 与 A 一致，且通过完整校验', () => {
  const a = applyChange(base, sampleOps);
  const bundleA = { ...realBundle(), data: a.data, reviews: a.reviews, sources: a.sources, geo: a.geo };
  const pkg = EXPORTERS.find((e) => e.id === 'package')!.render(bundleA, '2026-11-20T00:00:00Z');
  const res = readInbound(pkg, 'backup.json', base, trip);
  assert.equal(res.adapter, 'roam-export');
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.dryRunErrors, []);
  const b = applyChange(base, res.ops);
  assert.deepEqual(b.errors, []);
  const norm = (s: ChangeState) => JSON.stringify({
    acts: s.data.activities.map((x) => [x.id, x.removed ?? false, [...(x.claim_ids ?? [])].sort()]).sort(),
    stays: s.data.stays.map((x) => [x.id, x.selected_place_id, x.booking_id]),
    bookings: s.data.bookings.map((x) => [x.id, x.status, x.owner, x.evidence ?? null]).sort(),
    claims: s.data.claims.map((x) => x.id).sort(), reviews: s.reviews.map((x) => x.id).sort(),
    sources: s.sources.map((x) => x.id).sort(), geo: Object.keys(s.geo).sort(),
  });
  assert.equal(norm(b), norm(a));
  assert.deepEqual(validateAll({ ...l, data: b.data, reviews: b.reviews, sources: b.sources, geo: b.geo }), []);
  // 再导入一次：没有差异
  const again = readInbound(pkg, 'backup.json', b, trip);
  assert.equal(again.ops.length, 0);
});

test('导出包导入不会删除当前已有的内容；不同行程被拒绝', () => {
  const smaller = { ...realBundle(), data: { ...l.data, activities: l.data.activities.slice(1) } };
  const pkg = EXPORTERS[0].render(smaller, '2026-11-20T00:00:00Z');
  const res = readInbound(pkg, 'x.json', base, trip);
  assert.equal(res.ops.length, 0);
  assert.ok(res.notes.some((n) => /不会删除/.test(n)));
  const other = JSON.parse(pkg); other.data.trip.id = 'other-trip';
  assert.match(readInbound(JSON.stringify(other), 'x.json', base, trip).errors[0], /不同/);
});

test('变更包：直接导入为操作；已发布或已提交的批次不重复导入', () => {
  const f = makeEditFile(sampleOps.slice(0, 2), '小林', 'test');
  const ok = readInbound(JSON.stringify(f), 'a.json', base, trip);
  assert.equal(ok.adapter, 'roam-edits');
  assert.equal(ok.ops.length, 2);
  const dup = readInbound(JSON.stringify(f), 'a.json', base, trip, new Set([f.id]));
  assert.equal(dup.ops.length, 0);
  assert.equal(dup.errors.length, 1);
});

test('GeoJSON：参数完整 → 共享（add_geo）；缺元数据 → 只能本设备预览；名称自动去重', () => {
  const shared = readInbound(JSON.stringify(iso), 'Victoria Walk 15.geojson', base, trip);
  assert.equal(shared.ops[0].type, 'add_geo');
  assert.equal((shared.ops[0] as { name: string }).name, 'victoria-walk-15.geojson');
  const withIt = applyChange(base, shared.ops);
  assert.equal(readInbound(JSON.stringify(iso), 'Victoria Walk 15.geojson', withIt, trip).ops[0].type === 'add_geo' && (readInbound(JSON.stringify(iso), 'Victoria Walk 15.geojson', withIt, trip).ops[0] as { name: string }).name, 'victoria-walk-15-2.geojson');
  const bare = { ...iso, roam: undefined };
  const local = readInbound(JSON.stringify(bare), 'x.geojson', base, trip);
  assert.equal(local.ops.length, 0);
  assert.ok(local.localOnly);
  // 直接构造不合格的 add_geo 也会被引擎拒绝
  assert.equal(applyChange(base, [{ type: 'add_geo', name: 'bad.geojson', geojson: bare }]).errors.length, 1);
});

test('无法识别的文件给出明确提示', () => {
  assert.match(readInbound('not json', 'a.txt', base, trip).errors[0], /JSON/);
  assert.match(readInbound('{"hello":1}', 'a.json', base, trip).errors[0], /不支持/);
});

test('导出清单覆盖构建产物；提交地址指向 data/edits 并在过长时不预填', () => {
  assert.deepEqual(EXPORTERS.map((e) => e.filename(trip)), [`${trip}.json`, `${trip}-itinerary.csv`, `${trip}-bookings.csv`, `${trip}-claims.csv`, `${trip}.ics`]);
  const small = githubNewFileUrl('o/r', 'main', makeEditFile(sampleOps.slice(0, 1), 'a', 'v'));
  assert.ok(small.prefilled && small.url.startsWith('https://github.com/o/r/new/main/data/edits?filename=ed-'));
  const big = githubNewFileUrl('o/r', 'main', makeEditFile(Array(80).fill(sampleOps[5]), 'a', 'v'));
  assert.equal(big.prefilled, false);
});
