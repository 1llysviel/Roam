import type { Index } from '../lib/derive';
import type { GeoCheck } from '../lib/geojson';
import { geoKind } from '../lib/edits';

export interface ImportedLayer { name: string; geojson: unknown; reliable: boolean; check: GeoCheck }

const FLAGS: Array<[keyof Index['bundle']['features'], string]> = [
  ['routeCalculation', '路线计算'], ['isochroneCalculation', '等时圈计算'], ['transitRouting', '公交路由'],
  ['onlineGeocoding', '在线地址搜索'], ['aiExtraction', 'AI 提取'],
];

/** 扩展：接口保留、计算默认关闭。GeoJSON 的导入统一走「导入与导出」。 */
export default function ExtensionsPanel({ ix, imported, setImported }: { ix: Index; imported: ImportedLayer[]; setImported: (l: ImportedLayer[]) => void }) {
  const f = ix.bundle.features;
  const shared = Object.entries(ix.bundle.geo ?? {});
  return (
    <section className="ext" aria-labelledby="ext-title">
      <h3 id="ext-title" className="section-title">扩展功能</h3>
      <p className="muted small">以下能力只保留接口，默认关闭；关闭时不会产生任何对应网络请求，也不需要账户或密钥。目前没有符合「免费、无账户」条件的实现，所以网页上不提供开启按钮；将来有合规实现后在 <code>config/features.json</code> 开启。</p>
      <ul className="flag-list">
        {FLAGS.map(([k, label]) => <li key={k}><span>{label}</span><span className={`flag ${f[k] ? 'on' : 'off'}`}>{f[k] ? '开启' : '关闭'}</span></li>)}
      </ul>
      <div className="ext-box">
        <p><strong>可达范围暂未启用计算。</strong>没有真实路网结果时不画圆代替等时圈；可以在上方「导入与导出」导入别处生成的 GeoJSON。</p>
        <p className="small">已共享的图层：{shared.length === 0 ? '无' : shared.map(([n, g]) => `${n}（${geoKind(g) === 'isochrone' ? '可达范围' : '路线'}）`).join('、')}</p>
        {imported.length > 0 && (
          <ul className="small">
            {imported.map((l, i) => <li key={i}>仅本设备 · 未核实：{l.name} <button type="button" className="linklike" onClick={() => setImported(imported.filter((_, j) => j !== i))}>移除</button></li>)}
          </ul>
        )}
        <p className="small muted">60 分钟表示单程交通预算，不含游览、排队和回程；圈内结果仍需点对点路线核对。</p>
      </div>
    </section>
  );
}
