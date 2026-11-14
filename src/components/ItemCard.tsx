import { useState, type ReactElement } from 'react';
import type { DayItem, Index } from '../lib/derive';
import { BASIS_LABEL, BOOKING_LABEL, DAYPART_LABEL, KIND_LABEL, MODE_LABEL, PLAN_LABEL, PRECISION_LABEL } from '../lib/derive';
import { appleMapsLeg, appleMapsPlace, googleMapsLeg, googleMapsPlace } from '../lib/links';
import Badge, { type Tone } from './Badge';
import Evidence from './Evidence';
import { ActivityEditor, LegEditor, RemoveConfirm } from './editors';
import { AddClaimsForm } from './ClaimComposer';
import { useEdit } from '../lib/draft';

const BOOK_TONE: Record<string, Tone> = { booked: 'ok', unknown: 'warn', not_booked: 'bad', cancelled: 'bad', not_required: 'muted' };

function VerifySummary({ ix, ids }: { ix: Index; ids: string[] }) {
  if (!ids.length) return null;
  const st = ids.map((i) => ix.claimState.get(i)!).filter(Boolean);
  const ok = st.filter((s) => s.effective).length;
  const tone: Tone = ok === st.length ? 'ok' : st.some((s) => s.status === 'conflict' || s.status === 'invalid') ? 'bad' : 'muted';
  return <Badge tone={tone} icon={ok === st.length ? '✓' : '○'} title="有效核实的事实数 / 登记事实数">核实 {ok}/{st.length}</Badge>;
}

export default function ItemCard({ ix, item, n, selected, onLocate }: {
  ix: Index; item: DayItem; n: number | null; selected: boolean; onLocate: (placeId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [addingClaims, setAddingClaims] = useState(false);
  const { editMode, touchedDraft, touchedPending, prefs } = useEdit();
  const claimIds = item.type === 'activity' ? item.a.claim_ids ?? [] : item.l.claim_ids ?? [];
  const bookingIds = item.type === 'activity' ? item.a.booking_ids ?? [] : item.l.booking_ids ?? [];
  const importance = item.type === 'activity' ? item.a.importance : item.l.importance;
  const id = item.type === 'activity' ? item.a.id : item.l.id;

  let time: string | null = null, basis: string | null = null, title: string, sub: string | null = null, kind: string;
  let locateId: string | null = null, links: Array<[string, string]> = [];
  let extra: ReactElement | null = null;

  if (item.type === 'activity') {
    const a = item.a;
    const p = a.place_id ? ix.places.get(a.place_id) : undefined;
    time = a.time?.start ?? null;
    if (time && a.time?.end) time += `–${a.time.end}`;
    basis = a.time ? BASIS_LABEL[a.time.basis] : null;
    if (!time && a.daypart) { time = DAYPART_LABEL[a.daypart]; basis = '大致时段'; }
    title = a.title_zh;
    sub = p ? `${p.name_en}${p.address ? ' · ' + p.address : ''}` : a.title_en;
    kind = KIND_LABEL[a.kind];
    if (p?.coord) locateId = p.id;
    if (p) links = [['Apple', appleMapsPlace(p)], ['Google', googleMapsPlace(p)]];
    extra = (
      <>
        {a.plan_status !== 'selected' && <Badge tone={a.plan_status === 'candidate' ? 'info' : 'muted'} icon={a.plan_status === 'candidate' ? '◇' : '✎'}>{PLAN_LABEL[a.plan_status]}</Badge>}
        {a.buffer_min ? <Badge tone="muted" icon="⏱">缓冲 {a.buffer_min} 分</Badge> : null}
        {p && !p.coord && <Badge tone="warn" icon="⌖">待定位</Badge>}
      </>
    );
  } else {
    const l = item.l;
    const f = ix.places.get(l.from_place_id)!, t = ix.places.get(l.to_place_id)!;
    time = l.depart ? `${l.depart}${l.arrive ? '–' + l.arrive : ''}` : null;
    basis = l.timing_basis ? (l.timing_basis === 'proposed' ? '建议班次' : BASIS_LABEL[l.timing_basis]) : null;
    if (!time && l.daypart) { time = DAYPART_LABEL[l.daypart]; basis = '大致时段'; }
    title = `${f.name_zh} → ${t.name_zh}`;
    sub = `${f.name_en} → ${t.name_en}`;
    kind = MODE_LABEL[l.mode];
    if (t.coord) locateId = t.id;
    links = [['Apple', appleMapsLeg(l, f, t)], ['Google', googleMapsLeg(l, f, t)]];
    extra = (
      <>
        <Badge tone={l.route_precision === 'actual_network' ? 'ok' : 'muted'} icon={l.route_precision === 'schematic' ? '┄' : l.route_precision === 'unavailable' ? '∅' : '━'} title="路线精度">{PRECISION_LABEL[l.route_precision]}</Badge>
        <Badge tone={l.duration_min === null ? 'warn' : 'ok'} icon="⏱">{l.duration_min === null ? '时长未核实' : `约 ${l.duration_min} 分（人工核实）`}</Badge>
      </>
    );
  }

  return (
    <article className={`card kind-${item.type}${selected ? ' is-selected' : ''}${importance === 'critical' ? ' is-critical' : ''}`} id={`item-${id}`}>
      <div className="card-time">
        {n !== null && <span className="seq" aria-label={`地图编号 ${n}`}>{n}</span>}
        <span className="t">{time ?? '时间未定'}</span>
        {basis && <span className="t-basis">{basis}</span>}
      </div>
      <div className="card-body">
        <p className="card-kind">{kind}{importance === 'critical' && <strong className="crit"> · 关键</strong>}</p>
        <h3 className="card-title">{title}</h3>
        {sub && prefs.showEnglish && <p className="card-sub">{sub}</p>}
        <div className="badges">
          {bookingIds.map((b) => { const bk = ix.bookings.get(b); return bk ? <Badge key={b} tone={BOOK_TONE[bk.status]} icon={bk.status === 'booked' ? '✓' : bk.status === 'not_required' ? '–' : '!'} title={bk.title_zh}>{BOOKING_LABEL[bk.status]}</Badge> : null; })}
          <VerifySummary ix={ix} ids={claimIds} />
          {extra}
          {touchedDraft.has(id) ? <Badge tone="info" icon="✎">本地草稿</Badge> : touchedPending.has(id) ? <Badge tone="info" icon="↑">已提交待发布</Badge> : null}
        </div>
        {(item.type === 'activity' ? item.a.notes : item.l.notes) && <p className="card-note">{item.type === 'activity' ? item.a.notes : item.l.notes}</p>}
        <div className="card-actions">
          {locateId && <button type="button" className="btn" onClick={() => onLocate(locateId!)}>定位</button>}
          {links.length > 0 && (
            <span className="navlinks" role="group" aria-label={item.type === 'leg' ? '外部地图导航' : '在外部地图打开'}>
              <span className="navlinks-label" aria-hidden="true">{item.type === 'leg' ? '导航' : '地图'}</span>
              {links.map(([label, href]) => <a key={label} className="btn btn-ghost" href={href} target="_blank" rel="noopener noreferrer" aria-label={`${label} 地图${item.type === 'leg' ? '导航' : ''}（新窗口）`}>{label} ↗</a>)}
            </span>
          )}
          {claimIds.length > 0 && <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起来源' : `来源详情 (${claimIds.length})`}</button>}
          {editMode && !editing && !removing && <button type="button" className="btn btn-edit" onClick={() => setEditing(true)}>✎ 修改</button>}
          {editMode && !editing && !removing && !addingClaims && <button type="button" className="btn btn-edit" onClick={() => setAddingClaims(true)}>＋ 核实项</button>}
          {editMode && !editing && !removing && <button type="button" className="btn btn-ghost btn-del" onClick={() => setRemoving(true)} aria-label={`删除 ${title}`}>删除</button>}
        </div>
        {addingClaims && <AddClaimsForm ix={ix} subject={item.type === 'activity' ? { entity: 'activity', item: item.a } : { entity: 'leg', item: item.l }} onDone={() => setAddingClaims(false)} />}
        {removing && <RemoveConfirm entity={item.type} id={id} title={title} onDone={() => setRemoving(false)} />}
        {editing && (item.type === 'activity' ? <ActivityEditor ix={ix} a={item.a} onDone={() => setEditing(false)} /> : <LegEditor l={item.l} onDone={() => setEditing(false)} />)}
        {open && <Evidence ix={ix} claimIds={claimIds} />}
      </div>
    </article>
  );
}
