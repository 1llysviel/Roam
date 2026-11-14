// 附带核实项：按模板生成可勾选、可改写的核实项，并选择依据来源。
import { useEffect, useRef, useState } from 'react';
import type { Index } from '../lib/derive';
import type { TripData } from '../lib/model';
import { composeClaimOps, customDraft, draftsFor, type ClaimDraft, type SourceChoice, type TemplateSubject } from '../lib/templates';
import { useEdit } from '../lib/draft';

/** 草稿状态：项目信息变化时按模板重新填充，但保留用户改写过的条目与自定义条目。 */
export function useClaimDrafts(ix: Index, subject: TemplateSubject | null, data: TripData) {
  const [drafts, setDrafts] = useState<ClaimDraft[]>([]);
  const edited = useRef(new Set<string>());
  const sig = subject ? JSON.stringify([subject.entity, subject.item, data.places.length]) : '';
  useEffect(() => {
    if (!subject) { setDrafts((ds) => ds.filter((d) => !d.template_id)); return; }
    const fresh = draftsFor(ix.bundle.templates ?? [], subject, data);
    setDrafts((prev) => {
      const byKey = new Map(prev.map((d) => [d.key, d]));
      const merged = fresh.map((f) => {
        const old = byKey.get(f.key);
        if (!old) return f;
        return edited.current.has(f.key) ? { ...f, checked: old.checked, statement: old.statement } : { ...f, checked: old.checked };
      });
      return [...merged, ...prev.filter((d) => !d.template_id)];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  const update = (key: string, patch: Partial<ClaimDraft>) => {
    if ('statement' in patch) edited.current.add(key);
    setDrafts((ds) => ds.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  };
  return { drafts, setDrafts, update };
}

export function SourcePicker({ ix, value, onChange }: { ix: Index; value: SourceChoice; onChange: (v: SourceChoice) => void }) {
  const sel = value.type === 'existing' ? value.id : value.type === 'new' ? '__new' : '';
  return (
    <>
      <label className="ed-wide">依据来源
        <select value={sel} onChange={(e) => {
          const v = e.target.value;
          onChange(v === '__new' ? { type: 'new', title: '', url: '', publisher: '' } : v ? { type: 'existing', id: v } : { type: 'none' });
        }}>
          <option value="">暂无（之后再补）</option>
          {ix.bundle.sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
          <option value="__new">＋ 新来源…</option>
        </select>
      </label>
      {value.type === 'new' && (
        <div className="ed-grid ed-wide ed-sub">
          <label>名称<input value={value.title} onChange={(e) => onChange({ ...value, title: e.target.value })} placeholder="例如：Beamish 官网 · 圣诞活动" maxLength={80} /></label>
          <label>发布方<input value={value.publisher} onChange={(e) => onChange({ ...value, publisher: e.target.value })} maxLength={60} /></label>
          <label className="ed-wide">网址（https://，可留空）<input value={value.url} onChange={(e) => onChange({ ...value, url: e.target.value })} inputMode="url" placeholder="https://" /></label>
          <p className="small muted ed-wide">有 https 网址的来源会进入每日自动检查（只检测变化、不自动确认）；链接标为「线索」，首次人工核对后再确认。</p>
        </div>
      )}
    </>
  );
}

/** 核实项列表（受控）。 */
export function ClaimDraftList({ subject, drafts, setDrafts, update }: {
  subject: TemplateSubject | null; drafts: ClaimDraft[]; setDrafts: (f: (d: ClaimDraft[]) => ClaimDraft[]) => void; update: (key: string, patch: Partial<ClaimDraft>) => void;
}) {
  return (
    <fieldset className="claim-drafts ed-wide">
      <legend>附带核实项</legend>
      {drafts.length === 0 && <p className="small muted">{subject ? '没有适用的模板，可以添加自定义核实项。' : '填写名称 / 起终点后会按模板给出建议。'}</p>}
      {drafts.map((d) => (
        <div key={d.key} className={`claim-draft${d.checked ? '' : ' is-off'}`}>
          <input type="checkbox" checked={d.checked} onChange={(e) => update(d.key, { checked: e.target.checked })} aria-label="附带此核实项" />
          <input className="cd-text" value={d.statement} onChange={(e) => update(d.key, { statement: e.target.value })} placeholder="要核实的具体事实，例如：12/18 夜场开放时间" maxLength={200} />
          <label className="check small" title="关键交通或固定日期活动"><input type="checkbox" checked={d.critical} onChange={(e) => update(d.key, { critical: e.target.checked })} />关键</label>
          {!d.template_id && <button type="button" className="linklike small" onClick={() => setDrafts((ds) => ds.filter((x) => x.key !== d.key))}>移除</button>}
        </div>
      ))}
      {subject && <button type="button" className="linklike small" onClick={() => setDrafts((ds) => [...ds, customDraft(subject)])}>＋ 自定义核实项</button>}
    </fieldset>
  );
}

/** 给已有项目追加核实项（独立表单）。 */
export function AddClaimsForm({ ix, subject, onDone }: { ix: Index; subject: TemplateSubject; onDone: () => void }) {
  const { addOps } = useEdit();
  const { drafts, setDrafts, update } = useClaimDrafts(ix, subject, ix.bundle.data);
  const [source, setSource] = useState<SourceChoice>({ type: 'none' });
  // 已有核实项的同模板条目默认不勾选，避免重复
  const existing = new Set((subject.item.claim_ids ?? []).map((id) => ix.claims.get(id)?.kind));
  const dedupDone = useRef(false);
  useEffect(() => {
    if (dedupDone.current || drafts.length === 0) return;
    dedupDone.current = true;
    setDrafts((ds) => ds.map((d) => (d.template_id && existing.has(d.kind) ? { ...d, checked: false } : d)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drafts.length]);
  const ops = composeClaimOps(drafts, subject, ix.bundle.data, source);
  const n = ops.filter((o) => o.type === 'add_claim').length;
  return (
    <div className="editor" role="group" aria-label="添加核实项">
      <div className="ed-grid">
        <ClaimDraftList subject={subject} drafts={drafts} setDrafts={setDrafts} update={update} />
        <SourcePicker ix={ix} value={source} onChange={setSource} />
      </div>
      <div className="ed-actions">
        <button type="button" className="btn" disabled={n === 0} onClick={() => { addOps(ops); onDone(); }}>存入草稿（{n} 项）</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>取消</button>
      </div>
    </div>
  );
}
