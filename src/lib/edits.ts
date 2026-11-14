// 编辑操作：浏览器预览（本地草稿）与构建（data/edits/*.json）共用同一套应用逻辑。
// 只允许白名单内的字段；应用后的完整数据仍须通过 scripts/lib/load.ts 的 Schema 与引用校验。
import type { Activity, Leg, Place, ReviewEvent, TripData } from './model';

export type EditEntity = 'activity' | 'leg' | 'booking';

export type EditOp =
  | { type: 'set'; entity: EditEntity; id: string; field: string; value: unknown }
  | { type: 'add_place'; place: Place }
  | { type: 'select_stay'; stay_ids: string[]; place_id: string | null }
  | { type: 'add_review'; review: ReviewEvent }
  | { type: 'add_activity'; activity: Activity }
  | { type: 'add_leg'; leg: Leg };

export interface EditFile {
  format: 'roam-edits';
  schema_version: 1;
  id: string;
  author: string;
  created_at: string;
  base_version: string;
  note?: string;
  ops: EditOp[];
}

export const EDITABLE_FIELDS: Record<EditEntity, string[]> = {
  activity: ['date', 'order', 'title_zh', 'title_en', 'kind', 'place_id', 'plan_status', 'daypart', 'time', 'notes', 'importance', 'removed', 'removed_note'],
  leg: ['date', 'order', 'depart', 'arrive', 'timing_basis', 'daypart', 'mode', 'notes', 'importance', 'removed', 'removed_note'],
  booking: ['status', 'owner', 'amount', 'cancel_by', 'evidence', 'notes', 'selected', 'required'],
};

export interface ApplyResult { data: TripData; reviews: ReviewEvent[]; errors: string[]; touched: Set<string> }

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

/** 依次应用操作；遇到未知对象或不允许的字段记为错误并跳过该操作。 */
export function applyOps(base: TripData, baseReviews: ReviewEvent[], ops: EditOp[]): ApplyResult {
  const data = clone(base);
  const reviews = clone(baseReviews);
  const errors: string[] = [];
  const touched = new Set<string>();
  const list = (e: EditEntity) => (e === 'activity' ? data.activities : e === 'leg' ? data.legs : data.bookings) as unknown as Array<Record<string, unknown> & { id: string }>;

  for (const op of ops) {
    switch (op.type) {
      case 'set': {
        if (!EDITABLE_FIELDS[op.entity]?.includes(op.field)) { errors.push(`不允许修改 ${op.entity}.${op.field}`); break; }
        const obj = list(op.entity).find((x) => x.id === op.id);
        if (!obj) { errors.push(`找不到 ${op.entity} ${op.id}`); break; }
        if (op.value === undefined || op.value === '') delete obj[op.field];
        else obj[op.field] = clone(op.value);
        touched.add(op.id);
        break;
      }
      case 'add_place': {
        if (data.places.some((p) => p.id === op.place.id)) { errors.push(`地点 ID 已存在：${op.place.id}`); break; }
        data.places.push(clone(op.place));
        touched.add(op.place.id);
        break;
      }
      case 'select_stay': {
        const stays = op.stay_ids.map((id) => data.stays.find((s) => s.id === id));
        if (stays.some((s) => !s)) { errors.push(`找不到住宿晚次：${op.stay_ids.join(',')}`); break; }
        if (op.place_id && !data.places.some((p) => p.id === op.place_id)) { errors.push(`找不到地点 ${op.place_id}`); break; }
        let bookingId: string | null = null;
        if (op.place_id) {
          // 同一住处的连续晚次共用一条预订；已有则沿用
          const prefix = `bk-${op.place_id.replace(/^pl-/, '')}`;
          const existing = stays.map((s) => s!.booking_id).find((b) => b && (b === prefix || b.startsWith(prefix + '-')));
          bookingId = existing ?? `${prefix}-${stays[0]!.night.slice(5).replace('-', '')}`;
          if (!data.bookings.some((b) => b.id === bookingId)) {
            const nights = stays.map((s) => s!.night.slice(5).replace('-', '/')).join('、');
            data.bookings.push({ id: bookingId, title_zh: `${placeName(data, op.place_id)} ${nights}`, kind: 'lodging', selected: true, required: true, status: 'unknown', owner: null, amount: { currency: data.trip.currency, minor: null }, cancel_by: null });
            touched.add(bookingId);
          }
        }
        for (const s of stays) {
          if (op.place_id && !s!.candidates.includes(op.place_id)) s!.candidates.push(op.place_id);
          s!.selected_place_id = op.place_id;
          s!.booking_id = op.place_id ? bookingId : null;
          touched.add(s!.id);
        }
        break;
      }
      case 'add_activity':
      case 'add_leg': {
        const item = op.type === 'add_activity' ? op.activity : op.leg;
        const all = [...data.activities, ...data.legs, ...data.places, ...data.bookings, ...data.claims, ...data.stays];
        if (!item?.id || all.some((x) => x.id === item.id)) { errors.push(`ID 无效或已存在：${item?.id}`); break; }
        if ('removed' in item && item.removed) { errors.push('不能新增已删除的项目'); break; }
        if (op.type === 'add_activity') data.activities.push(clone(op.activity));
        else data.legs.push(clone(op.leg));
        touched.add(item.id);
        break;
      }
      case 'add_review': {
        if (reviews.some((r) => r.id === op.review.id)) { errors.push(`复核记录 ID 已存在：${op.review.id}`); break; }
        if (!data.claims.some((c) => c.id === op.review.claim_id)) { errors.push(`找不到事实 ${op.review.claim_id}`); break; }
        reviews.push(clone(op.review));
        touched.add(op.review.claim_id);
        break;
      }
      default:
        errors.push(`未知操作 ${(op as { type?: string }).type}`);
    }
  }
  return { data, reviews, errors, touched };
}

function placeName(data: TripData, id: string) { return data.places.find((p) => p.id === id)?.name_zh ?? id; }

/** 浏览器端的快速检查（构建时还有完整 Schema 校验）。 */
export function quickCheck(data: TripData): string[] {
  const errs: string[] = [];
  for (const b of data.bookings) if (b.status === 'booked' && !b.evidence) errs.push(`「${b.title_zh}」标为已订时必须填写依据`);
  for (const s of data.stays) if (s.selected_place_id && !s.candidates.includes(s.selected_place_id)) errs.push(`${s.night} 已选住宿不在候选中`);
  return errs;
}

/** 公开仓库提醒：疑似订单号、邮箱、电话等私密信息。 */
export function privacyWarnings(ops: EditOp[]): string[] {
  const text = JSON.stringify(ops);
  const w: string[] = [];
  if (/[\w.+-]+@[\w-]+\.[\w.]+/.test(text)) w.push('内容中似乎有邮箱地址');
  if (/\+?\d[\d\s-]{9,}\d/.test(text)) w.push('内容中似乎有电话号码或长数字（订单号？）');
  if (/订单号|确认号|confirmation|booking ref|reference/i.test(text)) w.push('内容中提到订单号 / 确认号');
  return w;
}

export function makeEditFile(ops: EditOp[], author: string, baseVersion: string, now = new Date()): EditFile {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const rand = Math.random().toString(36).slice(2, 6);
  return { format: 'roam-edits', schema_version: 1, id: `ed-${stamp.toLowerCase()}-${rand}`, author: author || '匿名', created_at: now.toISOString(), base_version: baseVersion, ops };
}

export const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** 简短的人类可读描述，用于草稿列表。 */
export function describeOp(op: EditOp, data: TripData): string {
  switch (op.type) {
    case 'set': {
      const name = op.entity === 'booking' ? data.bookings.find((b) => b.id === op.id)?.title_zh
        : op.entity === 'activity' ? data.activities.find((a) => a.id === op.id)?.title_zh
        : (() => { const l = data.legs.find((x) => x.id === op.id); return l ? `${placeName(data, l.from_place_id)} → ${placeName(data, l.to_place_id)}` : op.id; })();
      if (op.field === 'removed') return `${op.value ? '删除' : '恢复'}：${name ?? op.id}`;
      const v = typeof op.value === 'object' ? JSON.stringify(op.value) : String(op.value ?? '（清空）');
      return `${name ?? op.id}：${FIELD_LABEL[op.field] ?? op.field} → ${v}`;
    }
    case 'add_place': return `新增地点：${op.place.name_zh}`;
    case 'select_stay': return `${op.stay_ids.length} 晚住宿 → ${op.place_id ? placeName(data, op.place_id) : '未选定'}`;
    case 'add_activity': return `新增活动：${op.activity.date.slice(5).replace('-', '/')} ${op.activity.title_zh}`;
    case 'add_leg': return `新增交通：${op.leg.date.slice(5).replace('-', '/')} ${placeName(data, op.leg.from_place_id)} → ${placeName(data, op.leg.to_place_id)}`;
    case 'add_review': return `登记复核：${data.claims.find((c) => c.id === op.review.claim_id)?.statement_zh ?? op.review.claim_id} → ${op.review.result}`;
  }
}

export const FIELD_LABEL: Record<string, string> = {
  date: '日期', order: '顺序', plan_status: '计划状态', daypart: '时段', time: '时间', notes: '备注', importance: '重要性',
  depart: '出发', arrive: '到达', timing_basis: '时间依据', mode: '交通方式',
  status: '预订状态', title_zh: '名称', title_en: '英文名', kind: '类型', place_id: '地点', removed: '删除', removed_note: '删除原因', owner: '负责人', amount: '金额', cancel_by: '取消截止', evidence: '依据', selected: '已选定', required: '需预订',
};
