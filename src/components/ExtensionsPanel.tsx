import { useState } from 'react';
import type { Index } from '../lib/derive';
import { validateGeoJSON, type GeoCheck } from '../lib/geojson';

export interface ImportedLayer { name: string; geojson: unknown; reliable: boolean; check: GeoCheck }

const FLAGS: Array<[keyof Index['bundle']['features'], string]> = [
  ['routeCalculation', '路线计算'], ['isochroneCalculation', '等时圈计算'], ['transitRouting', '公交路由'],
  ['onlineGeocoding', '在线地址搜索'], ['aiExtraction', 'AI 提取'],
];

/** 扩展：接口保留、计算默认关闭。只提供本地 GeoJSON 导入（仅当前设备、不上传）。 */
export default function ExtensionsPanel({ ix, imported, setImported }: { ix: Index; imported: ImportedLayer[]; setImported: (l: ImportedLayer[]) => void }) {
  const [last, setLast] = useState<{ name: string; check: GeoCheck } | null>(null);
  const f = ix.bundle.features;

  async function onFile(file: File) {
    let raw: unknown;
    try { raw = JSON.parse(await file.text()); }
    catch { setLast({ name: file.name, check: { ok: false, reliable: false, errors: ['不是有效的 JSON'], warnings: [], summary: '无法导入' } }); return; }
    const check = validateGeoJSON(raw, 'isochrone');
    setLast({ name: file.name, check });
    if (check.ok) setImported([...imported, { name: file.name, geojson: raw, reliable: check.reliable, check }]);
  }

  return (
    <section className="ext" aria-labelledby="ext-title">
      <h3 id="ext-title" className="section-title">扩展功能</h3>
      <p className="muted small">以下能力只保留接口，默认关闭；关闭时不会产生任何对应网络请求，也不需要账户或密钥。目前没有符合「免费、无账户」条件的实现，所以网页上不提供开启按钮；将来有合规实现后在 <code>config/features.json</code> 开启。</p>
      <ul className="flag-list">
        {FLAGS.map(([k, label]) => <li key={k}><span>{label}</span><span className={`flag ${f[k] ? 'on' : 'off'}`}>{f[k] ? '开启' : '关闭'}</span></li>)}
      </ul>
      <div className="ext-box">
        <p><strong>可达范围暂未启用。</strong>没有真实路网结果时不画圆代替等时圈。</p>
        <label className="btn btn-ghost file-btn">导入本地 GeoJSON（仅当前设备）
          <input type="file" accept=".geojson,.json,application/geo+json,application/json" onChange={(e) => { const file = e.target.files?.[0]; if (file) onFile(file); e.target.value = ''; }} />
        </label>
        {last && (
          <div className={`import-result ${last.check.ok ? '' : 'is-bad'}`} role="status">
            <p><strong>{last.name}：</strong>{last.check.summary}</p>
            {last.check.errors.map((e) => <p key={e} className="small tone-text-bad">✕ {e}</p>)}
            {last.check.warnings.map((w) => <p key={w} className="small tone-text-warn">⚠ {w}</p>)}
          </div>
        )}
        {imported.length > 0 && (
          <ul className="small">
            {imported.map((l, i) => <li key={i}>{l.reliable ? '已导入范围（近似，需点对点核对）' : '已导入 · 未核实'}：{l.name} <button type="button" className="linklike" onClick={() => setImported(imported.filter((_, j) => j !== i))}>移除</button></li>)}
          </ul>
        )}
        <p className="small muted">浏览器临时导入只影响当前设备；提交到仓库 geo/ 并发布后才对同行共享。60 分钟表示单程交通预算，不含游览、排队和回程。</p>
      </div>
    </section>
  );
}
