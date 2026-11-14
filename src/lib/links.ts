// 外部导航入口：只生成跳转链接，不调用任何地图 API。
import type { Leg, Place } from './model';

const q = (p: Place) => (p.coord ? `${p.coord.lat},${p.coord.lng}` : `${p.name_en}${p.address ? ', ' + p.address : ''}`);

export function appleMapsPlace(p: Place): string {
  return p.coord
    ? `https://maps.apple.com/?ll=${p.coord.lat},${p.coord.lng}&q=${encodeURIComponent(p.name_en)}`
    : `https://maps.apple.com/?q=${encodeURIComponent(q(p))}`;
}
export function googleMapsPlace(p: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q(p))}`;
}

const GMODE: Partial<Record<Leg['mode'], string>> = { rail: 'transit', coach: 'transit', bus: 'transit', tube: 'transit', walk: 'walking', taxi: 'driving', car: 'driving', walk_or_taxi: 'walking' };
const AMODE: Partial<Record<Leg['mode'], string>> = { rail: 'r', coach: 'r', bus: 'r', tube: 'r', walk: 'w', walk_or_taxi: 'w', taxi: 'd', car: 'd' };

export function appleMapsLeg(leg: Leg, from: Place, to: Place): string {
  return `https://maps.apple.com/?saddr=${encodeURIComponent(q(from))}&daddr=${encodeURIComponent(q(to))}&dirflg=${AMODE[leg.mode] ?? 'r'}`;
}
export function googleMapsLeg(leg: Leg, from: Place, to: Place): string {
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(q(from))}&destination=${encodeURIComponent(q(to))}&travelmode=${GMODE[leg.mode] ?? 'transit'}`;
}
