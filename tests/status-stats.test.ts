import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveClaimState } from '../src/lib/status';
import { bookingCompletion, coverage, effectiveRate, ratioText } from '../src/lib/stats';
import type { Booking, ReviewEvent } from '../src/lib/model';
import { claim, emptyChecks } from './helpers';

const now = new Date('2026-12-01T12:00:00Z');
const srcs = new Map();
const rv = (over: Partial<ReviewEvent>): ReviewEvent => ({ id: 'rv-1', claim_id: 'cl-x', at: '2026-11-30T10:00:00Z', reviewer: 't', result: 'verified', verified_for_date: '2026-12-17', source_id: 'src-a', method: 'manual', ...over });

test('HTTP 抓取成功不等于事实已核实', () => {
  const ch = emptyChecks();
  ch.sources['src-a'] = { last_attempt_at: '2026-11-30T00:00:00Z', last_ok_at: '2026-11-30T00:00:00Z', fetch_status: 'ok', http_status: 200, hash: 'abc', excerpt: [] };
  const s = deriveClaimState(claim(), [], ch, srcs, now);
  assert.equal(s.status, 'unverified');
  assert.equal(s.checked, true);
  assert.equal(s.effective, false);
});

test('已确认但日期不匹配不计入有效核实', () => {
  const s = deriveClaimState(claim(), [rv({ verified_for_date: '2026-12-18' })], emptyChecks(), srcs, now);
  assert.equal(s.status, 'verified');
  assert.equal(s.effective, false);
});

test('超过 max_age_days 视为过期', () => {
  const s = deriveClaimState(claim({ max_age_days: 7 }), [rv({ at: '2026-11-01T00:00:00Z' })], emptyChecks(), srcs, now);
  assert.equal(s.freshness, 'stale');
  assert.equal(s.effective, false);
});

test('确认后来源内容变化 → 待复核，确认值不自动更新', () => {
  const ch = emptyChecks();
  ch.pending_reviews.push({ id: 'pr', source_id: 'src-a', claim_ids: ['cl-x'], detected_at: '2026-12-01T00:00:00Z', old_hash: 'a', new_hash: 'b', excerpt: [] });
  const s = deriveClaimState(claim(), [rv({ value: '10–16' })], ch, srcs, now);
  assert.equal(s.status, 'needs_review');
  assert.equal(s.value, '10–16');
  assert.equal(s.effective, false);
});

test('有效核实：已确认、日期匹配、未过期、无冲突', () => {
  const s = deriveClaimState(claim(), [rv({})], emptyChecks(), srcs, now);
  assert.equal(s.effective, true);
  assert.equal(effectiveRate([s]).num, 1);
});

test('分母为零显示不适用', () => {
  assert.equal(ratioText(coverage([])), '不适用');
  assert.equal(ratioText(bookingCompletion([])), '不适用');
});

const bk = (over: Partial<Booking>): Booking => ({ id: 'b', title_zh: 'b', kind: 'x', selected: true, required: true, status: 'unknown', owner: null, amount: { currency: 'GBP', minor: null }, cancel_by: null, ...over });
test('预订完成率：仅已选定且必须预订；unknown 算待解决；候选不计入', () => {
  const r = bookingCompletion([
    bk({ id: 'a', status: 'booked' }),
    bk({ id: 'b', status: 'unknown' }),
    bk({ id: 'c', selected: false, status: 'booked' }),
    bk({ id: 'd', required: false, status: 'not_required' }),
  ]);
  assert.deepEqual([r.num, r.den], [1, 2]);
  assert.deepEqual(r.missing, ['b']);
});
