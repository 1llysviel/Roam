// 导入与导出：统一入口。导入 → 适配器 → 编辑操作 → 本地草稿；导出 → EXPORTERS（已发布 / 含草稿的当前预览）。
import { useState } from 'react';
import type { Bundle } from '../lib/model';
import type { ChangeState } from '../lib/edits';
import { applyChange, describeOp } from '../lib/edits';
import { EXPORTERS, INBOUND, downloadText, readInbound, type InboundResult } from '../lib/io';
import { useEdit } from '../lib/draft';
import type { ImportedLayer } from './ExtensionsPanel';

export default function TransferPanel({ published, preview, knownEditIds, imported, setImported }: {
  published: Bundle; preview: Bundle; knownEditIds: Set<string>; imported: ImportedLayer[]; setImported: (l: ImportedLayer[]) => void;
}) {
  const { addOps } = useEdit();
  const [res, setRes] = useState<(InboundResult & { file: string }) | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const tripId = published.data.trip.id;
  const base = `${import.meta.env.BASE_URL}exports/`;
  const state: ChangeState = { data: preview.data, reviews: preview.reviews, sources: preview.sources, geo: preview.geo };
  const hasDraft = JSON.stringify(preview.data) !== JSON.stringify(published.data) || preview.reviews.length !== published.reviews.length
    || preview.sources.length !== published.sources.length || Object.keys(preview.geo).length !== Object.keys(published.geo).length;

  // 描述用「应用后」的数据，新地点能显示名称
  const after = res && res.ops.length ? applyChange(state, res.ops).data : preview.data;

  async function onFile(file: File) {
    setDone(null);
    setRes({ ...readInbound(await file.text(), file.name, state, tripId, knownEditIds), file: file.name });
  }

  return (
    <section className="transfer" aria-labelledby="transfer-title">
      <h3 id="transfer-title" className="section-title">导入与导出</h3>
      <p className="muted small">所有需要更新到云端的内容都走同一条路：导入的文件先变成本地草稿，再由草稿栏「提交给同行」生成变更包（<code>data/edits/</code>），构建时统一校验后发布。来源检查结果由定时任务单独写入，不在此列。</p>

      <div className="transfer-grid">
        <div className="transfer-box">
          <h4>导入</h4>
          <p className="small muted">支持：{INBOUND.map((a) => a.label).join('；')}。</p>
          <label className="btn btn-ghost file-btn">选择文件…
            <input type="file" accept=".json,.geojson,application/json,application/geo+json" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
          </label>
          {res && (
            <div className={`import-result${res.errors.length ? ' is-bad' : ''}`} role="status">
              <p><strong>{res.file}</strong> · {res.label}</p>
              {res.errors.map((e) => <p key={e} className="small tone-text-bad">✕ {e}</p>)}
              {res.notes.map((n) => <p key={n} className="small muted">{n}</p>)}
              {res.ops.length > 0 && (
                <>
                  <p className="small">将加入草稿 {res.ops.length} 项操作：</p>
                  <ol className="small op-list">
                    {res.ops.slice(0, 30).map((op, i) => <li key={i}>{describeOp(op, after)}</li>)}
                    {res.ops.length > 30 && <li className="muted">…另 {res.ops.length - 30} 项</li>}
                  </ol>
                  {res.dryRunErrors.length > 0 && <p className="small tone-text-warn">⚠ 试应用时有 {res.dryRunErrors.length} 项会被跳过：{res.dryRunErrors.slice(0, 3).join('；')}</p>}
                  <button type="button" className="btn" onClick={() => { addOps(res.ops); setDone(`已加入本地草稿 ${res.ops.length} 项，可在底部草稿栏查看、撤销或提交。`); setRes(null); }}>加入本地草稿</button>
                </>
              )}
              {res.localOnly && (
                <button type="button" className="btn btn-ghost" onClick={() => {
                  const lo = res.localOnly!;
                  setImported([...imported, { name: lo.name, geojson: lo.geojson, reliable: false, check: lo.check }]);
                  setDone(`已在本设备地图上显示「${lo.name}」（未核实，不共享）。`); setRes(null);
                }}>只在本设备预览</button>
              )}
              <button type="button" className="linklike small" onClick={() => setRes(null)}>取消</button>
            </div>
          )}
          {done && <p className="small" role="status">✓ {done}</p>}
        </div>

        <div className="transfer-box">
          <h4>导出</h4>
          <table className="export-table">
            <thead><tr><th scope="col">格式</th><th scope="col">已发布版本</th><th scope="col">当前预览{hasDraft ? '（含草稿）' : ''}</th></tr></thead>
            <tbody>
              {EXPORTERS.map((e) => (
                <tr key={e.id}>
                  <th scope="row">{e.label}</th>
                  <td><a href={base + e.filename(tripId)} download>下载</a></td>
                  <td><button type="button" className="linklike" onClick={() => downloadText(hasDraft ? e.filename(tripId).replace(/(\.\w+)$/, '-draft$1') : e.filename(tripId), e.render(preview, new Date().toISOString()), e.mime)}>下载</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small muted">导出不含底图瓦片与私人订单；CSV / ICS 不含已删除项目。完整导出包可在另一台设备或新仓库中导入（只合并差异，不会删除）。</p>
        </div>
      </div>
    </section>
  );
}
