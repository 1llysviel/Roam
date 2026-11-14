import { useMemo, useState } from 'react';
import type { Index } from '../lib/derive';
import type { UrlState } from '../lib/url';
import { claimBadge } from '../lib/status';
import { shortDate, weekdayZh } from '../lib/dates';
import Evidence from './Evidence';
import Badge from './Badge';

const IMP = { critical: '关键', high: '高', normal: '普通', low: '低' } as const;

export default function ClaimsView({ ix, url, nav }: { ix: Index; url: UrlState; nav: (p: Partial<UrlState>, push?: boolean) => void; now: Date }) {
  const [date, setDate] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState('');
  const [imp, setImp] = useState('');
  const idFilter = url.f?.startsWith('ids:') ? new Set(url.f.slice(4).split(',').filter(Boolean)) : null;

  const cityOfSubject = (subjectId: string) => {
    const a = ix.bundle.data.activities.find((x) => x.id === subjectId);
    if (a?.place_id) return ix.places.get(a.place_id)?.city;
    const l = ix.bundle.data.legs.find((x) => x.id === subjectId);
    return l ? ix.places.get(l.from_place_id)?.city : undefined;
  };

  const rows = useMemo(() => ix.claimStates.filter((s) => {
    if (idFilter && !idFilter.has(s.claim.id)) return false;
    if (date && s.claim.target_date !== date) return false;
    if (city && cityOfSubject(s.claim.subject_id) !== city) return false;
    if (status && claimBadge(s).label !== status) return false;
    if (imp && s.claim.importance !== imp) return false;
    return true;
  }).sort((a, b) => a.claim.target_date.localeCompare(b.claim.target_date)), [ix, date, city, status, imp, idFilter]);

  const labels = [...new Set(ix.claimStates.map((s) => claimBadge(s).label))];
  const chk = ix.bundle.checks;

  return (
    <main className="page">
      <header className="page-head">
        <h2>核实记录</h2>
        <p className="muted">覆盖范围为「已登记的计划相关事项」，不代表穷尽互联网上的所有信息。抓取成功不等于事实已核实。</p>
        <p className="small">来源检查：上次尝试 {chk.last_attempt_at ? new Date(chk.last_attempt_at).toLocaleString('zh-CN', { timeZone: 'Europe/London', hour12: false }) : '尚未运行'} · 上次成功 {chk.last_success_at ? new Date(chk.last_success_at).toLocaleString('zh-CN', { timeZone: 'Europe/London', hour12: false }) : '—'}{chk.last_run_summary ? ` · ${chk.last_run_summary}` : ''}</p>
      </header>
      <div className="filters" role="search">
        {idFilter && <span className="filter-chip">已按总览统计筛选 {idFilter.size} 项 <button type="button" className="linklike" onClick={() => nav({ f: null }, false)}>清除</button></span>}
        <label>日期<select value={date} onChange={(e) => setDate(e.target.value)}><option value="">全部</option>{ix.days.map((d) => <option key={d} value={d}>{shortDate(d)} {weekdayZh(d)}</option>)}</select></label>
        <label>城市<select value={city} onChange={(e) => setCity(e.target.value)}><option value="">全部</option>{ix.bundle.data.trip.cities.map((c) => <option key={c.id} value={c.id}>{c.name_zh}</option>)}</select></label>
        <label>核实状态<select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">全部</option>{labels.map((l) => <option key={l}>{l}</option>)}</select></label>
        <label>重要性<select value={imp} onChange={(e) => setImp(e.target.value)}><option value="">全部</option>{Object.entries(IMP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <span className="muted small">{rows.length} / {ix.claimStates.length} 条</span>
      </div>
      {rows.length === 0 ? <p className="empty">没有符合条件的记录。</p> : (
        <ul className="claim-list">
          {rows.map((s) => {
            const subj = ix.subjectOf.get(s.claim.subject_id);
            const b = claimBadge(s);
            return (
              <li key={s.claim.id} className="claim-row">
                <div className="claim-row-head">
                  <span className="claim-date">{shortDate(s.claim.target_date)}<small>{weekdayZh(s.claim.target_date)}</small></span>
                  <div className="claim-main">
                    <p className="claim-subject">
                      {subj ? <a href={`?d=${subj.date}`} onClick={(e) => { e.preventDefault(); nav({ v: 'day', d: subj.date, f: null }); }}>{subj.title}</a> : s.claim.subject_id}
                      {s.claim.critical && <Badge tone="accent" icon="★">关键</Badge>}
                    </p>
                    <p className="claim-statement">{s.claim.statement_zh}</p>
                  </div>
                  <Badge tone={b.tone} icon={b.icon}>{b.label}</Badge>
                </div>
                <details><summary>来源与历史</summary><Evidence ix={ix} claimIds={[s.claim.id]} /></details>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
