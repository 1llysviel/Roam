import { loadAll } from '../scripts/lib/load';
import type { Bundle, ChecksState, Claim } from '../src/lib/model';

export function realBundle(): Bundle {
  const l = loadAll();
  return { schema_version: 1, build: { version: 'test', built_at: '2026-11-14T00:00:00Z', commit: null }, data: l.data, sources: l.sources, reviews: l.reviews, checks: l.checks, features: l.features, geo: l.geo, license: 'test' };
}
export const emptyChecks = (): ChecksState => ({ schema_version: 1, writer: 'check-sources', last_attempt_at: null, last_success_at: null, last_run_summary: null, sources: {}, pending_reviews: [], rule_results: [], events: [] });
export const claim = (over: Partial<Claim> = {}): Claim => ({ id: 'cl-x', subject_id: 'act-x', kind: 'opening', statement_zh: 'x', target_date: '2026-12-17', importance: 'high', critical: true, source_ids: ['src-a'], max_age_days: 7, ...over });
