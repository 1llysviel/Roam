import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadAll, validateAll } from '../scripts/lib/load';
import { applicableTemplates, composeClaimOps, draftsFor, render, templateContext, type TemplateSubject } from '../src/lib/templates';
import { applyOps } from '../src/lib/edits';
import type { Activity, Leg } from '../src/lib/model';

const l = loadAll();

test('模板文件通过 Schema 校验，ID 不重复', () => {
  assert.deepEqual(validateAll(l), []);
  const ids = l.templates.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('占位符填充：缺失值记录为 missing，空括号被清理', () => {
  assert.deepEqual(render('{{title}} {{md}}（{{weekday}}）开放', { title: 'A', md: '12/17', weekday: '周四' }), { text: 'A 12/17（周四）开放', missing: [] });
  const r = render('{{title}} {{md}}（{{weekday}}）', { title: 'A', md: '12/17' });
  assert.equal(r.text, 'A 12/17');
  assert.deepEqual(r.missing, ['weekday']);
});

const act: Activity = { id: 'act-u-t', date: '2026-12-18', order: 50, kind: 'sight', title_zh: '比米什夜场', title_en: 'Beamish evening', place_id: 'pl-beamish-museum', time: null, daypart: 'evening', importance: 'critical', plan_status: 'selected' };
const leg: Leg = { id: 'leg-u-t', date: '2026-12-19', order: 50, mode: 'rail', from_place_id: 'pl-durham-station', to_place_id: 'pl-edinburgh-waverley', depart: null, arrive: null, timing_basis: null, duration_min: null, route_precision: 'schematic', importance: 'high' };

test('按类型选择模板；requires 缺值时模板不适用', () => {
  const s: TemplateSubject = { entity: 'leg', item: leg };
  const ids = applicableTemplates(l.templates, s, templateContext(s, l.data)).map((t) => t.id);
  assert.ok(ids.includes('transit-runs'));
  assert.ok(!ids.includes('transit-departure'));
  const s2: TemplateSubject = { entity: 'leg', item: { ...leg, depart: '09:15' } };
  assert.ok(applicableTemplates(l.templates, s2, templateContext(s2, l.data)).some((t) => t.id === 'transit-departure'));
  assert.equal(applicableTemplates(l.templates, { entity: 'activity', item: { ...act, kind: 'free' } }, {}).length, 0);
});

test('拼接：新增项目 + 附带核实项 + 新来源，应用后通过完整校验并挂到项目上', () => {
  const s: TemplateSubject = { entity: 'activity', item: act };
  const drafts = draftsFor(l.templates, s, l.data);
  assert.match(drafts.find((d) => d.template_id === 'sight-opening')!.statement, /^比米什夜场 12\/18（周五）对游客开放/);
  assert.equal(drafts.find((d) => d.template_id === 'sight-opening')!.critical, true);
  const claimOps = composeClaimOps(drafts, s, l.data, { type: 'new', title: 'Beamish 圣诞', url: 'https://www.beamish.org.uk/', publisher: 'Beamish' });
  assert.equal(claimOps.filter((o) => o.type === 'add_claim').length, drafts.filter((d) => d.checked).length);
  const r = applyOps(l.data, l.reviews, [{ type: 'add_activity', activity: act }, ...claimOps], l.sources);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(validateAll({ ...l, data: r.data, sources: r.sources }), []);
  const added = r.data.activities.find((a) => a.id === 'act-u-t')!;
  assert.equal(added.claim_ids?.length, drafts.filter((d) => d.checked).length);
  assert.equal(r.sources.at(-1)!.fetch, 'auto');
  assert.equal(r.sources.at(-1)!.lead, true);
});

test('交通段核实项带方向；来源不存在时拒绝', () => {
  const s: TemplateSubject = { entity: 'leg', item: leg };
  const ops = composeClaimOps(draftsFor(l.templates, s, l.data), s, l.data, { type: 'existing', id: 'src-lner' });
  const c = ops.find((o) => o.type === 'add_claim');
  assert.ok(c && c.type === 'add_claim' && c.claim.direction === 'Durham station → Edinburgh Waverley');
  const bad = applyOps(l.data, l.reviews, [{ type: 'add_leg', leg }, { type: 'add_claim', claim: { ...(c as any).claim, source_ids: ['src-nope'] } }], l.sources);
  assert.equal(bad.errors.length, 1);
});
