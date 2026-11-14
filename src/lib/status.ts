// 由复核事件、规则结果与时间推导 Claim 的事实状态与新鲜度。抓取状态与事实状态分开。
import type { Claim, ChecksState, FactStatus, Freshness, ReviewEvent, RuleResult, Source } from './model';
import { daysBetweenInstants } from './dates';

export interface ClaimState {
  claim: Claim;
  status: FactStatus;
  method: 'manual' | 'rule' | null;
  confirmed_at: string | null;
  verified_for_date: string | null;
  value: string | null;
  freshness: Freshness;
  date_matches: boolean;
  pending_change: boolean;
  checked: boolean; // 至少检查过一次：有复核事件，或任一来源曾成功抓取
  last_check_at: string | null;
  effective: boolean;
  history: Array<ReviewEvent | RuleResult>;
}

type Decision = { at: string; status: FactStatus; method: 'manual' | 'rule'; date: string | null; value: string | null };

export function deriveClaimState(
  claim: Claim, reviews: ReviewEvent[], checks: ChecksState, sourcesById: Map<string, Source>, now: Date,
): ClaimState {
  const mine = reviews.filter((r) => r.claim_id === claim.id);
  const rules = checks.rule_results.filter((r) => r.claim_id === claim.id && r.matched);
  const decisions: Decision[] = [
    ...mine.map((r) => ({ at: r.at, status: r.result, method: r.method, date: r.verified_for_date ?? null, value: r.value ?? null })),
    ...rules.map((r) => ({ at: r.at, status: 'verified' as FactStatus, method: 'rule' as const, date: r.verified_for_date, value: r.value ?? null })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const latest = decisions.at(-1) ?? null;

  const pending = checks.pending_reviews.some((p) => p.claim_ids.includes(claim.id) && (!latest || p.detected_at > latest.at));
  let status: FactStatus = latest?.status ?? 'unverified';
  if (status === 'verified' && pending) status = 'needs_review';

  const confirmedAt = status === 'verified' ? latest!.at : null;
  const dateMatches = status === 'verified' && latest!.date === claim.target_date;
  let freshness: Freshness = 'none';
  if (confirmedAt) freshness = daysBetweenInstants(confirmedAt, now) <= claim.max_age_days ? 'fresh' : 'stale';

  const sourceStates = claim.source_ids.map((id) => checks.sources[id]).filter(Boolean);
  const lastOk = sourceStates.map((s) => s.last_ok_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
  const lastAttempt = sourceStates.map((s) => s.last_attempt_at).filter((x): x is string => !!x).sort().at(-1) ?? null;
  void sourcesById;

  return {
    claim,
    status,
    method: latest?.method ?? null,
    confirmed_at: confirmedAt,
    verified_for_date: latest?.date ?? null,
    value: latest?.value ?? null,
    freshness,
    date_matches: dateMatches,
    pending_change: pending,
    checked: mine.length > 0 || !!lastOk,
    last_check_at: lastAttempt,
    effective: status === 'verified' && dateMatches && freshness === 'fresh' && !pending,
    history: [...mine, ...checks.rule_results.filter((r) => r.claim_id === claim.id)].sort((a, b) => a.at.localeCompare(b.at)),
  };
}

export const FACT_LABEL: Record<FactStatus, string> = {
  unverified: '未核实', verified: '已核实', needs_review: '待复核', conflict: '冲突', invalid: '无效',
};

/** 面向界面的综合标签（同时用文字与图标表达，不只靠颜色）。 */
export function claimBadge(s: ClaimState): { label: string; tone: 'ok' | 'warn' | 'bad' | 'muted'; icon: string } {
  if (s.status === 'verified' && !s.date_matches) return { label: '日期不符', tone: 'bad', icon: '✕' };
  if (s.status === 'verified' && s.freshness === 'stale') return { label: '已过期', tone: 'warn', icon: '⟳' };
  if (s.status === 'verified') return { label: s.method === 'rule' ? '规则核实' : '已核实', tone: 'ok', icon: '✓' };
  if (s.status === 'conflict') return { label: '冲突', tone: 'bad', icon: '!' };
  if (s.status === 'invalid') return { label: '无效', tone: 'bad', icon: '✕' };
  if (s.status === 'needs_review') return { label: '待复核', tone: 'warn', icon: '?' };
  return { label: '未核实', tone: 'muted', icon: '○' };
}
