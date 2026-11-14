import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyOps, privacyWarnings, makeEditFile, quickCheck } from '../src/lib/edits';
import { loadAll, validateAll } from '../scripts/lib/load';

const l = loadAll();

test('只允许白名单字段；未知对象报错且不修改', () => {
  const r = applyOps(l.data, l.reviews, [
    { type: 'set', entity: 'booking', id: 'bk-lumley', field: 'id', value: 'x' },
    { type: 'set', entity: 'activity', id: 'nope', field: 'notes', value: 'x' },
  ]);
  assert.equal(r.errors.length, 2);
  assert.deepEqual(r.data, l.data);
});

test('选择住处：加入候选、设为选定、生成状态未知的共用预订，且通过完整校验', () => {
  const r = applyOps(l.data, l.reviews, [
    { type: 'add_place', place: { id: 'pl-stay-test', name_zh: '测试酒店', name_en: 'Test Hotel', kind: 'lodging', city: 'york', address: null, coord: null, coord_source: 'none', coord_precision: 'none' } },
    { type: 'select_stay', stay_ids: ['st-1215', 'st-1216'], place_id: 'pl-stay-test' },
  ]);
  assert.deepEqual(r.errors, []);
  const nights = r.data.stays.filter((s) => s.city === 'york');
  assert.ok(nights.every((s) => s.selected_place_id === 'pl-stay-test' && s.booking_id === 'bk-stay-test-1215'));
  assert.equal(r.data.bookings.filter((b) => b.id === 'bk-stay-test-1215').length, 1);
  assert.equal(r.data.bookings.find((b) => b.id === 'bk-stay-test-1215')!.status, 'unknown');
  assert.deepEqual(validateAll({ ...l, data: r.data, reviews: r.reviews }), []);
});

test('网站上标为已订但没写依据：浏览器提示，构建校验拒绝', () => {
  const r = applyOps(l.data, l.reviews, [{ type: 'set', entity: 'booking', id: 'bk-lumley', field: 'status', value: 'booked' }]);
  assert.ok(quickCheck(r.data).length > 0);
  assert.ok(validateAll({ ...l, data: r.data }).some((e) => /evidence/.test(e)));
});

test('登记复核后事实状态由复核事件推导', () => {
  const r = applyOps(l.data, l.reviews, [{ type: 'add_review', review: { id: 'rv-t1', claim_id: 'cl-beamish-evening-1218', at: '2026-11-20T10:00:00Z', reviewer: 't', result: 'verified', verified_for_date: '2026-12-18', source_id: 'src-beamish', method: 'manual' } }]);
  assert.equal(r.reviews.length, l.reviews.length + 1);
  assert.deepEqual(validateAll({ ...l, data: r.data, reviews: r.reviews }), []);
});

test('提交前提醒私密信息；修改文件结构完整', () => {
  assert.ok(privacyWarnings([{ type: 'set', entity: 'booking', id: 'b', field: 'evidence', value: '订单号 ABC12345678' }]).length > 0);
  assert.deepEqual(privacyWarnings([{ type: 'set', entity: 'booking', id: 'b', field: 'evidence', value: '小林确认已付款' }]), []);
  const f = makeEditFile([{ type: 'set', entity: 'booking', id: 'bk-lumley', field: 'owner', value: '小林' }], '小林', 'test');
  assert.match(f.id, /^ed-[a-z0-9-]+$/);
  assert.equal(f.format, 'roam-edits');
});

import { applyRemovals, buildIndex } from '../src/lib/derive';
import { bookingCompletion, effectiveRate } from '../src/lib/stats';
import { toIcs, activitiesCsv } from '../src/lib/exporters';
import { realBundle } from './helpers';

test('新增活动与交通（含新地点）通过完整校验，并出现在当天行程中', () => {
  const r = applyOps(l.data, l.reviews, [
    { type: 'add_place', place: { id: 'pl-u-nhm', name_zh: '自然史博物馆', name_en: 'Natural History Museum', kind: 'sight', city: 'london', address: null, coord: null, coord_source: 'none', coord_precision: 'none' } },
    { type: 'add_activity', activity: { id: 'act-u-nhm', date: '2026-12-13', order: 20, kind: 'sight', title_zh: '自然史博物馆', title_en: 'Natural History Museum', place_id: 'pl-u-nhm', time: null, daypart: 'morning', importance: 'normal', plan_status: 'selected' } },
    { type: 'add_leg', leg: { id: 'leg-u-1', date: '2026-12-13', order: 30, mode: 'tube', from_place_id: 'pl-u-nhm', to_place_id: 'pl-covent-garden', depart: null, arrive: null, timing_basis: null, duration_min: null, route_precision: 'unavailable', importance: 'low' } },
  ]);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateAll({ ...l, data: r.data }), []);
  const b = { ...realBundle(), data: r.data };
  const ix = buildIndex(b, new Date('2026-11-14T00:00:00Z'));
  assert.deepEqual((ix.itemsByDay.get('2026-12-13') ?? []).map((i) => (i.type === 'activity' ? i.a.id : i.l.id)), ['act-1213-free', 'act-u-nhm', 'leg-u-1']);
});

test('新增时 ID 冲突或带删除标记被拒绝', () => {
  const r = applyOps(l.data, l.reviews, [
    { type: 'add_activity', activity: { ...l.data.activities[0] } },
    { type: 'add_activity', activity: { ...l.data.activities[0], id: 'act-u-x', removed: true } },
  ]);
  assert.equal(r.errors.length, 2);
  assert.equal(r.data.activities.length, l.data.activities.length);
});

test('删除（软删除）：从行程与导出中移除，相关事实不适用，孤立预订不计入完成率；可恢复', () => {
  const del = applyOps(l.data, l.reviews, [{ type: 'set', entity: 'activity', id: 'act-1218-beamish-evening', field: 'removed', value: true }]);
  assert.deepEqual(validateAll({ ...l, data: del.data }), []);
  const b = { ...realBundle(), data: del.data };
  const ix = buildIndex(b, new Date('2026-11-14T00:00:00Z'));
  assert.ok(!(ix.itemsByDay.get('2026-12-18') ?? []).some((i) => i.type === 'activity' && i.a.id === 'act-1218-beamish-evening'));
  assert.equal(ix.removedByDay.get('2026-12-18')!.length, 1);
  assert.equal(ix.claimState.get('cl-beamish-evening-1218')!.claim.applicable, false);
  assert.ok(ix.orphanBookings.has('bk-beamish-evening'));
  const before = bookingCompletion(l.data.bookings).den;
  assert.equal(bookingCompletion(ix.bundle.data.bookings).den, before - 1);
  assert.equal(effectiveRate(ix.claimStates).den, l.data.claims.length - 1);
  const view = { ...b, data: applyRemovals(b.data).data };
  assert.doesNotMatch(toIcs(view, '2026-11-14T00:00:00.000Z'), /act-1218-beamish-evening/);
  assert.doesNotMatch(activitiesCsv(view), /act-1218-beamish-evening/);
  // 恢复
  const back = applyOps(del.data, l.reviews, [{ type: 'set', entity: 'activity', id: 'act-1218-beamish-evening', field: 'removed', value: false }]);
  assert.equal(applyRemovals(back.data).orphanBookings.size, 0);
});

test('删除住宿关联的活动时，被住宿晚次引用的预订不算孤立', () => {
  const del = applyOps(l.data, l.reviews, [{ type: 'set', entity: 'activity', id: 'act-1217-lumley', field: 'removed', value: true }]);
  assert.ok(!applyRemovals(del.data).orphanBookings.has('bk-lumley'));
});
