// 统一的进出模板：
//   进：任何文件 → 适配器（INBOUND）→ 编辑操作 → 本地草稿 → 变更包（roam-edits）→ GitHub → 构建校验 → 发布
//   出：EXPORTERS 一张清单，构建脚本（已发布版本）与网页（含草稿的当前预览）共用
//   送：变更包的提交方式（GitHub 预填 / 剪贴板 / 下载）集中在 transport 函数
// 例外：history/checks.json 由来源检查独占写入（单一写入者），不走变更包。
import type { Bundle } from './model';
import { applyChange, EDITABLE_FIELDS, geoKind, makeEditFile, type ChangeState, type EditFile, type EditOp } from './edits';
import { activitiesCsv, bookingsCsv, claimsCsv, exportPackage, migrate, toIcs } from './exporters';
import { applyRemovals } from './derive';
import { validateGeoJSON, type GeoCheck } from './geojson';

// ───────────── 进：适配器 ─────────────

export interface InboundResult {
  adapter: string;
  label: string;
  ops: EditOp[];
  notes: string[];      // 说明（例如跳过了哪些内容）
  errors: string[];     // 无法导入的原因
  dryRunErrors: string[]; // 按当前预览试应用时出现的问题
  localOnly?: { name: string; geojson: unknown; check: GeoCheck }; // 只能在本设备预览的图层
}

interface Adapter {
  id: string;
  label: string;
  detect: (raw: unknown) => boolean;
  toOps: (raw: unknown, ctx: { state: ChangeState; tripId: string; filename: string; knownEditIds: Set<string> }) => Omit<InboundResult, 'adapter' | 'label' | 'dryRunErrors'>;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object';

const editsAdapter: Adapter = {
  id: 'roam-edits', label: '变更包（网站草稿 / 他人发来的修改）',
  detect: (raw) => isObj(raw) && raw.format === 'roam-edits',
  toOps: (raw, { knownEditIds }) => {
    const f = raw as unknown as EditFile;
    const notes = [`作者：${f.author ?? '未知'}，创建于 ${f.created_at ?? '未知'}，基于版本 ${f.base_version ?? '未知'}`];
    if (knownEditIds.has(f.id)) return { ops: [], notes, errors: [`这批修改（${f.id}）已经发布或已提交，不再重复导入`] };
    if (!Array.isArray(f.ops) || f.ops.length === 0) return { ops: [], notes, errors: ['变更包里没有操作'] };
    return { ops: f.ops, notes, errors: [] };
  },
};

const exportAdapter: Adapter = {
  id: 'roam-export', label: '导出包（备份 / 迁移）',
  detect: (raw) => isObj(raw) && raw.format === 'roam-export',
  toOps: (raw, { state, tripId }) => {
    let pkg;
    try { pkg = migrate(raw); } catch (e) { return { ops: [], notes: [], errors: [(e as Error).message] }; }
    if (pkg.data.trip.id !== tripId) return { ops: [], notes: [], errors: [`导出包属于行程「${pkg.data.trip.id}」，与当前行程「${tripId}」不同`] };
    const { ops, notes } = diffToOps(state, { data: pkg.data, reviews: pkg.reviews, sources: pkg.sources, geo: pkg.geo ?? {} });
    if (ops.length === 0) notes.unshift('与当前数据没有可导入的差异');
    return { ops, notes, errors: [] };
  },
};

const geoAdapter: Adapter = {
  id: 'geojson', label: 'GeoJSON（路线 / 可达范围）',
  detect: (raw) => isObj(raw) && raw.type === 'FeatureCollection',
  toOps: (raw, { state, filename }) => {
    const kind = geoKind(raw);
    const check = validateGeoJSON(raw, kind);
    const base = filename.toLowerCase().replace(/\.(geo)?json$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'layer';
    let name = `${base}.geojson`;
    for (let i = 2; name in state.geo; i++) name = `${base}-${i}.geojson`;
    if (!check.ok) return { ops: [], notes: [], errors: check.errors };
    if (!check.reliable) {
      return { ops: [], notes: [...check.warnings, '缺少来源 / 许可 / 查询参数，不能共享，只能在本设备预览（标为未核实）'], errors: [], localOnly: { name, geojson: raw, check } };
    }
    return { ops: [{ type: 'add_geo', name, geojson: raw }], notes: [`将作为 geo/${name} 共享（${kind === 'isochrone' ? '可达范围' : '路线'}）`, ...check.warnings], errors: [] };
  },
};

export const INBOUND: Adapter[] = [editsAdapter, exportAdapter, geoAdapter];

/** 识别文件并转换为编辑操作；同时按当前预览试应用一次，提前暴露问题。 */
export function readInbound(text: string, filename: string, state: ChangeState, tripId: string, knownEditIds: Set<string> = new Set()): InboundResult {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return { adapter: 'unknown', label: '无法识别', ops: [], notes: [], errors: ['不是有效的 JSON 文件'], dryRunErrors: [] }; }
  const a = INBOUND.find((x) => x.detect(raw));
  if (!a) return { adapter: 'unknown', label: '无法识别', ops: [], notes: [], errors: ['不支持的文件：支持变更包（roam-edits）、导出包（roam-export）和 GeoJSON FeatureCollection'], dryRunErrors: [] };
  const r = a.toOps(raw, { state, tripId, filename, knownEditIds });
  const dryRunErrors = r.ops.length ? applyChange(state, r.ops).errors : [];
  return { adapter: a.id, label: a.label, dryRunErrors, ...r };
}

/**
 * 导出包 → 编辑操作：只导入差异，不删除任何东西。
 * 新增：地点、来源、活动、交通、事实、复核、GeoJSON；修改：活动 / 交通 / 预订的白名单字段、每晚住宿选择。
 */
export function diffToOps(cur: ChangeState, inc: ChangeState): { ops: EditOp[]; notes: string[] } {
  const ops: EditOp[] = [];
  const notes: string[] = [];
  const has = <T extends { id: string }>(list: T[]) => new Set(list.map((x) => x.id));
  const curPlaces = has(cur.data.places), curSources = has(cur.sources), curClaims = has(cur.data.claims), curReviews = has(cur.reviews);
  const newClaims = new Set(inc.data.claims.filter((c) => !curClaims.has(c.id)).map((c) => c.id));

  for (const p of inc.data.places) if (!curPlaces.has(p.id)) ops.push({ type: 'add_place', place: p });
  for (const s of inc.sources) if (!curSources.has(s.id)) ops.push({ type: 'add_source', source: s });

  const diffFields = (entity: 'activity' | 'leg' | 'booking', a: Record<string, unknown>, b: Record<string, unknown>, id: string) => {
    for (const f of EDITABLE_FIELDS[entity]) {
      if (JSON.stringify(a[f] ?? null) !== JSON.stringify(b[f] ?? null)) ops.push({ type: 'set', entity, id, field: f, value: b[f] ?? undefined });
    }
  };
  // 新增的事实由 add_claim 挂到项目上，所以新增项目先去掉这些 claim_ids，避免重复
  const strip = <T extends { claim_ids?: string[] }>(x: T): T => ({ ...x, claim_ids: (x.claim_ids ?? []).filter((c) => !newClaims.has(c)) });
  for (const [entity, curList, incList] of [['activity', cur.data.activities, inc.data.activities], ['leg', cur.data.legs, inc.data.legs]] as const) {
    const byId = new Map<string, Record<string, unknown>>((curList as unknown as Array<Record<string, unknown> & { id: string }>).map((x) => [x.id, x]));
    for (const item of incList) {
      const old = byId.get(item.id);
      if (!old) ops.push(entity === 'activity' ? { type: 'add_activity', activity: strip(item as never) } : { type: 'add_leg', leg: strip(item as never) });
      else diffFields(entity, old, item as unknown as Record<string, unknown>, item.id);
    }
  }
  // 住宿：同一住处的连续晚次合并为一次选择
  const curStay = new Map(cur.data.stays.map((s) => [s.id, s]));
  let run: { place: string | null; ids: string[] } | null = null;
  const flush = () => { if (run) ops.push({ type: 'select_stay', stay_ids: run.ids, place_id: run.place }); run = null; };
  for (const s of inc.data.stays) {
    const old = curStay.get(s.id);
    if (!old || old.selected_place_id === s.selected_place_id) { flush(); continue; }
    if (run && run.place === s.selected_place_id) run.ids.push(s.id);
    else { flush(); run = { place: s.selected_place_id, ids: [s.id] }; }
  }
  flush();
  const curBookings = new Map(cur.data.bookings.map((b) => [b.id, b]));
  const createdBySelect = new Set(applyChange(cur, ops).data.bookings.map((b) => b.id));
  for (const b of inc.data.bookings) {
    const old = curBookings.get(b.id);
    if (old) diffFields('booking', old as unknown as Record<string, unknown>, b as unknown as Record<string, unknown>, b.id);
    else if (createdBySelect.has(b.id)) diffFields('booking', { status: 'unknown', selected: true, required: true, amount: { currency: b.amount.currency, minor: null } }, b as unknown as Record<string, unknown>, b.id);
    else notes.push(`跳过预订「${b.title_zh}」：只能通过选择住处自动生成`);
  }
  for (const c of inc.data.claims) if (newClaims.has(c.id)) ops.push({ type: 'add_claim', claim: c });
  const changedClaims = inc.data.claims.filter((c) => curClaims.has(c.id) && JSON.stringify(c) !== JSON.stringify(cur.data.claims.find((x) => x.id === c.id)));
  if (changedClaims.length) notes.push(`${changedClaims.length} 条已有事实的定义不同，事实定义不能通过网站修改，已跳过`);
  for (const r of inc.reviews) if (!curReviews.has(r.id)) ops.push({ type: 'add_review', review: r });
  for (const [name, g] of Object.entries(inc.geo ?? {})) if (!(name in cur.geo)) ops.push({ type: 'add_geo', name, geojson: g });
  const removedHere = cur.data.activities.filter((a) => !inc.data.activities.some((x) => x.id === a.id)).length;
  if (removedHere) notes.push(`当前有 ${removedHere} 个活动不在导出包中：导入不会删除它们`);
  return { ops, notes };
}

// ───────────── 出：导出清单 ─────────────

export interface Exporter { id: string; label: string; filename: (tripId: string) => string; mime: string; render: (b: Bundle, at: string) => string }

const view = (b: Bundle): Bundle => ({ ...b, data: applyRemovals(b.data).data }); // CSV / ICS 不含已删除项目

export const EXPORTERS: Exporter[] = [
  { id: 'package', label: '完整导出包（JSON，可再导入）', filename: (t) => `${t}.json`, mime: 'application/json', render: (b, at) => JSON.stringify(exportPackage(b, at), null, 2) },
  { id: 'itinerary', label: '行程 CSV', filename: (t) => `${t}-itinerary.csv`, mime: 'text/csv', render: (b) => activitiesCsv(view(b)) },
  { id: 'bookings', label: '预订 CSV', filename: (t) => `${t}-bookings.csv`, mime: 'text/csv', render: (b) => bookingsCsv(view(b)) },
  { id: 'claims', label: '核实事实 CSV', filename: (t) => `${t}-claims.csv`, mime: 'text/csv', render: (b) => claimsCsv(view(b)) },
  { id: 'ics', label: '日历 ICS', filename: (t) => `${t}.ics`, mime: 'text/calendar', render: (b, at) => toIcs(view(b), at) },
];

// ───────────── 送：变更包的提交方式 ─────────────

export const EDITS_DIR = 'data/edits';
export const MAX_PREFILL_URL = 7000;

export function changeFile(ops: EditOp[], author: string, baseVersion: string, note?: string): EditFile {
  const f = makeEditFile(ops, author, baseVersion);
  if (note?.trim()) f.note = note.trim();
  return f;
}

export const serialize = (f: EditFile) => JSON.stringify(f, null, 2) + '\n';

/** GitHub 新建文件页（预填内容）。内容过长时返回不带内容的地址，由调用方改用剪贴板。 */
export function githubNewFileUrl(repo: string, branch: string, f: EditFile): { url: string; prefilled: boolean } {
  const base = `https://github.com/${repo}/new/${branch}/${EDITS_DIR}?filename=${encodeURIComponent(f.id + '.json')}&message=${encodeURIComponent(`edit: ${f.author} 通过网站修改 ${f.ops.length} 项`)}`;
  const full = `${base}&value=${encodeURIComponent(serialize(f))}`;
  return full.length <= MAX_PREFILL_URL ? { url: full, prefilled: true } : { url: base, prefilled: false };
}

/** 浏览器下载文本文件。 */
export function downloadText(filename: string, text: string, mime: string) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

