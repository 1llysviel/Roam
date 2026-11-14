import { useEffect, useRef, useState } from 'react';
import type { Map as LMap, LayerGroup } from 'leaflet';
import type { Index } from '../lib/derive';
import type { Leg, Place } from '../lib/model';
import type { ImportedLayer } from './ExtensionsPanel';

const PIN_GLYPH: Record<string, string> = { lodging: '宿', station: '站', airport: '✈', restaurant: '食' };

export interface MapPoint { place: Place; n: number | null }

/** 地图：Leaflet + OSM 标准瓦片（无 key）。地图异步加载，不阻塞行程首屏；底图失败时列表与地址仍可用。 */
export default function MapPane({ ix, points, legs, selected, onSelect, imported }: {
  ix: Index; points: MapPoint[]; legs: Leg[]; selected: string | null; onSelect: (id: string) => void; imported: ImportedLayer[];
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const [tileState, setTileState] = useState<'loading' | 'ok' | 'failed'>('loading');
  const bm = ix.bundle.features.basemap;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import('leaflet');
      await import('leaflet/dist/leaflet.css');
      if (cancelled || !el.current) return;
      L.current = mod;
      const m = mod.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: true });
      m.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
      if (bm.enabled) {
        let ok = 0, bad = 0;
        const tiles = mod.tileLayer(bm.url, { maxZoom: bm.maxZoom, attribution: bm.attribution, crossOrigin: false });
        tiles.on('tileload', () => { ok++; setTileState('ok'); });
        tiles.on('tileerror', () => { bad++; if (bad >= 4 && ok === 0) setTileState('failed'); });
        tiles.addTo(m);
      } else setTileState('failed');
      layer.current = mod.layerGroup().addTo(m);
      m.setView([54.0, -2.5], 6);
      map.current = m;
      setReady(true);
    })().catch(() => setTileState('failed'));
    return () => { cancelled = true; map.current?.remove(); map.current = null; };
  }, [bm.enabled, bm.url, bm.maxZoom, bm.attribution]);

  // 绘制地点、示意连线与导入图层
  useEffect(() => {
    const mod = L.current, m = map.current, g = layer.current;
    if (!ready || !mod || !m || !g) return;
    g.clearLayers();
    const bounds: [number, number][] = [];
    for (const lg of legs) {
      const f = ix.places.get(lg.from_place_id)?.coord, t = ix.places.get(lg.to_place_id)?.coord;
      if (!f || !t) continue;
      const geo = lg.route_precision === 'actual_network' && lg.route_geojson ? ix.bundle.geo[lg.route_geojson] : null;
      if (geo) mod.geoJSON(geo as any, { style: { color: '#a33a22', weight: 4, opacity: 0.85 } }).addTo(g).bindTooltip('实际路网（导入数据）');
      else mod.polyline([[f.lat, f.lng], [t.lat, t.lng]], { color: '#a33a22', weight: 2.5, dashArray: '6 8', opacity: 0.9 })
        .addTo(g).bindTooltip('行程连接示意 · 非真实道路/铁路', { sticky: true });
    }
    for (const { place: p, n } of points) {
      if (!p.coord) continue;
      bounds.push([p.coord.lat, p.coord.lng]);
      const isSel = p.id === selected;
      const icon = mod.divIcon({
        className: '',
        html: `<span class="pin pin-${p.kind}${isSel ? ' is-selected' : ''}">${n ?? PIN_GLYPH[p.kind] ?? '·'}</span>`,
        iconSize: [28, 28], iconAnchor: [14, 14],
      });
      mod.marker([p.coord.lat, p.coord.lng], { icon, keyboard: true, title: p.name_zh, alt: p.name_zh, zIndexOffset: isSel ? 1000 : 0 })
        .addTo(g).on('click', () => onSelect(p.id))
        .bindTooltip(`${p.name_zh}<br><small>${p.name_en}</small>`, { direction: 'top', offset: [0, -12] });
    }
    for (const layerDef of imported) {
      mod.geoJSON(layerDef.geojson as any, { style: { color: '#3d5a80', weight: 1.5, fillOpacity: 0.12, dashArray: layerDef.reliable ? undefined : '4 4' } })
        .addTo(g).bindTooltip(`${layerDef.reliable ? '已导入范围（近似）' : '已导入范围 · 未核实'}：${layerDef.name}`);
    }
    if (bounds.length === 1) m.setView(bounds[0], 14);
    else if (bounds.length > 1) m.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
  }, [ready, points, legs, selected, imported, ix, onSelect]);

  useEffect(() => {
    const m = map.current;
    const p = selected ? ix.places.get(selected) : null;
    if (m && p?.coord) m.setView([p.coord.lat, p.coord.lng], Math.max(m.getZoom(), 14), { animate: !matchMedia('(prefers-reduced-motion: reduce)').matches });
  }, [selected, ix]);

  useEffect(() => {
    const m = map.current;
    if (!m || !el.current) return;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => ro.disconnect();
  }, [ready]);

  const missing = points.filter((p) => !p.place.coord);
  return (
    <section className="mappane" aria-label="地图">
      <div className="map" ref={el} role="application" aria-label="当天地点地图" />
      {tileState === 'failed' && <div className="map-banner" role="status">底图暂不可用（可能被限流或离线）。地点列表、地址与外部导航仍可使用。</div>}
      <div className="map-legend">
        <span><i className="lg-line" aria-hidden="true" />行程连接示意（非真实路线）</span>
        <span><i className="lg-pin" aria-hidden="true">1</i>当天顺序</span>
        <span><i className="lg-pin lg-lodging" aria-hidden="true">宿</i>住宿</span>
        <span className="muted">坐标为初稿，入口位置待人工核对</span>
      </div>
      {missing.length > 0 && (
        <div className="map-missing"><strong>待定位（未上图）：</strong>{missing.map((m) => m.place.name_zh).join('、')}</div>
      )}
    </section>
  );
}
