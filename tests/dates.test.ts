import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weekday, dateRange, shortDate, londonToday, addDays, formatMoney } from '../src/lib/dates';

test('纯日期的星期计算与运行时区无关', () => {
  const tz = process.env.TZ;
  for (const zone of ['America/Los_Angeles', 'Asia/Shanghai', 'UTC']) {
    process.env.TZ = zone;
    assert.equal(weekday('2026-12-11'), 5);
    assert.equal(weekday('2026-12-13'), 0);
    assert.equal(weekday('2026-12-25'), 5);
    assert.equal(shortDate('2026-12-11'), '12/11');
  }
  process.env.TZ = tz;
});

test('行程 12/11–12/25 共 15 天，跨月计算正确', () => {
  assert.equal(dateRange('2026-12-11', '2026-12-25').length, 15);
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
});

test('伦敦当地日期：冬令时 GMT 与夏令时 BST', () => {
  assert.equal(londonToday(new Date('2026-12-24T23:30:00Z')), '2026-12-24');
  assert.equal(londonToday(new Date('2026-07-01T23:30:00Z')), '2026-07-02');
});

test('金额以整数最小单位保存，未知显示未知', () => {
  assert.equal(formatMoney({ currency: 'GBP', minor: 1250 }), '£12.50');
  assert.equal(formatMoney({ currency: 'GBP', minor: null }), '未知');
});
