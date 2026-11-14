import type { Booking, Bundle, Leg } from './model';
import type { ClaimState } from './status';

export interface Ratio { num: number; den: number; ids: string[]; missing: string[] }
export const ratioText = (r: Ratio) => (r.den === 0 ? '不适用' : `${Math.round((r.num / r.den) * 100)}%`);

export function coverage(states: ClaimState[]): Ratio {
  const app = states.filter((s) => s.claim.applicable !== false);
  const hit = app.filter((s) => s.checked);
  return { num: hit.length, den: app.length, ids: hit.map((s) => s.claim.id), missing: app.filter((s) => !s.checked).map((s) => s.claim.id) };
}

export function effectiveRate(states: ClaimState[]): Ratio {
  const app = states.filter((s) => s.claim.applicable !== false);
  const hit = app.filter((s) => s.effective);
  return { num: hit.length, den: app.length, ids: hit.map((s) => s.claim.id), missing: app.filter((s) => !s.effective).map((s) => s.claim.id) };
}

/** 预订完成率：仅已选定且必须预订的事项；unknown 仍算待解决；候选不计入。 */
export function bookingCompletion(bookings: Booking[]): Ratio {
  const scope = bookings.filter((b) => b.selected && b.required && b.status !== 'not_required');
  const done = scope.filter((b) => b.status === 'booked');
  return { num: done.length, den: scope.length, ids: done.map((b) => b.id), missing: scope.filter((b) => b.status !== 'booked').map((b) => b.id) };
}

export interface CriticalGaps { unverified: string[]; stale: string[]; conflict: string[]; bookingGaps: string[] }

export function criticalGaps(states: ClaimState[], bundle: Bundle): CriticalGaps {
  const crit = states.filter((s) => s.claim.critical && s.claim.applicable !== false);
  const critSubjects = new Set(crit.map((s) => s.claim.subject_id));
  const linkedBookings = new Set<string>();
  for (const a of bundle.data.activities) if (a.importance === 'critical' || critSubjects.has(a.id)) a.booking_ids?.forEach((b) => linkedBookings.add(b));
  for (const l of bundle.data.legs) if (l.importance === 'critical' || critSubjects.has(l.id)) l.booking_ids?.forEach((b) => linkedBookings.add(b));
  return {
    unverified: crit.filter((s) => s.status === 'unverified' || s.status === 'needs_review').map((s) => s.claim.id),
    stale: crit.filter((s) => s.status === 'verified' && (s.freshness === 'stale' || !s.date_matches)).map((s) => s.claim.id),
    conflict: crit.filter((s) => s.status === 'conflict' || s.status === 'invalid').map((s) => s.claim.id),
    bookingGaps: bundle.data.bookings.filter((b) => linkedBookings.has(b.id) && b.required && b.status !== 'booked' && b.status !== 'not_required').map((b) => b.id),
  };
}

/** 交通时长缺项：没有人工核实时长的交通段。 */
export function legsMissingDuration(legs: Leg[]): string[] {
  return legs.filter((l) => l.duration_min === null).map((l) => l.id);
}

export function stayGaps(bundle: Bundle): string[] {
  return bundle.data.stays.filter((s) => !s.selected_place_id).map((s) => s.id);
}
