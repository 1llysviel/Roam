// 将构建包整理成界面需要的索引。纯函数，便于测试。
import type { Activity, Booking, Bundle, Claim, Leg, Place, Source, Stay, TripData } from './model';
import { deriveClaimState, type ClaimState } from './status';
import { dateRange } from './dates';

export type DayItem = { type: 'activity'; order: number; a: Activity } | { type: 'leg'; order: number; l: Leg };

export interface Index {
  bundle: Bundle;
  days: string[];
  places: Map<string, Place>;
  bookings: Map<string, Booking>;
  claims: Map<string, Claim>;
  sources: Map<string, Source>;
  claimStates: ClaimState[];
  claimState: Map<string, ClaimState>;
  cityName: Map<string, string>;
  tripCities: string[];
  itemsByDay: Map<string, DayItem[]>;
  stayByNight: Map<string, Stay>;
  cityOfDay: Map<string, string[]>;
  subjectOf: Map<string, { date: string; title: string }>;
  removedByDay: Map<string, DayItem[]>;
  orphanBookings: Set<string>;
}

/**
 * 统计口径的派生效果（纯函数，不改动原始数据）：
 * - 主体已删除的事实 → applicable: false，excluded: 'removed'；
 * - 主体是「候选」活动的事实 → applicable: false，excluded: 'candidate'（选定后自动计入）；
 * - 只关联到已删除项目、且没有住宿晚次引用的预订 → selected: false（不计入预订完成率）。
 */
export function applyRemovals(data: TripData): { data: TripData; orphanBookings: Set<string> } {
  const removed = new Set([...data.activities, ...data.legs].filter((x) => x.removed).map((x) => x.id));
  const candidates = new Set(data.activities.filter((a) => !a.removed && a.plan_status === 'candidate').map((a) => a.id));
  if (removed.size === 0 && candidates.size === 0) return { data, orphanBookings: new Set() };
  const live = [...data.activities, ...data.legs].filter((x) => !x.removed);
  const liveRefs = new Set([...live.flatMap((x) => x.booking_ids ?? []), ...data.stays.map((s) => s.booking_id).filter(Boolean) as string[]]);
  const deadRefs = new Set([...data.activities, ...data.legs].filter((x) => x.removed).flatMap((x) => x.booking_ids ?? []));
  const orphanBookings = new Set([...deadRefs].filter((b) => !liveRefs.has(b)));
  return {
    orphanBookings,
    data: {
      ...data,
      claims: data.claims.map((c) => (removed.has(c.subject_id) ? { ...c, applicable: false, excluded: 'removed' as const }
        : candidates.has(c.subject_id) ? { ...c, applicable: false, excluded: 'candidate' as const } : c)),
      bookings: data.bookings.map((b) => (orphanBookings.has(b.id) ? { ...b, selected: false } : b)),
    },
  };
}

export function buildIndex(raw: Bundle, now: Date): Index {
  const eff = applyRemovals(raw.data);
  const bundle: Bundle = { ...raw, data: eff.data };
  const d = bundle.data;
  const days = dateRange(d.trip.start_date, d.trip.end_date);
  const places = new Map(d.places.map((p) => [p.id, p]));
  const sources = new Map(bundle.sources.map((s) => [s.id, s]));
  const claimStates = d.claims.map((c) => deriveClaimState(c, bundle.reviews, bundle.checks, sources, now));
  const itemsByDay = new Map<string, DayItem[]>(days.map((x) => [x, []]));
  const removedByDay = new Map<string, DayItem[]>(days.map((x) => [x, []]));
  for (const a of d.activities) (a.removed ? removedByDay : itemsByDay).get(a.date)?.push({ type: 'activity', order: a.order, a });
  for (const l of d.legs) (l.removed ? removedByDay : itemsByDay).get(l.date)?.push({ type: 'leg', order: l.order, l });
  for (const list of [...itemsByDay.values(), ...removedByDay.values()]) list.sort((x, y) => x.order - y.order);

  const stayByNight = new Map(d.stays.map((s) => [s.night, s]));
  // 行程城市 = 有住宿或有活动的城市；只作为交通终点出现的城市（如同行朋友回坎特伯雷）不计入
  const tripCities = new Set<string>(d.stays.map((s) => s.city));
  for (const a of d.activities) if (a.place_id && !a.removed) { const c = places.get(a.place_id)?.city; if (c) tripCities.add(c); }
  const cityOfDay = new Map<string, string[]>();
  for (const day of days) {
    const set: string[] = [];
    const push = (c?: string) => { if (c && tripCities.has(c) && !set.includes(c)) set.push(c); };
    const prevStay = stayByNight.get(dateRangePrev(day));
    push(prevStay?.city);
    for (const it of itemsByDay.get(day) ?? []) {
      if (it.type === 'activity' && it.a.place_id) push(places.get(it.a.place_id)?.city);
      if (it.type === 'leg') { push(places.get(it.l.from_place_id)?.city); push(places.get(it.l.to_place_id)?.city); }
    }
    push(stayByNight.get(day)?.city);
    cityOfDay.set(day, set);
  }
  const subjectOf = new Map<string, { date: string; title: string }>();
  for (const a of d.activities) subjectOf.set(a.id, { date: a.date, title: a.title_zh });
  for (const l of d.legs) subjectOf.set(l.id, { date: l.date, title: `${places.get(l.from_place_id)?.name_zh} → ${places.get(l.to_place_id)?.name_zh}` });

  return {
    bundle, days, places, sources, claimStates,
    bookings: new Map(d.bookings.map((b) => [b.id, b])),
    claims: new Map(d.claims.map((c) => [c.id, c])),
    claimState: new Map(claimStates.map((s) => [s.claim.id, s])),
    cityName: new Map(d.trip.cities.map((c) => [c.id, c.name_zh])),
    itemsByDay, stayByNight, cityOfDay, subjectOf, removedByDay, orphanBookings: eff.orphanBookings,
    tripCities: d.trip.cities.map((c) => c.id).filter((c) => tripCities.has(c)),
  };
}

function dateRangePrev(day: string): string {
  const [y, m, dd] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, dd - 1)).toISOString().slice(0, 10);
}

/** 当天在地图上出现的地点（按出现顺序，去重）。 */
export function dayPlaces(ix: Index, day: string): Place[] {
  const ids: string[] = [];
  const add = (id: string | null | undefined) => { if (id && !ids.includes(id)) ids.push(id); };
  for (const it of ix.itemsByDay.get(day) ?? []) {
    if (it.type === 'activity') add(it.a.place_id);
    else { add(it.l.from_place_id); add(it.l.to_place_id); }
  }
  const stay = ix.stayByNight.get(day);
  add(stay?.selected_place_id);
  stay?.candidates.forEach(add);
  return ids.map((id) => ix.places.get(id)!).filter(Boolean);
}

export const MODE_LABEL: Record<Leg['mode'], string> = {
  rail: '火车', coach: '长途大巴', bus: '公交', tube: '地铁', walk: '步行', taxi: '出租车', walk_or_taxi: '步行或出租车', flight: '航班', car: '自驾',
};
export const KIND_LABEL: Record<Activity['kind'], string> = {
  arrival: '抵达', sight: '景点', meal: '餐饮', lodging: '住宿', free: '自由活动', flight: '航班', other: '其他',
};
export const PLAN_LABEL = { selected: '已选定', candidate: '候选', proposed: '初稿建议' } as const;
export const BASIS_LABEL = { proposed: '建议时间', user_stated: '用户提供', booked: '已订时间' } as const;
export const BOOKING_LABEL: Record<Booking['status'], string> = {
  unknown: '状态未知', not_booked: '未订', booked: '已订', cancelled: '已取消', not_required: '无需预订',
};
export const DAYPART_LABEL = { morning: '上午', afternoon: '下午', evening: '傍晚 / 晚上', all_day: '全天', flexible: '时间灵活' } as const;
export const PRECISION_LABEL = { actual_network: '实际路网', schematic: '连接示意', unavailable: '无法显示' } as const;
