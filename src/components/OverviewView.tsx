import type { Index } from '../lib/derive';
import type { UrlState } from '../lib/url';
import { bookingCompletion, coverage, criticalGaps, effectiveRate, legsMissingDuration, ratioText, stayGaps, type Ratio } from '../lib/stats';
import { daysBetweenInstants, formatInstantLondon, shortDate } from '../lib/dates';
import ExtensionsPanel, { type ImportedLayer } from './ExtensionsPanel';
import DisplayToggles from './DisplayToggles';
import TransferPanel from './TransferPanel';
import type { Bundle } from '../lib/model';

function Stat({ label, r, hint, onClick }: { label: string; r: Ratio; hint: string; onClick: () => void }) {
  return (
    <button type="button" className="stat" onClick={onClick} disabled={r.den === 0}>
      <span className="stat-label">{label}</span>
      <span className="stat-value">{ratioText(r)}</span>
      <span className="stat-frac">{r.den === 0 ? '分母为零' : `${r.num} / ${r.den}`}</span>
      <span className="stat-hint">{hint}</span>
    </button>
  );
}

export default function OverviewView({ ix, nav, now, imported, setImported, published, preview, knownEditIds }: {
  ix: Index; nav: (p: Partial<UrlState>, push?: boolean) => void; now: Date; imported: ImportedLayer[]; setImported: (l: ImportedLayer[]) => void;
  published: Bundle; preview: Bundle; knownEditIds: Set<string>; // preview：含草稿、未做软删除派生的原始数据（导出用）
}) {
  const cov = coverage(ix.claimStates);
  const eff = effectiveRate(ix.claimStates);
  const bk = bookingCompletion(ix.bundle.data.bookings);
  const gaps = criticalGaps(ix.claimStates, ix.bundle);
  const noDur = legsMissingDuration(ix.bundle.data.legs);
  const stays = stayGaps(ix.bundle);
  const chk = ix.bundle.checks;
  const lastAttemptAge = chk.last_attempt_at ? daysBetweenInstants(chk.last_attempt_at, now) : null;
  const toClaims = (ids: string[]) => nav({ v: 'claims', f: `ids:${ids.join(',')}` });
  const toBookings = (ids: string[]) => nav({ v: 'bookings', f: `ids:${ids.join(',')}` });
  const claimTitle = (id: string) => ix.claims.get(id)?.statement_zh ?? id;

  return (
    <main className="page">
      <header className="page-head">
        <h2>总览</h2>
        <p className="muted">点击数字查看对应记录。不使用综合评分。</p>
      </header>
      <div className="stats">
        <Stat label="检查覆盖率" r={cov} hint="至少检查过一次的事实 / 适用事实" onClick={() => toClaims(cov.missing.length ? cov.missing : cov.ids)} />
        <Stat label="有效核实率" r={eff} hint="已确认、日期匹配、未过期、无冲突 / 适用事实" onClick={() => toClaims(eff.missing.length ? eff.missing : eff.ids)} />
        <Stat label="预订完成率" r={bk} hint="已选定且必须预订的事项；未知仍算待解决" onClick={() => toBookings(bk.missing.length ? bk.missing : bk.ids)} />
      </div>

      <section className="run-status" aria-label="检查运行状态">
        <p><strong>来源检查：</strong>上次尝试 {formatInstantLondon(chk.last_attempt_at)} · 上次成功 {formatInstantLondon(chk.last_success_at)}</p>
        {chk.last_attempt_at === null && <p className="small tone-text-warn">⚠ 定时检查尚未运行过。已核实的事实仍按确认时间计算是否过期。</p>}
        {lastAttemptAge !== null && lastAttemptAge > 2 && <p className="small tone-text-warn">⚠ 已超过 {Math.floor(lastAttemptAge)} 天没有运行检查（定时任务可能延迟或被停用）。</p>}
        {chk.last_run_summary && <p className="small muted">{chk.last_run_summary}</p>}
      </section>

      <h3 className="section-title">关键交通与固定日期活动</h3>
      <div className="gap-grid">
        <GapBox title="未核实 / 待复核" ids={gaps.unverified} render={claimTitle} onOpen={() => toClaims(gaps.unverified)} />
        <GapBox title="过期或日期不符" ids={gaps.stale} render={claimTitle} onOpen={() => toClaims(gaps.stale)} />
        <GapBox title="冲突 / 无效" ids={gaps.conflict} render={claimTitle} onOpen={() => toClaims(gaps.conflict)} />
        <GapBox title="预订缺口" ids={gaps.bookingGaps} render={(id) => ix.bookings.get(id)?.title_zh ?? id} onOpen={() => toBookings(gaps.bookingGaps)} />
      </div>

      <h3 className="section-title">数据缺项</h3>
      <ul className="plain">
        <li>住宿未选定：{stays.length} 晚{stays.length > 0 && <>（{stays.map((id) => shortDate(ix.bundle.data.stays.find((s) => s.id === id)!.night)).join('、')}）</>}</li>
        <li>交通时长未核实：{noDur.length} / {ix.bundle.data.legs.length} 段 —— 日程总时长因此不完整，未做估算。</li>
        <li>待定位地点：{ix.bundle.data.places.filter((p) => !p.coord).length} 处；坐标为初稿的地点：{ix.bundle.data.places.filter((p) => p.coord_source === 'initial_draft').length} 处。</li>
      </ul>

      <h3 className="section-title">显示设置</h3>
      <p className="muted small">只影响本设备的显示，自动保存在浏览器。</p>
      <DisplayToggles />

      <TransferPanel published={published} preview={preview} knownEditIds={knownEditIds} imported={imported} setImported={setImported} />

      <ExtensionsPanel ix={ix} imported={imported} setImported={setImported} />
    </main>
  );
}

function GapBox({ title, ids, render, onOpen }: { title: string; ids: string[]; render: (id: string) => string; onOpen: () => void }) {
  return (
    <div className="gap-box">
      <button type="button" className="gap-count" onClick={onOpen} disabled={ids.length === 0}>
        <span className="gap-n">{ids.length}</span><span>{title}</span>
      </button>
      {ids.length > 0 && <ul className="small">{ids.slice(0, 4).map((id) => <li key={id}>{render(id)}</li>)}{ids.length > 4 && <li className="muted">…另 {ids.length - 4} 项</li>}</ul>}
    </div>
  );
}
