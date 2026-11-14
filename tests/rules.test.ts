import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateExplicitOpen, serviceDirectionDate } from '../src/lib/rules';
import { claim } from './helpers';

const c = claim({ target_date: '2026-12-17' });

test('指定日期开放：正确年份与日期通过', () => {
  assert.equal(dateExplicitOpen(c, ['Thursday 17 December 2026: open 10am–4pm']).matched, true);
  assert.equal(dateExplicitOpen(c, ['We are open on 17th Dec']).matched, true);
});

test('旧年份不能通过指定日期校验', () => {
  const r = dateExplicitOpen(c, ['Thursday 17 December 2025: open 10am–4pm']);
  assert.equal(r.matched, false);
});

test('只有普通营业时间、没有目标日期不能通过', () => {
  assert.equal(dateExplicitOpen(c, ['Open daily 10am–5pm', 'Thursdays: open']).matched, false);
});

test('目标日期段落写着关闭则不确认', () => {
  assert.equal(dateExplicitOpen(c, ['17 December 2026 — closed for a private event; open again 18 December']).matched, false);
});

test('错误方向不能通过班次校验', () => {
  const x = claim({ target_date: '2026-12-25', direction: 'Victoria Coach Station → Heathrow Central Bus Station' });
  assert.equal(serviceDirectionDate(x, ['25 December: Heathrow to Victoria departures at 16:45']).matched, false);
  assert.equal(serviceDirectionDate(x, ['25 December: Victoria to Heathrow departures at 16:45']).matched, true);
  assert.equal(serviceDirectionDate(x, ['24 December: Victoria to Heathrow departures at 16:45']).matched, false);
  assert.equal(serviceDirectionDate(x, ['25 December 2025: Victoria to Heathrow 16:45']).matched, false);
});
