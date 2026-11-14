import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { AppliedEdit, ChecksState, ClaimTemplate, Features, RejectedEdit, ReviewEvent, Source, TripData } from '../../src/lib/model';
import { applyOps, type EditFile } from '../../src/lib/edits';
import { dateRange } from '../../src/lib/dates';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const TRIP_ID = process.env.ROAM_TRIP ?? 'uk-2026-12';

const readYaml = (p: string) => YAML.parse(readFileSync(join(ROOT, p), 'utf8'));
const readJson = (p: string) => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));

export interface Loaded {
  data: TripData; sources: Source[]; reviews: ReviewEvent[]; checks: ChecksState; features: Features;
  geo: Record<string, unknown>; templates: ClaimTemplate[];
}

function makeAjv() {
  const ajv = new (Ajv2020 as any)({ allErrors: true, strict: false });
  (addFormats as any)(ajv);
  for (const f of readdirSync(join(ROOT, 'schemas'))) ajv.addSchema(readJson(`schemas/${f}`), f);
  return ajv;
}

export function loadAll(): Loaded {
  const data = readYaml(`data/trips/${TRIP_ID}.yaml`) as TripData;
  const sources = (readYaml(`data/sources/${TRIP_ID}.yaml`) as { sources: Source[] }).sources;
  const reviews = (readYaml('history/reviews.yaml') as { reviews: ReviewEvent[] }).reviews ?? [];
  const checks = readJson('history/checks.json') as ChecksState;
  const features = readJson('config/features.json') as Features;
  const geo: Record<string, unknown> = {};
  const geoDir = join(ROOT, 'geo');
  if (existsSync(geoDir)) for (const f of readdirSync(geoDir)) if (f.endsWith('.geojson')) geo[f] = readJson(`geo/${f}`);
  const templates = (readYaml('templates/claims.yaml') as { templates: ClaimTemplate[] }).templates;
  return { data, sources, reviews, checks, features, geo, templates };
}

/** Schema 校验 + 引用完整性 + 真实性约定。返回错误列表（空表示通过）。 */
export function validateAll(l: Loaded): string[] {
  const errs: string[] = [];
  const ajv = makeAjv();
  const check = (schema: string, value: unknown, label: string) => {
    const v = ajv.getSchema(schema)!;
    if (!v(value)) for (const e of v.errors ?? []) errs.push(`${label}${e.instancePath} ${e.message}`);
  };
  check('trip.schema.json', l.data, 'trip');
  check('sources.schema.json', { schema_version: 1, sources: l.sources }, 'sources');
  check('reviews.schema.json', { schema_version: 1, reviews: l.reviews }, 'reviews');
  check('checks.schema.json', l.checks, 'checks');
  check('claim-templates.schema.json', { schema_version: 1, templates: l.templates }, 'templates');
  if (errs.length) return errs;

  const d = l.data;
  const ids = new Map<string, string>();
  const reg = (kind: string, id: string) => { if (ids.has(id)) errs.push(`重复 ID：${id}（${ids.get(id)} 与 ${kind}）`); ids.set(id, kind); };
  d.places.forEach((x) => reg('place', x.id)); d.stays.forEach((x) => reg('stay', x.id));
  d.activities.forEach((x) => reg('activity', x.id)); d.legs.forEach((x) => reg('leg', x.id));
  d.bookings.forEach((x) => reg('booking', x.id)); d.claims.forEach((x) => reg('claim', x.id));
  l.sources.forEach((x) => reg('source', x.id));
  const is = (kind: string, id: string | null | undefined) => !id || ids.get(id) === kind;
  const need = (ok: boolean, msg: string) => { if (!ok) errs.push(msg); };

  const cities = new Set(d.trip.cities.map((c) => c.id));
  const days = new Set(dateRange(d.trip.start_date, d.trip.end_date));
  need(d.trip.start_date <= d.trip.end_date, 'trip.start_date 晚于 end_date');

  for (const p of d.places) {
    need(cities.has(p.city), `${p.id}: 未知城市 ${p.city}`);
    need((p.coord === null) === (p.coord_source === 'none'), `${p.id}: coord 为空时 coord_source 必须为 none，反之亦然`);
  }
  for (const s of d.stays) {
    need(days.has(s.night) && s.night !== d.trip.end_date, `${s.id}: 晚上日期不在行程内`);
    need(is('place', s.selected_place_id), `${s.id}: selected_place_id 不存在`);
    need(s.candidates.every((c) => is('place', c)), `${s.id}: 候选地点不存在`);
    need(is('booking', s.booking_id), `${s.id}: booking_id 不存在`);
    need(!s.selected_place_id || s.candidates.includes(s.selected_place_id), `${s.id}: 已选住宿必须在候选中`);
  }
  for (const a of d.activities) {
    need(days.has(a.date), `${a.id}: 日期 ${a.date} 不在行程内`);
    need(is('place', a.place_id), `${a.id}: place_id 不存在`);
    need((a.booking_ids ?? []).every((b) => is('booking', b)), `${a.id}: booking 引用不存在`);
    need((a.claim_ids ?? []).every((c) => is('claim', c)), `${a.id}: claim 引用不存在`);
    need(!a.alternative_to || is('activity', a.alternative_to), `${a.id}: alternative_to 不存在`);
    if (a.time?.basis === 'booked') {
      const bk = (a.booking_ids ?? []).map((b) => d.bookings.find((x) => x.id === b));
      need(bk.some((b) => b?.status === 'booked'), `${a.id}: 时间标为 booked，但关联预订未确认为 booked`);
    }
  }
  for (const g of d.legs) {
    need(days.has(g.date), `${g.id}: 日期不在行程内`);
    need(is('place', g.from_place_id) && is('place', g.to_place_id), `${g.id}: 起终点不存在`);
    need((g.booking_ids ?? []).every((b) => is('booking', b)), `${g.id}: booking 引用不存在`);
    need((g.claim_ids ?? []).every((c) => is('claim', c)), `${g.id}: claim 引用不存在`);
    if (g.route_precision === 'actual_network') need(!!g.route_geojson && !!l.geo[g.route_geojson], `${g.id}: actual_network 必须引用 geo/ 中存在的路线文件`);
    if (g.timing_basis === 'booked') need((g.booking_ids ?? []).some((b) => d.bookings.find((x) => x.id === b)?.status === 'booked'), `${g.id}: 班次标为 booked，但关联预订未确认`);
  }
  for (const c of d.claims) {
    need(ids.has(c.subject_id), `${c.id}: subject_id ${c.subject_id} 不存在`);
    need(days.has(c.target_date), `${c.id}: target_date 不在行程内`);
    need(c.source_ids.every((s) => is('source', s)), `${c.id}: 来源不存在`);
  }
  for (const r of l.reviews) {
    need(is('claim', r.claim_id), `${r.id}: claim 不存在`);
    need(!r.source_id || is('source', r.source_id), `${r.id}: source 不存在`);
  }
  for (const [name, g] of Object.entries(l.geo)) {
    const meta = (g as any)?.roam;
    need(!!meta?.source && !!meta?.license, `geo/${name}: 必须在 roam 元数据中声明 source 与 license`);
  }
  return errs;
}

export interface WithEdits { loaded: Loaded; applied: AppliedEdit[]; rejected: RejectedEdit[] }

/** 按文件名顺序应用 data/edits/*.json；任何一个文件不合法（结构、操作或应用后的数据校验）就整体跳过。 */
export function applyEditFiles(base: Loaded): WithEdits {
  const dir = join(ROOT, 'data', 'edits');
  const applied: AppliedEdit[] = [];
  const rejected: RejectedEdit[] = [];
  if (!existsSync(dir)) return { loaded: base, applied, rejected };
  const ajv = makeAjv();
  const check = ajv.getSchema('edits.schema.json')!;
  let cur = base;
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
    let ef: EditFile;
    try { ef = JSON.parse(readFileSync(join(dir, file), 'utf8')); }
    catch (e) { rejected.push({ file, id: null, errors: [`JSON 解析失败：${(e as Error).message}`] }); continue; }
    if (!check(ef)) { rejected.push({ file, id: (ef as any)?.id ?? null, errors: (check.errors ?? []).map((e: { instancePath: string; message?: string }) => `${e.instancePath} ${e.message}`) }); continue; }
    if (applied.some((a) => a.id === ef.id)) { rejected.push({ file, id: ef.id, errors: ['重复的修改 ID'] }); continue; }
    const r = applyOps(cur.data, cur.reviews, ef.ops, cur.sources);
    const next: Loaded = { ...cur, data: r.data, reviews: r.reviews, sources: r.sources };
    const errs = [...r.errors, ...validateAll(next)];
    if (errs.length) { rejected.push({ file, id: ef.id, errors: errs.slice(0, 10) }); continue; }
    cur = next;
    applied.push({ id: ef.id, file, author: ef.author, created_at: ef.created_at, ops: ef.ops.length });
  }
  return { loaded: cur, applied, rejected };
}
