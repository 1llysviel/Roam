// 导出：JSON 包、CSV、ICS。导出内容不含底图瓦片、私人订单或凭据（主数据本身不存放这些）。
import type { Bundle } from './model';
import { SCHEMA_VERSION } from './model';
import { addDays } from './dates';

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : Array.isArray(v) ? v.join(' ') : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function toCsv(rows: Record<string, unknown>[], cols: string[]): string {
  return [cols.join(','), ...rows.map((r) => cols.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n';
}

export function activitiesCsv(b: Bundle) {
  const place = new Map(b.data.places.map((p) => [p.id, p]));
  const rows = [
    ...b.data.activities.filter((a) => !a.removed).map((a) => ({ id: a.id, date: a.date, type: 'activity', kind: a.kind, title: a.title_zh, place: a.place_id ? place.get(a.place_id)?.name_en : '', start: a.time?.start ?? '', end: a.time?.end ?? '', time_basis: a.time?.basis ?? '', plan_status: a.plan_status, importance: a.importance })),
    ...b.data.legs.filter((l) => !l.removed).map((l) => ({ id: l.id, date: l.date, type: 'leg', kind: l.mode, title: `${place.get(l.from_place_id)?.name_en} → ${place.get(l.to_place_id)?.name_en}`, place: '', start: l.depart ?? '', end: l.arrive ?? '', time_basis: l.timing_basis ?? '', plan_status: '', importance: l.importance })),
  ].sort((x, y) => (x.date + x.start).localeCompare(y.date + y.start));
  return toCsv(rows, ['id', 'date', 'type', 'kind', 'title', 'place', 'start', 'end', 'time_basis', 'plan_status', 'importance']);
}
export const bookingsCsv = (b: Bundle) =>
  toCsv(b.data.bookings.map((x) => ({ ...x, currency: x.amount.currency, amount_minor: x.amount.minor })), ['id', 'title_zh', 'kind', 'selected', 'required', 'status', 'owner', 'currency', 'amount_minor', 'cancel_by']);
export const claimsCsv = (b: Bundle) =>
  toCsv(b.data.claims as unknown as Record<string, unknown>[], ['id', 'subject_id', 'kind', 'statement_zh', 'target_date', 'direction', 'importance', 'critical', 'applicable', 'source_ids', 'max_age_days']);

const icsText = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
const icsDate = (d: string) => d.replace(/-/g, '');
const icsTime = (d: string, t: string) => `${icsDate(d)}T${t.replace(':', '')}00`;

/** ICS：精确时刻带 TZID=Europe/London；无时刻的项目为全天事件（纯日期，不受客户端时区影响）。 */
export function toIcs(b: Bundle, stamp: string): string {
  const place = new Map(b.data.places.map((p) => [p.id, p]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//roam//trip//ZH', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${icsText(b.data.trip.title_zh)}`];
  const dtstamp = stamp.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ev = (uid: string, date: string, start: string | null, end: string | null, summary: string, loc: string, desc: string) => {
    lines.push('BEGIN:VEVENT', `UID:${uid}@roam`, `DTSTAMP:${dtstamp}`);
    if (start) {
      lines.push(`DTSTART;TZID=Europe/London:${icsTime(date, start)}`);
      if (end) lines.push(`DTEND;TZID=Europe/London:${icsTime(date, end)}`);
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(addDays(date, 1))}`);
    }
    lines.push(`SUMMARY:${icsText(summary)}`);
    if (loc) lines.push(`LOCATION:${icsText(loc)}`);
    lines.push(`DESCRIPTION:${icsText(desc)}`, 'END:VEVENT');
  };
  for (const a of b.data.activities) {
    if (a.plan_status === 'candidate' || a.removed) continue;
    const p = a.place_id ? place.get(a.place_id) : undefined;
    const basis = a.time ? { proposed: '建议时间', user_stated: '用户提供', booked: '已订' }[a.time.basis] : '时间未定';
    ev(a.id, a.date, a.time?.start ?? null, a.time?.end ?? null, a.title_zh, p ? `${p.name_en}${p.address ? ', ' + p.address : ''}` : '', `${basis}；计划状态 ${a.plan_status}`);
  }
  for (const l of b.data.legs) {
    if (l.removed) continue;
    const f = place.get(l.from_place_id)!, t = place.get(l.to_place_id)!;
    ev(l.id, l.date, l.depart, l.arrive, `${f.name_zh} → ${t.name_zh}`, f.address ?? '', `${l.mode}；${l.timing_basis === 'proposed' ? '建议班次，未订' : l.timing_basis ?? '班次未定'}`);
  }
  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export interface ExportPackage {
  format: 'roam-export';
  schema_version: number;
  exported_at: string;
  bundle_version: string;
  license: string;
  data: Bundle['data'];
  sources: Bundle['sources'];
  reviews: Bundle['reviews'];
  checks: Bundle['checks'];
  geo: Bundle['geo'];
}

export function exportPackage(b: Bundle, at: string): ExportPackage {
  return { format: 'roam-export', schema_version: SCHEMA_VERSION, exported_at: at, bundle_version: b.build.version, license: b.license, data: b.data, sources: b.sources, reviews: b.reviews, checks: b.checks, geo: b.geo };
}

export const MIGRATIONS: Record<number, (pkg: any) => any> = {
  // 示例：1: (pkg) => ({ ...pkg, schema_version: 2, data: { ...pkg.data, schema_version: 2 } }),
};

export function migrate(pkg: any): ExportPackage {
  let cur = pkg;
  while (cur.schema_version < SCHEMA_VERSION) {
    const step = MIGRATIONS[cur.schema_version];
    if (!step) throw new Error(`缺少从 schema_version ${cur.schema_version} 的迁移脚本`);
    cur = step(cur);
  }
  if (cur.schema_version > SCHEMA_VERSION) throw new Error(`导出包 schema_version ${cur.schema_version} 高于当前程序 ${SCHEMA_VERSION}`);
  return cur as ExportPackage;
}

export function importPackage(json: string): ExportPackage {
  const pkg = JSON.parse(json);
  if (pkg?.format !== 'roam-export') throw new Error('不是 roam 导出包');
  return migrate(pkg);
}
