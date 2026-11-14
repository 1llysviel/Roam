import type { Index } from '../lib/derive';
import { claimBadge } from '../lib/status';
import { formatInstantLondon, shortDate } from '../lib/dates';
import Badge from './Badge';

const FETCH_LABEL = { ok: '抓取成功', blocked: '被拦截', error: '抓取失败', unsupported: '不支持自动解析' } as const;

/** 来源详情：官方链接、目标日期、证据摘要、检查方式、上次成功检查、事实确认时间与历史。 */
export default function Evidence({ ix, claimIds }: { ix: Index; claimIds: string[] }) {
  if (claimIds.length === 0) return <p className="muted small">此项尚未登记需要核实的事实。</p>;
  return (
    <ul className="evidence">
      {claimIds.map((id) => {
        const s = ix.claimState.get(id);
        if (!s) return null;
        const b = claimBadge(s);
        return (
          <li key={id} className="ev-item" id={`claim-${id}`}>
            <div className="ev-head">
              <Badge tone={b.tone} icon={b.icon}>{b.label}</Badge>
              <span className="ev-statement">{s.claim.statement_zh}</span>
            </div>
            <dl className="ev-meta">
              <div><dt>目标日期</dt><dd>{shortDate(s.claim.target_date)}</dd></div>
              {s.claim.direction && <div><dt>方向</dt><dd>{s.claim.direction}</dd></div>}
              <div><dt>事实确认</dt><dd>{s.confirmed_at ? `${formatInstantLondon(s.confirmed_at)} · ${s.method === 'rule' ? '规则核实' : '人工核实'}` : '尚未确认'}</dd></div>
              {s.value && <div><dt>确认值</dt><dd>{s.value}</dd></div>}
              {s.claim.origin === 'assistant_proposed' && <div><dt>来由</dt><dd>助手建议，非已订班次</dd></div>}
              {s.claim.origin === 'user_stated' && <div><dt>来由</dt><dd>用户提供，未经官方核实</dd></div>}
            </dl>
            <ul className="ev-sources">
              {s.claim.source_ids.map((sid) => {
                const src = ix.sources.get(sid);
                const st = ix.bundle.checks.sources[sid];
                if (!src) return null;
                return (
                  <li key={sid}>
                    {src.url ? <a href={src.url} target="_blank" rel="noopener noreferrer">{src.title} ↗</a> : <span>{src.title}</span>}
                    <span className="muted small">
                      {' · '}{src.fetch === 'auto' ? '每日自动检查' : '人工核实'}
                      {src.lead && ' · 链接为线索，待确认'}
                      {st?.fetch_status && ` · 上次尝试 ${formatInstantLondon(st.last_attempt_at)}（${FETCH_LABEL[st.fetch_status]}）`}
                      {st?.last_ok_at ? ` · 上次成功 ${formatInstantLondon(st.last_ok_at)}` : src.fetch === 'auto' ? ' · 尚无成功检查' : ''}
                    </span>
                    {st?.excerpt?.length ? <blockquote className="excerpt">{st.excerpt.slice(0, 2).join(' / ')}</blockquote> : null}
                  </li>
                );
              })}
            </ul>
            {s.pending_change && <p className="small tone-text-warn">⚠ 来源相关段落有变化，等待维护者复核；确认值未自动更新。</p>}
            {s.history.length > 0 && (
              <details className="ev-history"><summary>历史变化（{s.history.length}）</summary>
                <ol>{s.history.map((h) => <li key={h.id}>{formatInstantLondon(h.at)} · {'result' in h ? `${h.result}（${h.method}）` : `规则 ${h.rule}：${h.matched ? '匹配' : '未匹配'} — ${h.reason}`}</li>)}</ol>
              </details>
            )}
          </li>
        );
      })}
    </ul>
  );
}
