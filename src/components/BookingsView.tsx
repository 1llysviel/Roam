import type { Index } from '../lib/derive';
import { BOOKING_LABEL } from '../lib/derive';
import type { UrlState } from '../lib/url';
import { formatMoney, shortDate } from '../lib/dates';
import Badge, { type Tone } from './Badge';

const TONE: Record<string, Tone> = { booked: 'ok', unknown: 'warn', not_booked: 'bad', cancelled: 'bad', not_required: 'muted' };
const ICON: Record<string, string> = { booked: '✓', unknown: '?', not_booked: '!', cancelled: '✕', not_required: '–' };

export default function BookingsView({ ix, url, nav }: { ix: Index; url: UrlState; nav: (p: Partial<UrlState>, push?: boolean) => void }) {
  const idFilter = url.f?.startsWith('ids:') ? new Set(url.f.slice(4).split(',')) : null;
  const linked = (bid: string) => [
    ...ix.bundle.data.activities.filter((a) => a.booking_ids?.includes(bid)).map((a) => ({ id: a.id, date: a.date, title: a.title_zh })),
    ...ix.bundle.data.legs.filter((l) => l.booking_ids?.includes(bid)).map((l) => ({ id: l.id, date: l.date, title: ix.subjectOf.get(l.id)?.title ?? l.id })),
  ];
  const list = ix.bundle.data.bookings.filter((b) => !idFilter || idFilter.has(b.id));
  const gaps = ix.bundle.data.stays.filter((s) => !s.selected_place_id);
  return (
    <main className="page">
      <header className="page-head">
        <h2>预订待办</h2>
        <p className="muted">只有明确的用户确认或可用预订依据才标「已订」。提到酒店、找到车次、看到余票都不会自动改成已订。</p>
        {idFilter && <p className="filter-chip">已按总览统计筛选 {idFilter.size} 项 <button type="button" className="linklike" onClick={() => nav({ f: null }, false)}>清除</button></p>}
      </header>
      <div className="table-wrap">
        <table className="tbl">
          <thead><tr><th scope="col">事项</th><th scope="col">状态</th><th scope="col">负责人</th><th scope="col">金额</th><th scope="col">取消截止</th><th scope="col">关联</th></tr></thead>
          <tbody>
            {list.map((b) => (
              <tr key={b.id} className={b.selected ? '' : 'is-candidate'}>
                <th scope="row">{b.title_zh}{!b.selected && <span className="muted small">（未选定，不计入完成率）</span>}{!b.required && <span className="muted small">（非必须）</span>}{b.notes && <p className="small muted">{b.notes}</p>}</th>
                <td><Badge tone={TONE[b.status]} icon={ICON[b.status]}>{BOOKING_LABEL[b.status]}</Badge></td>
                <td>{b.owner ?? <span className="muted">未知</span>}</td>
                <td>{formatMoney(b.amount)}</td>
                <td>{b.cancel_by ? shortDate(b.cancel_by) : <span className="muted">未知</span>}</td>
                <td>{linked(b.id).map((x) => <a key={x.id} className="block small" href={`?d=${x.date}`} onClick={(e) => { e.preventDefault(); nav({ v: 'day', d: x.date, f: null }); }}>{shortDate(x.date)} {x.title}</a>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="section-title">住宿空缺（{gaps.length} 晚）</h3>
      {gaps.length === 0 ? <p className="muted">每晚都已选定住宿。</p> : (
        <p className="gap-list">{gaps.map((s) => <a key={s.id} href={`?d=${s.night}`} onClick={(e) => { e.preventDefault(); nav({ v: 'day', d: s.night, f: null }); }}>{shortDate(s.night)} {ix.cityName.get(s.city)}</a>)}</p>
      )}
    </main>
  );
}
