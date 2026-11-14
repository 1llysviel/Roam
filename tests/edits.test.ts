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
