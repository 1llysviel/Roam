// 扩展接口。本版只提供关闭实现（DisabledProvider）：不发网络请求、不需要 key、不部署后端。
// 启用任何真实实现前，必须满足：无需账户、无需付费、可合法稳定运行，并在 config/features.json 显式打开。
import type { Features } from '../src/lib/model';

export type Disabled = { status: 'disabled'; reason: string };
export const disabled = (what: string): Disabled => ({ status: 'disabled', reason: `${what}未启用（config/features.json 中为 false）` });

export interface LatLng { lat: number; lng: number }

export interface RouteProvider {
  route(from: LatLng, to: LatLng, mode: 'walk' | 'bike' | 'car' | 'transit', at?: string): Promise<Disabled | { status: 'ok'; geojson: unknown; source: string }>;
}

/** 可达范围查询结构（ReachabilityQuery）。60 分钟表示单程交通预算，不含游览、排队与回程。 */
export interface ReachabilityQuery {
  origin_place_id: string;
  direction: 'depart_from' | 'arrive_at';
  mode: 'walk' | 'bike' | 'car' | 'transit';
  minutes: 15 | 30 | 45 | 60;
  date: string;
  time: string;
  max_walk_min?: number;
  max_transfers?: number;
}
/** 结果结构（GeometryArtifact）。 */
export interface GeometryArtifact {
  geojson: unknown; query: ReachabilityQuery; source: string; generated_at: string;
  data_valid_for?: string; license: string; warnings: string[]; validation: 'unverified' | 'valid' | 'invalid';
}
export interface IsochroneProvider { isochrone(q: ReachabilityQuery): Promise<Disabled | { status: 'ok'; artifact: GeometryArtifact }> }
export interface Geocoder { geocode(query: string): Promise<Disabled | { status: 'ok'; results: Array<LatLng & { label: string }> }> }
export interface FactExtractor { extract(text: string, claimId: string): Promise<Disabled | { status: 'ok'; candidate: string }> }

export const DisabledRouteProvider: RouteProvider = { route: async () => disabled('路线计算') };
export const DisabledIsochroneProvider: IsochroneProvider = { isochrone: async () => disabled('等时圈计算') };
export const DisabledGeocoder: Geocoder = { geocode: async () => disabled('在线地理编码') };
export const DisabledFactExtractor: FactExtractor = { extract: async () => disabled('AI 提取') };

/** 按功能开关选择实现。本版所有开关为 true 时也只返回关闭实现，并提示尚无合规实现。 */
export function providers(f: Pick<Features, 'routeCalculation' | 'isochroneCalculation' | 'onlineGeocoding' | 'aiExtraction' | 'transitRouting'>) {
  const pick = <T>(on: boolean, off: T, what: string): T => {
    if (on) console.warn(`${what}开关已打开，但本版没有符合「免费、无账户」条件的实现，仍使用关闭实现。`);
    return off;
  };
  return {
    route: pick(f.routeCalculation || f.transitRouting, DisabledRouteProvider, '路线计算'),
    isochrone: pick(f.isochroneCalculation, DisabledIsochroneProvider, '等时圈计算'),
    geocoder: pick(f.onlineGeocoding, DisabledGeocoder, '在线地理编码'),
    extractor: pick(f.aiExtraction, DisabledFactExtractor, 'AI 提取'),
  };
}
