import { useState } from 'react';
import type { Bundle, RejectedEdit } from '../lib/model';
import type { LocalState } from '../lib/draft';
import { describeOp, privacyWarnings, type EditFile } from '../lib/edits';
import { changeFile, downloadText, githubNewFileUrl, serialize } from '../lib/io';

/** 草稿栏：查看 / 撤销 / 提交到 GitHub / 下载。提交方式是打开 GitHub 新建文件页并预填内容，不需要任何 token。 */
export default function DraftBar({ published, st, update, errors, rejected }: {
  published: Bundle; st: LocalState; update: (p: Partial<LocalState> | ((s: LocalState) => Partial<LocalState>)) => void;
  errors: string[]; rejected: Map<string, RejectedEdit>;
}) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const n = st.ops.length;
  const pending = st.submitted;
  if (n === 0 && pending.length === 0) return null;

  const repo = published.build.repo;
  const warnings = privacyWarnings(st.ops);

  const download = (file: EditFile) => downloadText(`${file.id}.json`, serialize(file), 'application/json');

  async function submit() {
    const file = changeFile(st.ops, st.author, published.build.version, note);
    const { url, prefilled } = githubNewFileUrl(repo!, published.build.branch, file);
    if (!prefilled) {
      try { await navigator.clipboard.writeText(serialize(file)); setMsg('修改较多，内容已复制到剪贴板：请在打开的 GitHub 页面中粘贴，然后点 Commit changes。'); }
      catch { download(file); setMsg('修改较多且无法写入剪贴板，已下载文件：请在打开的 GitHub 页面中粘贴文件内容。'); }
    } else setMsg('已在新窗口打开 GitHub：确认内容后点「Commit changes」。发布完成（约 1 分钟）后这里会自动清除。');
    window.open(url, '_blank', 'noopener');
    update((s) => ({ ops: [], submitted: [...s.submitted, file] }));
    setSubmitting(false);
  }

  return (
    <aside className="draftbar" aria-label="本地草稿">
      <div className="draftbar-row">
        {n > 0 && <span><strong>本地草稿 {n} 处修改</strong><span className="muted small">（仅本设备）</span></span>}
        {pending.length > 0 && <span className="small">已提交待发布 {pending.length} 批{pending.some((p) => rejected.has(p.id)) && <strong className="tone-text-bad">（有被拒绝的）</strong>}</span>}
        <span className="draftbar-actions">
          <button type="button" className="btn btn-ghost" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? '收起' : '查看'}</button>
          {n > 0 && <button type="button" className="btn" onClick={() => { setSubmitting(true); setOpen(true); }} disabled={!repo}>提交给同行…</button>}
        </span>
      </div>
      {msg && <p className="small" role="status">{msg}</p>}
      {open && (
        <div className="draftbar-panel">
          {errors.length > 0 && <ul className="small tone-text-bad">{errors.map((e) => <li key={e}>✕ {e}</li>)}</ul>}
          {n > 0 && (
            <>
              <h3 className="small-title">本地草稿</h3>
              <ol className="draft-list">
                {st.ops.map((op, i) => (
                  <li key={i}><span>{describeOp(op, published.data)}</span>
                    <button type="button" className="linklike" onClick={() => update((s) => ({ ops: s.ops.filter((_, j) => j !== i) }))}>撤销</button></li>
                ))}
              </ol>
              <p className="draft-tools">
                <button type="button" className="linklike" onClick={() => download(changeFile(st.ops, st.author, published.build.version, note))}>下载草稿文件（发给维护者代录）</button>
                {' · '}
                <button type="button" className="linklike" onClick={() => { if (confirm('放弃全部本地草稿？')) update({ ops: [] }); }}>全部放弃</button>
              </p>
            </>
          )}
          {submitting && n > 0 && (
            <div className="submit-box">
              <label>你的称呼（会写入公开仓库）<input value={st.author} onChange={(e) => update({ author: e.target.value })} placeholder="例如：小林" maxLength={60} /></label>
              <label>说明（可选）<input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} placeholder="例如：确认了约克住宿" /></label>
              {warnings.map((w) => <p key={w} className="small tone-text-warn">⚠ {w}。仓库是公开的，请删掉私密信息再提交。</p>)}
              <p className="small muted">将打开 GitHub 新建文件页（data/edits/），内容已填好。有写权限的同行直接提交；没有写权限时 GitHub 会自动改为提交 PR，由维护者合并。</p>
              <button type="button" className="btn" onClick={submit} disabled={errors.length > 0 || !st.author.trim()}>打开 GitHub 提交</button>
              {!st.author.trim() && <span className="small muted"> 请先填写称呼</span>}
            </div>
          )}
          {pending.length > 0 && (
            <>
              <h3 className="small-title">已提交，等待发布</h3>
              <ul className="draft-list">
                {pending.map((p) => {
                  const rj = rejected.get(p.id);
                  return (
                    <li key={p.id}>
                      <span>{p.id} · {p.ops.length} 项 · {p.author}{rj && <span className="tone-text-bad"> · 被拒绝：{rj.errors.join('；')}</span>}</span>
                      <span>
                        <button type="button" className="linklike" onClick={() => update((s) => ({ ops: [...s.ops, ...p.ops], submitted: s.submitted.filter((x) => x.id !== p.id) }))}>放回草稿</button>
                        {' · '}
                        <button type="button" className="linklike" onClick={() => update((s) => ({ submitted: s.submitted.filter((x) => x.id !== p.id) }))}>移除</button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <p className="small muted">如果没有在 GitHub 上点 Commit，这些修改不会发布；可以「放回草稿」重新提交。</p>
            </>
          )}
        </div>
      )}
    </aside>
  );
}
