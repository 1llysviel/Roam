// 编辑表单：只产生白名单内的编辑操作，写入本地草稿。
import { useMemo, useState } from 'react';
import type { Activity, Booking, Claim, Leg, Place, Stay, TripData } from '../lib/model';
import { composeClaimOps, type SourceChoice, type TemplateSubject } from '../lib/templates';
import { ClaimDraftList, SourcePicker, useClaimDrafts } from './ClaimComposer';
import type { Index } from '../lib/derive';
import { BOOKING_LABEL, DAYPART_LABEL, MODE_LABEL, PLAN_LABEL } from '../lib/derive';
import { newId, type EditOp } from '../lib/edits';
import { useEdit } from '../lib/draft';
import { shortDate, weekdayZh } from '../lib/dates';

/** 只为变化的字段生成 set 操作。 */
function diffOps(entity: 'activity' | 'leg' | 'booking', id: string, before: Record<string, unknown>, after: Record<string, unknown>): EditOp[] {
  const ops: EditOp[] = [];
  for (const [k, v] of Object.entries(after)) {
    if (JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null)) ops.push({ type: 'set', entity, id, field: k, value: v ?? undefined });
  }
  return ops;
}

function Actions({ onSave, onCancel, disabled, hint }: { onSave: () => void; onCancel: () => void; disabled?: boolean; hint?: string }) {
  return (
    <div className="ed-actions">
      <button type="button" className="btn" onClick={onSave} disabled={disabled}>存入草稿</button>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>取消</button>
      {hint && <span className="small tone-text-warn">{hint}</span>}
    </div>
  );
}

const hhmm = (v: string) => (v ? v : null);

export function ActivityEditor({ ix, a, onDone }: { ix: Index; a: Activity; onDone: () => void }) {
  const { addOps } = useEdit();
  const [f, setF] = useState({
    title_zh: a.title_zh, title_en: a.title_en,
    date: a.date, plan_status: a.plan_status, daypart: a.daypart ?? '', start: a.time?.start ?? '', end: a.time?.end ?? '',
    basis: a.time?.basis ?? 'proposed', notes: a.notes ?? '', importance: a.importance,
  });
  const save = () => {
    const time = f.start ? { start: f.start, end: hhmm(f.end), basis: f.basis } : null;
    const ops = diffOps('activity', a.id,
      { title_zh: a.title_zh, title_en: a.title_en, date: a.date, plan_status: a.plan_status, daypart: a.daypart, time: a.time, notes: a.notes, importance: a.importance },
      { title_zh: f.title_zh.trim() || a.title_zh, title_en: f.title_en.trim() || a.title_en, date: f.date, plan_status: f.plan_status, daypart: f.daypart || undefined, time, notes: f.notes || undefined, importance: f.importance });
    if (ops.length) addOps(ops);
    onDone();
  };
  const bookedBlocked = f.basis === 'booked' && !(a.booking_ids ?? []).some((b) => ix.bookings.get(b)?.status === 'booked');
  return (
    <div className="editor" role="group" aria-label={`编辑 ${a.title_zh}`}>
      <div className="ed-grid">
        <label className="ed-wide">名称<input value={f.title_zh} onChange={(e) => setF({ ...f, title_zh: e.target.value })} maxLength={80} /></label>
        <label className="ed-wide">英文名<input value={f.title_en} onChange={(e) => setF({ ...f, title_en: e.target.value })} maxLength={80} /></label>
        <label>日期<select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>{ix.days.map((d) => <option key={d} value={d}>{shortDate(d)} {weekdayZh(d)}</option>)}</select></label>
        <label>计划状态<select value={f.plan_status} onChange={(e) => setF({ ...f, plan_status: e.target.value as Activity['plan_status'] })}>{Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>时段<select value={f.daypart} onChange={(e) => setF({ ...f, daypart: e.target.value })}><option value="">未指定</option>{Object.entries(DAYPART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>重要性<select value={f.importance} onChange={(e) => setF({ ...f, importance: e.target.value as Activity['importance'] })}><option value="critical">关键</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
        <label>开始<input type="time" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
        <label>结束<input type="time" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} disabled={!f.start} /></label>
        <label>时间依据<select value={f.basis} onChange={(e) => setF({ ...f, basis: e.target.value as 'proposed' })} disabled={!f.start}><option value="proposed">建议</option><option value="user_stated">同行提供</option><option value="booked">已订</option></select></label>
      </div>
      <label className="ed-wide">备注<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <Actions onSave={save} onCancel={onDone} disabled={bookedBlocked} hint={bookedBlocked ? '「已订」时间需要关联预订先标为已订' : undefined} />
    </div>
  );
}

export function LegEditor({ l, onDone }: { l: Leg; onDone: () => void }) {
  const { addOps } = useEdit();
  const [f, setF] = useState({ depart: l.depart ?? '', arrive: l.arrive ?? '', timing_basis: l.timing_basis ?? '', daypart: l.daypart ?? '', mode: l.mode, notes: l.notes ?? '' });
  const save = () => {
    const ops = diffOps('leg', l.id,
      { depart: l.depart, arrive: l.arrive, timing_basis: l.timing_basis, daypart: l.daypart, mode: l.mode, notes: l.notes },
      { depart: hhmm(f.depart), arrive: hhmm(f.arrive), timing_basis: f.timing_basis || null, daypart: f.daypart || undefined, mode: f.mode, notes: f.notes || undefined });
    if (ops.length) addOps(ops);
    onDone();
  };
  return (
    <div className="editor" role="group" aria-label="编辑交通段">
      <div className="ed-grid">
        <label>交通方式<select value={f.mode} onChange={(e) => setF({ ...f, mode: e.target.value as Leg['mode'] })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>出发<input type="time" value={f.depart} onChange={(e) => setF({ ...f, depart: e.target.value })} /></label>
        <label>到达<input type="time" value={f.arrive} onChange={(e) => setF({ ...f, arrive: e.target.value })} /></label>
        <label>班次依据<select value={f.timing_basis} onChange={(e) => setF({ ...f, timing_basis: e.target.value })}><option value="">未定</option><option value="proposed">建议</option><option value="user_stated">同行提供</option><option value="booked">已订</option></select></label>
        <label>时段<select value={f.daypart} onChange={(e) => setF({ ...f, daypart: e.target.value })}><option value="">未指定</option>{Object.entries(DAYPART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
      </div>
      <label className="ed-wide">备注<textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
      <p className="small muted">时长只记录人工核实过的数值，请在「核实」中登记；这里不提供估算。</p>
      <Actions onSave={save} onCancel={onDone} />
    </div>
  );
}

/** 同城连续晚次（包含当前晚）。 */
function runOfNights(ix: Index, stay: Stay): Stay[] {
  const all = ix.bundle.data.stays;
  const i = all.findIndex((s) => s.id === stay.id);
  let a = i, b = i;
  while (a > 0 && all[a - 1].city === stay.city) a--;
  while (b < all.length - 1 && all[b + 1].city === stay.city) b++;
  return all.slice(a, b + 1);
}

export function StayEditor({ ix, stay, onDone }: { ix: Index; stay: Stay; onDone: () => void }) {
  const { addOps } = useEdit();
  const run = runOfNights(ix, stay);
  // 同城的真实住处（排除「未选定」占位）+ 本晚候选
  const options = ix.bundle.data.places.filter((p) => stay.candidates.includes(p.id) || (p.kind === 'lodging' && p.city === stay.city && !/未选定/.test(p.name_zh)));
  const [choice, setChoice] = useState<string>(stay.selected_place_id ?? '');
  const [nights, setNights] = useState<string[]>(run.filter((s) => s.selected_place_id === stay.selected_place_id || !s.selected_place_id).map((s) => s.id));
  const [nw, setNw] = useState({ name_zh: '', name_en: '', address: '' });
  const isNew = choice === '__new';
  const save = () => {
    const ops: EditOp[] = [];
    let placeId: string | null = choice || null;
    if (isNew) {
      placeId = newId('pl-stay');
      const place: Place = { id: placeId, name_zh: nw.name_zh.trim(), name_en: nw.name_en.trim() || nw.name_zh.trim(), kind: 'lodging', city: stay.city, address: nw.address.trim() || null, coord: null, coord_source: 'none', coord_precision: 'none' };
      ops.push({ type: 'add_place', place });
    }
    ops.push({ type: 'select_stay', stay_ids: nights, place_id: placeId });
    addOps(ops);
    onDone();
  };
  return (
    <div className="editor" role="group" aria-label="选择住宿">
      <label className="ed-wide">住处
        <select value={choice} onChange={(e) => setChoice(e.target.value)}>
          <option value="">未选定</option>
          {options.map((p) => <option key={p.id} value={p.id}>{p.name_zh}</option>)}
          <option value="__new">＋ 新增住处…</option>
        </select>
      </label>
      {isNew && (
        <div className="ed-grid">
          <label>中文名<input value={nw.name_zh} onChange={(e) => setNw({ ...nw, name_zh: e.target.value })} placeholder="例如：约克某酒店" /></label>
          <label>英文名<input value={nw.name_en} onChange={(e) => setNw({ ...nw, name_en: e.target.value })} /></label>
          <label className="ed-wide">地址（可选）<input value={nw.address} onChange={(e) => setNw({ ...nw, address: e.target.value })} /></label>
          <p className="small muted ed-wide">新住处没有坐标，会进入「待定位」列表；坐标须人工核对后由维护者补录。</p>
        </div>
      )}
      <fieldset className="ed-nights">
        <legend className="small">应用到这些晚上</legend>
        {run.map((s) => (
          <label key={s.id} className="check"><input type="checkbox" checked={nights.includes(s.id)} onChange={(e) => setNights(e.target.checked ? [...nights, s.id] : nights.filter((x) => x !== s.id))} />{shortDate(s.night)} {weekdayZh(s.night)}</label>
        ))}
      </fieldset>
      <p className="small muted">选定住处 ≠ 已订。会自动建一条「状态未知」的住宿预订，到「预订」里更新。</p>
      <Actions onSave={save} onCancel={onDone} disabled={nights.length === 0 || (isNew && !nw.name_zh.trim())} />
    </div>
  );
}

export function BookingEditor({ b, onDone }: { b: Booking; onDone: () => void }) {
  const { addOps } = useEdit();
  const [f, setF] = useState({
    status: b.status, owner: b.owner ?? '', amount: b.amount.minor === null ? '' : (b.amount.minor / 100).toFixed(2),
    cancel_by: b.cancel_by ?? '', evidence: b.evidence ?? '', notes: b.notes ?? '', selected: b.selected, required: b.required,
  });
  const amountOk = f.amount === '' || /^\d+(\.\d{1,2})?$/.test(f.amount);
  const needEvidence = f.status === 'booked' && !f.evidence.trim();
  const save = () => {
    const minor = f.amount === '' ? null : Math.round(Number(f.amount) * 100);
    const ops = diffOps('booking', b.id,
      { status: b.status, owner: b.owner, amount: b.amount, cancel_by: b.cancel_by, evidence: b.evidence, notes: b.notes, selected: b.selected, required: b.required },
      { status: f.status, owner: f.owner.trim() || null, amount: { currency: b.amount.currency, minor }, cancel_by: f.cancel_by || null, evidence: f.evidence.trim() || undefined, notes: f.notes.trim() || undefined, selected: f.selected, required: f.required });
    if (ops.length) addOps(ops);
    onDone();
  };
  return (
    <div className="editor" role="group" aria-label={`编辑 ${b.title_zh}`}>
      <div className="ed-grid">
        <label>状态<select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as Booking['status'] })}>{Object.entries(BOOKING_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label>负责人<input value={f.owner} onChange={(e) => setF({ ...f, owner: e.target.value })} maxLength={40} /></label>
        <label>金额（{b.amount.currency}）<input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="未知" aria-invalid={!amountOk} /></label>
        <label>取消截止<input type="date" value={f.cancel_by} onChange={(e) => setF({ ...f, cancel_by: e.target.value })} /></label>
        <label className="check"><input type="checkbox" checked={f.selected} onChange={(e) => setF({ ...f, selected: e.target.checked })} />已选定</label>
        <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />需要预订</label>
      </div>
      <label className="ed-wide"><span>依据{f.status === 'booked' && <strong className="tone-text-bad"> *</strong>}</span><input value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} maxLength={300} placeholder="例如：小林 11/20 在群里确认已付款（不要写订单号）" /></label>
      <label className="ed-wide">备注<input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} maxLength={300} /></label>
      <Actions onSave={save} onCancel={onDone} disabled={!amountOk || needEvidence} hint={needEvidence ? '标为已订必须写依据' : !amountOk ? '金额格式如 129.50' : undefined} />
    </div>
  );
}

export function ReviewForm({ ix, claim, onDone }: { ix: Index; claim: Claim; onDone: () => void }) {
  const { addOps, author, setAuthor } = useEdit();
  const [f, setF] = useState({ result: 'verified', date: claim.target_date, value: '', source_id: claim.source_ids[0] ?? '', evidence: '' });
  const missing = f.result === 'verified' && (!f.source_id || !f.date);
  const save = () => {
    addOps([{ type: 'add_review', review: {
      id: newId('rv'), claim_id: claim.id, at: new Date().toISOString(), reviewer: author.trim() || '匿名',
      result: f.result as 'verified', verified_for_date: f.date || undefined, value: f.value.trim() || undefined,
      source_id: f.source_id || undefined, evidence: f.evidence.trim() || undefined, method: 'manual',
    } }]);
    onDone();
  };
  return (
    <div className="editor" role="group" aria-label="登记复核">
      <div className="ed-grid">
        <label>结论<select value={f.result} onChange={(e) => setF({ ...f, result: e.target.value })}><option value="verified">已核实</option><option value="needs_review">待复核</option><option value="conflict">冲突</option><option value="invalid">无效 / 不再适用</option></select></label>
        <label>核实对应日期<select value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })}>{ix.days.map((d) => <option key={d} value={d}>{shortDate(d)} {weekdayZh(d)}{d === claim.target_date ? '（目标）' : ''}</option>)}</select></label>
        <label>依据来源<select value={f.source_id} onChange={(e) => setF({ ...f, source_id: e.target.value })}>{claim.source_ids.map((s) => <option key={s} value={s}>{ix.sources.get(s)?.title ?? s}</option>)}</select></label>
        <label>核实人<input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={60} /></label>
      </div>
      <label className="ed-wide">确认值<input value={f.value} onChange={(e) => setF({ ...f, value: e.target.value })} placeholder="例如：12/18 夜场 16:30–20:00" maxLength={200} /></label>
      <label className="ed-wide">证据摘要<textarea rows={2} value={f.evidence} onChange={(e) => setF({ ...f, evidence: e.target.value })} maxLength={600} placeholder="在哪个页面、用什么查询条件、何时看到的" /></label>
      {f.date !== claim.target_date && f.result === 'verified' && <p className="small tone-text-warn">⚠ 核实日期与目标日期不同，不会计入有效核实。</p>}
      <Actions onSave={save} onCancel={onDone} disabled={missing} />
    </div>
  );
}

// ───────────── 新增与删除 ─────────────

const KIND_OPTIONS: Array<[Activity['kind'], string]> = [['sight', '景点'], ['meal', '餐饮'], ['lodging', '住宿'], ['free', '自由活动'], ['arrival', '抵达'], ['flight', '航班'], ['other', '其他']];
const PLACE_KIND_FOR: Record<Activity['kind'], Place['kind']> = { sight: 'sight', meal: 'restaurant', lodging: 'lodging', free: 'other', arrival: 'other', flight: 'airport', other: 'other' };

/** 计算插入位置的 order：放在 afterId 之后（null = 当天最前）。 */
export function orderAfter(ix: Index, day: string, afterId: string | null): number {
  const items = ix.itemsByDay.get(day) ?? [];
  const orders = items.map((it) => it.order);
  if (afterId === null) return orders.length ? Math.min(0, orders[0]) - 10 : 10;
  const i = items.findIndex((it) => (it.type === 'activity' ? it.a.id : it.l.id) === afterId);
  if (i < 0) return (orders.at(-1) ?? 0) + 10;
  const prev = orders[i];
  const next = orders[i + 1];
  return next === undefined ? prev + 10 : Math.floor((prev + next) / 2) === prev ? prev : Math.floor((prev + next) / 2);
}

interface NewPlace { name_zh: string; name_en: string; city: string; address: string }

/** 地点选择：已有地点（当天城市优先）/ 新地点 / 无。 */
function PlacePicker({ ix, day, value, onChange, newPlace, setNewPlace, label, allowNone = true }: {
  ix: Index; day: string; value: string; onChange: (v: string) => void; newPlace: NewPlace; setNewPlace: (p: NewPlace) => void; label: string; allowNone?: boolean;
}) {
  const dayCities = ix.cityOfDay.get(day) ?? [];
  const cityOrder = [...dayCities, ...ix.bundle.data.trip.cities.map((c) => c.id).filter((c) => !dayCities.includes(c))];
  const real = ix.bundle.data.places.filter((p) => !/未选定/.test(p.name_zh));
  return (
    <>
      <label className="ed-wide">{label}
        <select value={value} onChange={(e) => onChange(e.target.value)}>
          {allowNone && <option value="">无具体地点</option>}
          {!allowNone && <option value="">请选择</option>}
          {cityOrder.map((c) => {
            const list = real.filter((p) => p.city === c);
            return list.length ? <optgroup key={c} label={ix.cityName.get(c) ?? c}>{list.map((p) => <option key={p.id} value={p.id}>{p.name_zh}</option>)}</optgroup> : null;
          })}
          <option value="__new">＋ 新地点…</option>
        </select>
      </label>
      {value === '__new' && (
        <div className="ed-grid ed-wide ed-sub">
          <label>中文名<input value={newPlace.name_zh} onChange={(e) => setNewPlace({ ...newPlace, name_zh: e.target.value })} /></label>
          <label>英文名<input value={newPlace.name_en} onChange={(e) => setNewPlace({ ...newPlace, name_en: e.target.value })} /></label>
          <label>城市<select value={newPlace.city} onChange={(e) => setNewPlace({ ...newPlace, city: e.target.value })}>{ix.bundle.data.trip.cities.map((c) => <option key={c.id} value={c.id}>{c.name_zh}</option>)}</select></label>
          <label>地址（可选）<input value={newPlace.address} onChange={(e) => setNewPlace({ ...newPlace, address: e.target.value })} /></label>
          <p className="small muted ed-wide">新地点没有坐标，进入「待定位」列表，不会被猜测到地图上。</p>
        </div>
      )}
    </>
  );
}

function makePlace(np: NewPlace, kind: Place['kind'], id: string): Place {
  return { id, name_zh: np.name_zh.trim(), name_en: np.name_en.trim() || np.name_zh.trim(), kind, city: np.city, address: np.address.trim() || null, coord: null, coord_source: 'none', coord_precision: 'none' };
}

function PositionSelect({ ix, day, value, onChange }: { ix: Index; day: string; value: string; onChange: (v: string) => void }) {
  const items = ix.itemsByDay.get(day) ?? [];
  return (
    <label>位置<select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="__start">当天最前</option>
      {items.map((it) => {
        const id = it.type === 'activity' ? it.a.id : it.l.id;
        return <option key={id} value={id}>在「{ix.subjectOf.get(id)?.title ?? id}」之后</option>;
      })}
      <option value="__end">当天最后</option>
    </select></label>
  );
}

export function AddItemForm({ ix, day, onDone }: { ix: Index; day: string; onDone: () => void }) {
  const { addOps } = useEdit();
  const defaultCity = (ix.cityOfDay.get(day) ?? [])[0] ?? ix.bundle.data.trip.cities[0].id;
  const blankPlace: NewPlace = { name_zh: '', name_en: '', city: defaultCity, address: '' };
  const [what, setWhat] = useState<'activity' | 'leg'>('activity');
  const [date, setDate] = useState(day);
  const [pos, setPos] = useState('__end');
  const [a, setA] = useState({ kind: 'sight' as Activity['kind'], title_zh: '', title_en: '', place: '', plan_status: 'selected' as Activity['plan_status'], daypart: '', start: '', end: '', basis: 'proposed', importance: 'normal' as Activity['importance'], notes: '' });
  const [l, setL] = useState({ mode: 'rail' as Leg['mode'], from: '', to: '', depart: '', arrive: '', timing_basis: '', daypart: '', importance: 'normal' as Leg['importance'], notes: '' });
  const [np, setNp] = useState<NewPlace>(blankPlace);
  const [np2, setNp2] = useState<NewPlace>(blankPlace);
  const [ids] = useState(() => ({ act: newId('act-u'), leg: newId('leg-u'), p1: newId('pl-u'), p2: newId('pl-u') }));
  const [source, setSource] = useState<SourceChoice>({ type: 'none' });

  const order = date !== day || pos === '__end' ? orderAfter(ix, date, (() => { const it = ix.itemsByDay.get(date) ?? []; const last = it.at(-1); return last ? (last.type === 'activity' ? last.a.id : last.l.id) : null; })()) : orderAfter(ix, day, pos === '__start' ? null : pos);

  const placeOk = (v: string, p: NewPlace) => v !== '__new' || p.name_zh.trim().length > 0;
  const actOk = a.title_zh.trim().length > 0 && placeOk(a.place, np);
  const legOk = !!l.from && !!l.to && placeOk(l.from, np) && placeOk(l.to, np2) && !(l.from === l.to && l.from !== '__new');

  /** 由表单状态构造新项目（ID 稳定，便于模板预览与提交一致）。 */
  const built = useMemo(() => {
    const placeOps: EditOp[] = [];
    const resolve = (v: string, p: NewPlace, kind: Place['kind'], id: string): string | null => {
      if (v === '__new') { if (!p.name_zh.trim()) return null; placeOps.push({ type: 'add_place', place: makePlace(p, kind, id) }); return id; }
      return v || null;
    };
    let subject: TemplateSubject | null = null;
    let itemOp: EditOp | null = null;
    if (what === 'activity') {
      const placeId = resolve(a.place, np, PLACE_KIND_FOR[a.kind], ids.p1);
      const act: Activity = {
        id: ids.act, date, order, kind: a.kind, title_zh: a.title_zh.trim(), title_en: a.title_en.trim() || a.title_zh.trim(),
        place_id: placeId, time: a.start ? { start: a.start, end: a.end || null, basis: a.basis as 'proposed' } : null,
        importance: a.importance, plan_status: a.plan_status,
      };
      if (!a.start && a.daypart) act.daypart = a.daypart as Activity['daypart'];
      if (a.notes.trim()) act.notes = a.notes.trim();
      itemOp = { type: 'add_activity', activity: act };
      if (act.title_zh) subject = { entity: 'activity', item: act };
    } else {
      const from = resolve(l.from, np, 'other', ids.p1);
      const to = resolve(l.to, np2, 'other', ids.p2);
      if (from && to) {
        const both = ix.places.get(from)?.coord && ix.places.get(to)?.coord;
        const leg: Leg = {
          id: ids.leg, date, order, mode: l.mode, from_place_id: from, to_place_id: to,
          depart: l.depart || null, arrive: l.arrive || null, timing_basis: (l.timing_basis || null) as Leg['timing_basis'],
          duration_min: null, route_precision: both ? 'schematic' : 'unavailable', importance: l.importance,
        };
        if (l.daypart) leg.daypart = l.daypart as Leg['daypart'];
        if (l.notes.trim()) leg.notes = l.notes.trim();
        itemOp = { type: 'add_leg', leg };
        subject = { entity: 'leg', item: leg };
      }
    }
    const newPlaces = placeOps.flatMap((o) => (o.type === 'add_place' ? [o.place] : []));
    const preview: TripData = { ...ix.bundle.data, places: [...ix.bundle.data.places, ...newPlaces] };
    return { placeOps, itemOp, subject, preview };
  }, [what, a, l, np, np2, date, order, ids, ix]);

  const claims = useClaimDrafts(ix, built.subject, built.preview);

  const save = () => {
    if (!built.itemOp || !built.subject) return;
    const claimOps = composeClaimOps(claims.drafts, built.subject, built.preview, source);
    addOps([...built.placeOps, built.itemOp, ...claimOps]);
    onDone();
  };

  return (
    <div className="editor add-form" role="group" aria-label="新增项目">
      <div className="seg" role="radiogroup" aria-label="新增类型">
        <button type="button" role="radio" aria-checked={what === 'activity'} onClick={() => setWhat('activity')}>活动</button>
        <button type="button" role="radio" aria-checked={what === 'leg'} onClick={() => setWhat('leg')}>交通</button>
      </div>
      <div className="ed-grid">
        <label>日期<select value={date} onChange={(e) => setDate(e.target.value)}>{ix.days.map((d) => <option key={d} value={d}>{shortDate(d)} {weekdayZh(d)}</option>)}</select></label>
        {date === day ? <PositionSelect ix={ix} day={day} value={pos} onChange={setPos} /> : <label>位置<select disabled><option>当天最后</option></select></label>}
        {what === 'activity' ? (
          <>
            <label>类型<select value={a.kind} onChange={(e) => setA({ ...a, kind: e.target.value as Activity['kind'] })}>{KIND_OPTIONS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>计划状态<select value={a.plan_status} onChange={(e) => setA({ ...a, plan_status: e.target.value as Activity['plan_status'] })}>{Object.entries(PLAN_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="ed-wide"><span>名称 <strong className="tone-text-bad">*</strong></span><input value={a.title_zh} onChange={(e) => setA({ ...a, title_zh: e.target.value })} placeholder="例如：自然史博物馆" maxLength={80} /></label>
            <label className="ed-wide">英文名（可选）<input value={a.title_en} onChange={(e) => setA({ ...a, title_en: e.target.value })} maxLength={80} /></label>
            <PlacePicker ix={ix} day={date} value={a.place} onChange={(v) => setA({ ...a, place: v })} newPlace={np} setNewPlace={setNp} label="地点" />
            <label>时段<select value={a.daypart} onChange={(e) => setA({ ...a, daypart: e.target.value })} disabled={!!a.start}><option value="">未指定</option>{Object.entries(DAYPART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>开始<input type="time" value={a.start} onChange={(e) => setA({ ...a, start: e.target.value })} /></label>
            <label>结束<input type="time" value={a.end} onChange={(e) => setA({ ...a, end: e.target.value })} disabled={!a.start} /></label>
            <label>时间依据<select value={a.basis} onChange={(e) => setA({ ...a, basis: e.target.value })} disabled={!a.start}><option value="proposed">建议</option><option value="user_stated">同行提供</option></select></label>
            <label>重要性<select value={a.importance} onChange={(e) => setA({ ...a, importance: e.target.value as Activity['importance'] })}><option value="critical">关键</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
            <label className="ed-wide">备注<textarea rows={2} value={a.notes} onChange={(e) => setA({ ...a, notes: e.target.value })} /></label>
          </>
        ) : (
          <>
            <label>交通方式<select value={l.mode} onChange={(e) => setL({ ...l, mode: e.target.value as Leg['mode'] })}>{Object.entries(MODE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label>重要性<select value={l.importance} onChange={(e) => setL({ ...l, importance: e.target.value as Leg['importance'] })}><option value="critical">关键</option><option value="high">高</option><option value="normal">普通</option><option value="low">低</option></select></label>
            <PlacePicker ix={ix} day={date} value={l.from} onChange={(v) => setL({ ...l, from: v })} newPlace={np} setNewPlace={setNp} label="出发地 *" allowNone={false} />
            <PlacePicker ix={ix} day={date} value={l.to} onChange={(v) => setL({ ...l, to: v })} newPlace={np2} setNewPlace={setNp2} label="目的地 *" allowNone={false} />
            <label>出发<input type="time" value={l.depart} onChange={(e) => setL({ ...l, depart: e.target.value })} /></label>
            <label>到达<input type="time" value={l.arrive} onChange={(e) => setL({ ...l, arrive: e.target.value })} /></label>
            <label>班次依据<select value={l.timing_basis} onChange={(e) => setL({ ...l, timing_basis: e.target.value })}><option value="">未定</option><option value="proposed">建议</option><option value="user_stated">同行提供</option></select></label>
            <label>时段<select value={l.daypart} onChange={(e) => setL({ ...l, daypart: e.target.value })}><option value="">未指定</option>{Object.entries(DAYPART_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="ed-wide">备注<textarea rows={2} value={l.notes} onChange={(e) => setL({ ...l, notes: e.target.value })} /></label>
            <p className="small muted ed-wide">新交通段在地图上只画「连接示意」虚线；时长不估算，需要在核实中登记。</p>
          </>
        )}
      </div>
      <div className="ed-grid">
        <ClaimDraftList subject={built.subject} drafts={claims.drafts} setDrafts={claims.setDrafts} update={claims.update} />
        {claims.drafts.some((d) => d.checked) && <SourcePicker ix={ix} value={source} onChange={setSource} />}
      </div>
      <p className="small muted">新增项目的预订状态为「未知」，需要时到「预订」中补充；「已订」时间只能在关联预订确认后设置。</p>
      <Actions onSave={save} onCancel={onDone} disabled={what === 'activity' ? !actOk : !legOk}
        hint={what === 'activity' ? (!a.title_zh.trim() ? '请填写名称' : !placeOk(a.place, np) ? '请填写新地点名称' : undefined) : (!l.from || !l.to ? '请选择出发地和目的地' : l.from === l.to && l.from !== '__new' ? '出发地和目的地相同' : undefined)} />
    </div>
  );
}

export function RemoveConfirm({ entity, id, title, onDone }: { entity: 'activity' | 'leg'; id: string; title: string; onDone: () => void }) {
  const { addOps } = useEdit();
  const [note, setNote] = useState('');
  return (
    <div className="editor editor-danger" role="alertdialog" aria-label={`删除 ${title}`}>
      <p><strong>删除「{title}」？</strong></p>
      <p className="small muted">删除后从行程、地图和导出中移除；相关核实事实记为「不适用」，只关联它的预订不再计入完成率。记录本身保留，可以随时恢复。</p>
      <label className="ed-wide">原因（可选）<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="例如：时间不够，改去别处" /></label>
      <div className="ed-actions">
        <button type="button" className="btn btn-danger" onClick={() => {
          const ops: EditOp[] = [{ type: 'set', entity, id, field: 'removed', value: true }];
          if (note.trim()) ops.push({ type: 'set', entity, id, field: 'removed_note', value: note.trim() });
          addOps(ops); onDone();
        }}>删除</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
