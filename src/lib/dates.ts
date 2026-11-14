// 纯日期一律按字符串处理，不经过浏览器时区，避免 2026-12-11 在西半球显示成 12/10。
import type { ISODate } from './model';

const WEEK_ZH = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const WEEK_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function parseISODate(d: ISODate): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  if (!m) throw new Error(`无效日期：${d}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

/** 星期几（0=周日），按日历日期计算，与运行环境时区无关。 */
export function weekday(d: ISODate): number {
  const p = parseISODate(d);
  return new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay();
}

export function weekdayZh(d: ISODate): string { return WEEK_ZH[weekday(d)]; }
export function weekdayEn(d: ISODate): string { return WEEK_EN[weekday(d)]; }

export function addDays(d: ISODate, n: number): ISODate {
  const p = parseISODate(d);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return t.toISOString().slice(0, 10);
}

export function dateRange(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) out.push(d);
  return out;
}

/** 12/25 这样的短格式。 */
export function shortDate(d: ISODate): string {
  const p = parseISODate(d);
  return `${p.m}/${p.d}`;
}

export function longDateZh(d: ISODate): string {
  const p = parseISODate(d);
  return `${p.y}年${p.m}月${p.d}日 ${weekdayZh(d)}`;
}

/** 当前伦敦本地日期（用于判断旅行是否结束、"今天"高亮）。 */
export function londonToday(now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/London', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** 以伦敦时间显示时间戳，如 "11/14 21:40（伦敦）"。 */
export function formatInstantLondon(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '—';
  const s = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Europe/London', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(t);
  return `${s}（伦敦）`;
}

export function daysBetweenInstants(fromIso: string, now: Date): number {
  return (now.getTime() - new Date(fromIso).getTime()) / 86_400_000;
}

/** 金额：整数最小单位 → 显示。未知返回 "未知"。 */
export function formatMoney(amount: { currency: string; minor: number | null }): string {
  if (amount.minor === null) return '未知';
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: amount.currency }).format(amount.minor / 100);
}
