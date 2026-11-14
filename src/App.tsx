import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Bundle } from './lib/model';
import { buildIndex } from './lib/derive';
import { readUrl, writeUrl, type UrlState } from './lib/url';
import { londonToday } from './lib/dates';
import { applyOps, quickCheck, type EditOp } from './lib/edits';
import { EditContext, useLocalState, type EditCtx } from './lib/draft';
import Header from './components/Header';
import DayView from './components/DayView';
import ClaimsView from './components/ClaimsView';
import BookingsView from './components/BookingsView';
import OverviewView from './components/OverviewView';
import PrintView from './components/PrintView';
import DraftBar from './components/DraftBar';
import type { ImportedLayer } from './components/ExtensionsPanel';

const DATA_URL = `${import.meta.env.BASE_URL}data/roam.json`;

export default function App() {
  const [published, setPublished] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<UrlState>(() => readUrl(location.search));
  const [imported, setImported] = useState<ImportedLayer[]>([]);
  const now = useMemo(() => new Date(), []);
  const { st, update, storageOk } = useLocalState(published?.data.trip.id ?? null);

  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setPublished)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    const onPop = () => setUrl(readUrl(location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  // 已提交的批次一旦出现在发布版本的 applied 列表中，就从本地移除
  const appliedIds = useMemo(() => new Set(published?.edits?.applied.map((a) => a.id) ?? []), [published]);
  const rejected = useMemo(() => new Map((published?.edits?.rejected ?? []).filter((r) => r.id).map((r) => [r.id!, r])), [published]);
  useEffect(() => {
    if (!published) return;
    const keep = st.submitted.filter((s) => !appliedIds.has(s.id));
    if (keep.length !== st.submitted.length) update({ submitted: keep });
  }, [published, appliedIds, st.submitted, update]);

  // 预览 = 发布版本 + 已提交待发布 + 本地草稿
  const view = useMemo(() => {
    if (!published) return null;
    const pendingOps = st.submitted.filter((s) => !rejected.has(s.id)).flatMap((s) => s.ops);
    const pend = applyOps(published.data, published.reviews, pendingOps, published.sources);
    const draft = applyOps(pend.data, pend.reviews, st.ops, pend.sources);
    const bundle: Bundle = { ...published, data: draft.data, reviews: draft.reviews, sources: draft.sources };
    return { bundle, touchedDraft: draft.touched, touchedPending: pend.touched, errors: [...draft.errors, ...quickCheck(draft.data)] };
  }, [published, st.ops, st.submitted, rejected]);

  const ix = useMemo(() => (view ? buildIndex(view.bundle, now) : null), [view, now]);

  const nav = useCallback((patch: Partial<UrlState>, push = true) => {
    setUrl((cur) => {
      const next = { ...cur, ...patch };
      const href = `${location.pathname}${writeUrl(next)}`;
      if (push) history.pushState(null, '', href); else history.replaceState(null, '', href);
      return next;
    });
  }, []);

  const addOps = useCallback((ops: EditOp[]) => update((s) => ({ ops: [...s.ops, ...ops] })), [update]);
  const ctx: EditCtx = useMemo(() => ({
    editMode: st.editMode, touchedDraft: view?.touchedDraft ?? new Set(), touchedPending: view?.touchedPending ?? new Set(),
    author: st.author, setAuthor: (author: string) => update({ author }), addOps, prefs: st.prefs, setPrefs: (prefs) => update({ prefs }),
  }), [st.editMode, st.author, st.prefs, view, addOps, update]);

  // 记住上次查看的日期（链接里没有指定日期时使用）
  useEffect(() => { if (url.v === 'day' && url.d && url.d !== st.lastDay) update({ lastDay: url.d }); }, [url.v, url.d, st.lastDay, update]);

  if (error) return <main className="fatal"><h1>行程数据加载失败</h1><p>{error}</p><p>请刷新重试。</p></main>;
  if (!ix || !view || !published) return <p className="boot">正在加载行程…</p>;

  const today = londonToday(now);
  const exp = `${import.meta.env.BASE_URL}exports/${ix.bundle.data.trip.id}`;
  const remembered = st.lastDay && ix.days.includes(st.lastDay) ? st.lastDay : null;
  const day = url.d && ix.days.includes(url.d) ? url.d : remembered ?? (ix.days.includes(today) ? today : ix.days[0]);

  return (
    <EditContext.Provider value={ctx}>
      <div className={`app view-${url.v}${st.editMode ? ' is-editing' : ''}`}>
        <Header ix={ix} view={url.v} onView={(v) => nav({ v, f: null })} editMode={st.editMode} onToggleEdit={() => update({ editMode: !st.editMode })} />
        {st.editMode && (
          <p className="edit-banner" role="status">
            <strong>编辑模式</strong> · 修改先保存在本设备（本地草稿），提交到 GitHub 并重新发布后同行才能看到。
            {!storageOk && <span className="tone-text-bad"> 浏览器禁止本地存储，刷新后草稿会丢失。</span>}
          </p>
        )}
        {url.v === 'day' && <DayView ix={ix} day={day} url={url} nav={nav} today={today} imported={imported} />}
        {url.v === 'claims' && <ClaimsView ix={ix} url={url} nav={nav} now={now} />}
        {url.v === 'bookings' && <BookingsView ix={ix} url={url} nav={nav} />}
        {url.v === 'overview' && <OverviewView ix={ix} nav={nav} now={now} imported={imported} setImported={setImported} />}
        {url.v === 'print' && <PrintView ix={ix} />}
        <DraftBar published={published} st={st} update={update} errors={view.errors} rejected={rejected} />
        <footer className="site-foot">
          <span>数据版本 {published.build.version} · 构建于 <time dateTime={published.build.built_at}>{new Date(published.build.built_at).toLocaleString('zh-CN', { timeZone: 'Europe/London', hour12: false })}（伦敦）</time>{published.edits?.applied.length ? ` · 含网站修改 ${published.edits.applied.length} 批` : ''}</span>
          <span><a href={`${exp}.json`}>导出 JSON</a> · <a href={`${exp}.ics`}>ICS</a> · <a href={`${exp}-itinerary.csv`}>CSV</a> · <a href="?v=print" onClick={(e) => { e.preventDefault(); nav({ v: 'print' }); }}>打印版</a></span>
        </footer>
      </div>
    </EditContext.Provider>
  );
}
