// 专用核实规则：只有通过测试、且能匹配目标日期、方向与语义的规则才能自动确认（界面标「规则核实」）。
// 一般网页变化检测不等于事实核实；规则不匹配时什么都不确认。
import type { Claim } from './model';
import { parseISODate, weekdayEn } from './dates';

export interface RuleOutcome { matched: boolean; value?: string; reason: string }
export type Rule = (claim: Claim, blocks: string[]) => RuleOutcome;

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const WEEKDAYS_FULL: Record<string, string> = { Sun: 'sunday', Mon: 'monday', Tue: 'tuesday', Wed: 'wednesday', Thu: 'thursday', Fri: 'friday', Sat: 'saturday' };

/** 构造能匹配目标日期的正则：如 "17 December 2026"、"Thursday 17 December"、"17th Dec"、"December 17, 2026"。 */
export function datePatterns(target: string): RegExp[] {
  const { d, m } = parseISODate(target);
  const mon = MONTHS[m - 1];
  const mon3 = mon.slice(0, 3);
  const day = `0?${d}(?:st|nd|rd|th)?`;
  const mname = `(?:${mon}|${mon3}\\.?)`;
  return [new RegExp(`\\b${day}\\s+${mname}\\b`, 'i'), new RegExp(`\\b${mname}\\s+${day}\\b`, 'i')];
}

/** 块中出现的四位年份（2000–2099）。 */
const yearsIn = (s: string) => [...s.matchAll(/\b(20\d{2})\b/g)].map((x) => Number(x[1]));

function blockMentionsDate(block: string, target: string): boolean {
  const { y } = parseISODate(target);
  if (!datePatterns(target).some((re) => re.test(block))) return false;
  const years = yearsIn(block);
  // 写了年份但不是目标年份 → 视为旧信息，不匹配
  if (years.length > 0 && !years.includes(y)) return false;
  return true;
}

const NEGATIVE = /\b(closed|no service|no services|not running|not operating|cancelled|suspended)\b/i;
const POSITIVE_OPEN = /\b(open|opening|opens)\b/i;

/** 指定日期开放：同一段落中出现目标日期（年份若出现须一致）、出现 open 且未出现 closed 等否定。 */
export const dateExplicitOpen: Rule = (claim, blocks) => {
  for (const b of blocks) {
    if (!blockMentionsDate(b, claim.target_date)) continue;
    if (NEGATIVE.test(b)) return { matched: false, reason: '目标日期段落含关闭/停运字样，需人工复核' };
    if (POSITIVE_OPEN.test(b)) return { matched: true, value: b.slice(0, 200), reason: `段落同时包含目标日期 ${claim.target_date} 与开放字样` };
  }
  return { matched: false, reason: '未找到同时包含目标日期与开放字样的段落' };
};

/** 指定日期、指定方向有班次：claim.direction 形如 "A → B"；段落中 A 必须在 B 之前出现，且含目标日期。 */
export const serviceDirectionDate: Rule = (claim, blocks) => {
  if (!claim.direction || !claim.direction.includes('→')) return { matched: false, reason: 'Claim 缺少单向 direction（A → B）' };
  const [from, to] = claim.direction.split('→').map((s) => s.trim().toLowerCase());
  const key = (s: string) => s.split(/\s+/)[0]; // 用首词匹配，如 "victoria" / "heathrow"
  for (const b of blocks) {
    const low = b.toLowerCase();
    if (!blockMentionsDate(b, claim.target_date)) continue;
    const i = low.indexOf(key(from));
    const j = low.indexOf(key(to));
    if (i < 0 || j < 0) continue;
    if (i > j) return { matched: false, reason: '方向相反（终点先于起点出现），不予确认' };
    if (NEGATIVE.test(b)) return { matched: false, reason: '段落含停运字样，需人工复核' };
    return { matched: true, value: b.slice(0, 200), reason: `段落包含目标日期与方向 ${claim.direction}` };
  }
  return { matched: false, reason: '未找到同时包含目标日期与正确方向的段落' };
};

export const RULES: Record<string, Rule> = {
  'date-explicit-open': dateExplicitOpen,
  'service-direction-date': serviceDirectionDate,
};

export { weekdayEn, WEEKDAYS_FULL };
