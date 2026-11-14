import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exportPackage, importPackage, toIcs } from '../src/lib/exporters';
import { buildIndex } from '../src/lib/derive';
import { bookingCompletion, coverage, effectiveRate } from '../src/lib/stats';
import { textBlocks, relevantBlocks, hashBlocks } from '../scripts/lib/extract';
import { readUrl, writeUrl } from '../src/lib/url';
import { realBundle } from './helpers';

test('导出再导入：ID、日期、状态与关键统计一致', () => {
  const b = realBundle();
  const pkg = importPackage(JSON.stringify(exportPackage(b, '2026-11-14T00:00:00Z')));
  const b2 = { ...b, data: pkg.data, sources: pkg.sources, reviews: pkg.reviews, checks: pkg.checks };
  const now = new Date('2026-11-14T00:00:00Z');
  const [i1, i2] = [buildIndex(b, now), buildIndex(b2, now)];
  assert.deepEqual(i2.bundle.data.activities.map((a) => [a.id, a.date]), i1.bundle.data.activities.map((a) => [a.id, a.date]));
  assert.deepEqual(i2.bundle.data.bookings.map((x) => [x.id, x.status]), i1.bundle.data.bookings.map((x) => [x.id, x.status]));
  assert.deepEqual(coverage(i2.claimStates), coverage(i1.claimStates));
  assert.deepEqual(effectiveRate(i2.claimStates), effectiveRate(i1.claimStates));
  assert.deepEqual(bookingCompletion(b2.data.bookings), bookingCompletion(b.data.bookings));
});

test('导入拒绝更高 schema 版本与非 roam 文件', () => {
  assert.throws(() => importPackage(JSON.stringify({ format: 'roam-export', schema_version: 99 })));
  assert.throws(() => importPackage('{"type":"FeatureCollection"}'));
});

test('ICS：精确时刻带 Europe/London 时区，无时刻为全天纯日期', () => {
  const ics = toIcs(realBundle(), '2026-11-14T00:00:00.000Z');
  assert.match(ics, /DTSTART;TZID=Europe\/London:20261225T214500|DTSTART;TZID=Europe\/London:20261225T215000/);
  assert.match(ics, /DTSTART;VALUE=DATE:20261211/);
  assert.doesNotMatch(ics, /Tower of London \(alternative\)/);
});

test('段落提取忽略导航/页脚变化', () => {
  const page = (nav: string) => `<html><body><nav><li>${nav}</li></nav><main><p>Christmas Day: services from Victoria to Heathrow</p><p>Cookies policy</p></main><footer><p>© ${nav}</p></footer><script>var x=1</script></body></html>`;
  const k = ['christmas'];
  const a = relevantBlocks(textBlocks(page('Home | Christmas offers')), k, 6, 280);
  const b = relevantBlocks(textBlocks(page('Shop | Christmas sale 50%')), k, 6, 280);
  assert.deepEqual(a, ['Christmas Day: services from Victoria to Heathrow']);
  assert.equal(hashBlocks(a), hashBlocks(b));
});

test('共享链接参数往返', () => {
  const s = readUrl('?v=claims&d=2026-12-25&p=pl-lhr-t3&m=map');
  assert.equal(writeUrl(s), '?v=claims&d=2026-12-25&p=pl-lhr-t3&m=map');
  assert.equal(readUrl('?v=evil').v, 'day');
});
