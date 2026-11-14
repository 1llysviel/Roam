import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateGeoJSON } from '../src/lib/geojson';
import { providers } from '../providers/index';

const poly = (coords: number[][]) => ({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [coords] } });
const ring = [[-0.15, 51.49], [-0.14, 51.49], [-0.14, 51.50], [-0.15, 51.49]];
const meta = { query: { origin_place_id: 'pl-victoria-coach', direction: 'depart_from', mode: 'walk', minutes: 15, date: '2026-12-25', time: '15:00' }, source: 'local test', generated_at: '2026-11-14T00:00:00Z', license: 'CC0' };

test('参数完整的导入范围可标为已导入范围', () => {
  const r = validateGeoJSON({ type: 'FeatureCollection', features: [poly(ring)], roam: meta }, 'isochrone');
  assert.equal(r.ok, true);
  assert.equal(r.reliable, true);
});

test('缺来源或参数 → 只能标为未核实', () => {
  const r = validateGeoJSON({ type: 'FeatureCollection', features: [poly(ring)] }, 'isochrone');
  assert.equal(r.ok, true);
  assert.equal(r.reliable, false);
  const r2 = validateGeoJSON({ type: 'FeatureCollection', features: [poly(ring)], roam: { ...meta, query: { ...meta.query, minutes: 20 } } }, 'isochrone');
  assert.equal(r2.reliable, false);
});

test('坐标顺序写反 [lat,lng] 被拒绝', () => {
  const r = validateGeoJSON({ type: 'FeatureCollection', features: [poly(ring.map(([a, b]) => [b, a]))], roam: meta }, 'isochrone');
  assert.equal(r.ok, false);
});

test('等时圈必须是面要素', () => {
  const r = validateGeoJSON({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: [-0.1, 51.5] } }], roam: meta }, 'isochrone');
  assert.equal(r.ok, false);
});

test('关闭的扩展不产生任何网络请求', async () => {
  const orig = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => { calls++; throw new Error('不应发请求'); }) as typeof fetch;
  const p = providers({ routeCalculation: false, isochroneCalculation: false, onlineGeocoding: false, aiExtraction: false, transitRouting: false });
  const rs = await Promise.all([
    p.route.route({ lat: 51.5, lng: -0.1 }, { lat: 51.47, lng: -0.45 }, 'transit'),
    p.isochrone.isochrone({ origin_place_id: 'x', direction: 'depart_from', mode: 'transit', minutes: 60, date: '2026-12-25', time: '15:00' }),
    p.geocoder.geocode('Victoria Coach Station'),
    p.extractor.extract('text', 'cl-x'),
  ]);
  globalThis.fetch = orig;
  assert.equal(calls, 0);
  for (const r of rs) assert.equal(r.status, 'disabled');
});

test('默认配置中所有扩展开关均为 false', async () => {
  const f = (await import('../config/features.json', { with: { type: 'json' } })).default;
  for (const k of ['routeCalculation', 'isochroneCalculation', 'transitRouting', 'onlineGeocoding', 'aiExtraction']) assert.equal((f as any)[k], false, k);
});
