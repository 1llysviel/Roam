// 数据模型。YAML 主数据经 schemas/ 校验后由 scripts/build-data.ts 合并为 public/data/roam.json。
export const SCHEMA_VERSION = 1;

export type ISODate = string; // YYYY-MM-DD，按 Europe/London 解释的纯日期
export type HHMM = string; // 24 小时制本地时刻（Europe/London）

export type BookingStatus = 'unknown' | 'not_booked' | 'booked' | 'cancelled' | 'not_required';
export type FetchStatus = 'ok' | 'blocked' | 'error' | 'unsupported';
export type FactStatus = 'unverified' | 'verified' | 'needs_review' | 'conflict' | 'invalid';
export type Freshness = 'fresh' | 'stale' | 'none';
export type RoutePrecision = 'actual_network' | 'schematic' | 'unavailable';
export type PlanStatus = 'selected' | 'candidate' | 'proposed';
export type TimeBasis = 'proposed' | 'user_stated' | 'booked';
export type Importance = 'critical' | 'high' | 'normal' | 'low';
export type CoordSource = 'manual_verified' | 'initial_draft' | 'imported' | 'none';

export interface City { id: string; name_zh: string; name_en: string }

export interface Trip {
  id: string;
  title_zh: string;
  title_en: string;
  start_date: ISODate;
  end_date: ISODate;
  timezone: 'Europe/London';
  currency: string;
  draft_notice?: string;
  cities: City[];
}

export interface Place {
  id: string;
  name_zh: string;
  name_en: string;
  kind: 'airport' | 'station' | 'sight' | 'lodging' | 'restaurant' | 'other';
  city: string;
  address: string | null;
  coord: { lat: number; lng: number } | null;
  coord_source: CoordSource;
  coord_precision: 'entrance' | 'building' | 'landmark_approx' | 'none';
}

export interface Stay {
  id: string;
  night: ISODate;
  city: string;
  candidates: string[];
  selected_place_id: string | null;
  booking_id: string | null;
  selection_basis?: string;
}

export interface Activity {
  id: string;
  date: ISODate;
  order: number;
  kind: 'arrival' | 'sight' | 'meal' | 'lodging' | 'free' | 'flight' | 'other';
  title_zh: string;
  title_en: string;
  place_id: string | null;
  time: { start: HHMM | null; end: HHMM | null; basis: TimeBasis } | null;
  buffer_min?: number;
  importance: Importance;
  plan_status: PlanStatus;
  alternative_to?: string;
  booking_ids?: string[];
  claim_ids?: string[];
  notes?: string;
}

export interface Leg {
  id: string;
  date: ISODate;
  order: number;
  mode: 'rail' | 'coach' | 'bus' | 'tube' | 'walk' | 'taxi' | 'walk_or_taxi' | 'flight' | 'car';
  from_place_id: string;
  to_place_id: string;
  depart: HHMM | null;
  arrive: HHMM | null;
  timing_basis: TimeBasis | null;
  duration_min: number | null;
  route_precision: RoutePrecision;
  route_geojson?: string; // geo/ 下的文件名，来源与许可须在文件 properties 中声明
  importance: Importance;
  booking_ids?: string[];
  claim_ids?: string[];
  notes?: string;
}

export interface Booking {
  id: string;
  title_zh: string;
  kind: string;
  selected: boolean;
  required: boolean;
  status: BookingStatus;
  owner: string | null;
  amount: { currency: string; minor: number | null };
  cancel_by: ISODate | null;
  reference_public?: boolean;
  notes?: string;
}

export interface Claim {
  id: string;
  subject_id: string;
  kind: string;
  statement_zh: string;
  target_date: ISODate;
  direction?: string;
  importance: Importance;
  critical: boolean;
  applicable?: boolean;
  source_ids: string[];
  max_age_days: number;
  check_rule?: string | null;
  origin?: 'user_stated' | 'assistant_proposed';
}

export interface Source {
  id: string;
  kind: 'official' | 'user_statement' | 'third_party';
  title: string;
  url: string | null;
  publisher: string;
  fetch: 'auto' | 'manual';
  lead: boolean;
  keywords: string[];
  notes?: string;
}

export interface ReviewEvent {
  id: string;
  claim_id: string;
  at: string; // ISO 时间戳（含时区）
  reviewer: string;
  result: Exclude<FactStatus, 'unverified'>;
  verified_for_date?: ISODate;
  value?: string;
  source_id?: string;
  evidence?: string;
  method: 'manual' | 'rule';
}

export interface CheckEvent {
  id: string;
  source_id: string;
  at: string;
  fetch_status: FetchStatus;
  http_status: number | null;
  changed: boolean;
  hash: string | null;
  note?: string;
}

export interface SourceState {
  last_attempt_at: string | null;
  last_ok_at: string | null;
  fetch_status: FetchStatus | null;
  http_status: number | null;
  etag?: string | null;
  last_modified?: string | null;
  hash: string | null;
  excerpt: string[];
  note?: string;
}

export interface PendingReview {
  id: string;
  source_id: string;
  claim_ids: string[];
  detected_at: string;
  old_hash: string | null;
  new_hash: string;
  excerpt: string[];
}

export interface RuleResult {
  id: string;
  claim_id: string;
  rule: string;
  at: string;
  matched: boolean;
  verified_for_date: ISODate;
  value?: string;
  reason: string;
  source_id: string;
}

export interface ChecksState {
  schema_version: number;
  writer: string;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_run_summary: string | null;
  sources: Record<string, SourceState>;
  pending_reviews: PendingReview[];
  rule_results: RuleResult[];
  events: CheckEvent[];
}

export interface TripData {
  schema_version: number;
  trip: Trip;
  places: Place[];
  stays: Stay[];
  activities: Activity[];
  legs: Leg[];
  bookings: Booking[];
  claims: Claim[];
}

export interface Features {
  routeCalculation: boolean;
  isochroneCalculation: boolean;
  transitRouting: boolean;
  onlineGeocoding: boolean;
  aiExtraction: boolean;
  basemap: { enabled: boolean; name: string; url: string; attribution: string; maxZoom: number };
  sourceChecks: {
    perDomainDelayMs: number; timeoutMs: number; retries: number;
    maxEvents: number; excerptMaxChars: number; excerptMaxBlocks: number;
  };
}

/** 构建产物：前端读取的唯一数据文件。 */
export interface Bundle {
  schema_version: number;
  build: { version: string; built_at: string; commit: string | null };
  data: TripData;
  sources: Source[];
  reviews: ReviewEvent[];
  checks: ChecksState;
  features: Features;
  geo: Record<string, unknown>; // 已审核的 GeoJSON（路线、导入范围），键为文件名
  license: string;
}
