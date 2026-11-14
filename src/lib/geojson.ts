// 本地 GeoJSON 导入校验（路线与可达范围）。不做任何网络请求。
export interface GeoCheck { ok: boolean; reliable: boolean; errors: string[]; warnings: string[]; summary: string }

const ALLOWED = new Set(['Point', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon']);
const UK_BOUNDS = { minLng: -9, maxLng: 3, minLat: 49, maxLat: 61 };

function walkCoords(geom: any, f: (lng: number, lat: number) => void) {
  const rec = (c: any) => { if (typeof c[0] === 'number') f(c[0], c[1]); else c.forEach(rec); };
  if (geom?.coordinates) rec(geom.coordinates);
}

export function validateGeoJSON(raw: unknown, kind: 'isochrone' | 'route'): GeoCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const g = raw as any;
  if (!g || g.type !== 'FeatureCollection' || !Array.isArray(g.features)) {
    return { ok: false, reliable: false, errors: ['必须是 GeoJSON FeatureCollection'], warnings, summary: '格式无效' };
  }
  if (g.crs && !/CRS84|4326/.test(JSON.stringify(g.crs))) errors.push('坐标系必须是 WGS84（EPSG:4326 / CRS84）');
  let swapped = 0, outside = 0, total = 0;
  for (const f of g.features) {
    const t = f?.geometry?.type;
    if (!ALLOWED.has(t)) { errors.push(`不支持的几何类型：${t ?? '缺失'}`); continue; }
    if (kind === 'isochrone' && !/Polygon/.test(t)) errors.push('可达范围必须是 Polygon / MultiPolygon');
    if (kind === 'route' && !/LineString/.test(t)) errors.push('路线必须是 LineString / MultiLineString');
    walkCoords(f.geometry, (lng, lat) => {
      total++;
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) errors.push('坐标超出范围');
      const inUk = lng >= UK_BOUNDS.minLng && lng <= UK_BOUNDS.maxLng && lat >= UK_BOUNDS.minLat && lat <= UK_BOUNDS.maxLat;
      const inUkSwapped = lat >= UK_BOUNDS.minLng && lat <= UK_BOUNDS.maxLng && lng >= UK_BOUNDS.minLat && lng <= UK_BOUNDS.maxLat;
      if (!inUk) { outside++; if (inUkSwapped) swapped++; }
    });
  }
  if (swapped > 0) errors.push('坐标顺序疑似写成 [lat, lng]；GeoJSON 要求 [lng, lat]');
  else if (outside > 0) warnings.push(`${outside}/${total} 个坐标点不在英国范围内`);

  const meta = g.roam;
  let reliable = errors.length === 0;
  if (!meta) { reliable = false; warnings.push('缺少 roam 元数据（来源、查询参数、生成时间、许可），仅可作为未核实图层'); }
  else {
    for (const k of ['source', 'generated_at', 'license']) if (!meta[k]) { reliable = false; warnings.push(`缺少 ${k}`); }
    if (kind === 'isochrone') {
      const q = meta.query ?? {};
      for (const k of ['origin_place_id', 'direction', 'mode', 'minutes', 'date', 'time']) if (q[k] === undefined) { reliable = false; warnings.push(`查询参数缺少 ${k}`); }
      if (q.minutes !== undefined && ![15, 30, 45, 60].includes(q.minutes)) { reliable = false; warnings.push('时间预算须为 15/30/45/60 分钟'); }
      if (q.mode && !['walk', 'bike', 'car', 'transit'].includes(q.mode)) { reliable = false; warnings.push(`未知交通方式 ${q.mode}`); }
    }
  }
  const ok = errors.length === 0;
  const summary = !ok ? '无法导入' : reliable ? '已导入范围（参数完整）' : '已导入，但标为未核实';
  return { ok, reliable: ok && reliable, errors: [...new Set(errors)], warnings, summary };
}
