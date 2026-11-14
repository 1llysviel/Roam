import { useEffect, useMemo, useState, useCallback } from 'react';
import type { Bundle } from './lib/model';
import { buildIndex } from './lib/derive';
import { readUrl, writeUrl, type UrlState } from './lib/url';
import { londonToday } from './lib/dates';
import Header from './components/Header';
import DayView from './components/DayView';
import ClaimsView from './components/ClaimsView';
import BookingsView from './components/BookingsView';
import OverviewView from './components/OverviewView';
import PrintView from './components/PrintView';
import type { ImportedLayer } from './components/ExtensionsPanel';

const DATA_URL = `${import.meta.env.BASE_URL}data/roam.json`;

export default function App() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState<UrlState>(() => readUrl(location.search));
  const [imported, setImported] = useState<ImportedLayer[]>([]);
  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    fetch(DATA_URL, { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(setBundle)
      .catch((e) => setError(String(e?.message ?? e)));
  }, []);

  useEffect(() => {
    const onPop = () => setUrl(readUrl(location.search));
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);

  const ix = useMemo(() => (bundle ? buildIndex(bundle, now) : null), [bundle, now]);

  const nav = useCallback((patch: Partial<UrlState>, push = true) => {
    setUrl((cur) => {
      const next = { ...cur, ...patch };
      const href = `${location.pathname}${writeUrl(next)}`;
      if (push) history.pushState(null, '', href); else history.replaceState(null, '', href);
      return next;
    });
  }, []);

  if (error) return <main className="fatal"><h1>行程数据加载失败</h1><p>{error}</p><p>请刷新重试；也可下载 <a href={`${import.meta.env.BASE_URL}exports/uk-2026-12-itinerary.csv`}>行程 CSV</a>。</p></main>;
  if (!ix) return <p className="boot">正在加载行程…</p>;

  const today = londonToday(now);
  const exp = `${import.meta.env.BASE_URL}exports/${ix.bundle.data.trip.id}`;
  const day = url.d && ix.days.includes(url.d) ? url.d : ix.days.includes(today) ? today : ix.days[0];

  return (
    <div className={`app view-${url.v}`}>
      <Header ix={ix} view={url.v} onView={(v) => nav({ v, f: null })} />
      {url.v === 'day' && <DayView ix={ix} day={day} url={url} nav={nav} today={today} imported={imported} />}
      {url.v === 'claims' && <ClaimsView ix={ix} url={url} nav={nav} now={now} />}
      {url.v === 'bookings' && <BookingsView ix={ix} url={url} nav={nav} />}
      {url.v === 'overview' && <OverviewView ix={ix} nav={nav} now={now} imported={imported} setImported={setImported} />}
      {url.v === 'print' && <PrintView ix={ix} />}
      <footer className="site-foot">
        <span>数据版本 {ix.bundle.build.version} · 构建于 <time dateTime={ix.bundle.build.built_at}>{new Date(ix.bundle.build.built_at).toLocaleString('zh-CN', { timeZone: 'Europe/London', hour12: false })}（伦敦）</time></span>
        <span>编辑：GitHub 文件或 PR · <a href={`${exp}.json`}>导出 JSON</a> · <a href={`${exp}.ics`}>ICS</a> · <a href={`${exp}-itinerary.csv`}>CSV</a> · <a href="?v=print" onClick={(e) => { e.preventDefault(); nav({ v: 'print' }); }}>打印版</a></span>
      </footer>
    </div>
  );
}
