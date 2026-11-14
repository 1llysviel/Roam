import type { Index } from '../lib/derive';
import type { View } from '../lib/url';
import { shortDate } from '../lib/dates';

const TABS: Array<[View, string]> = [['day', '行程'], ['claims', '核实'], ['bookings', '预订'], ['overview', '总览']];

export default function Header({ ix, view, onView }: { ix: Index; view: View; onView: (v: View) => void }) {
  const t = ix.bundle.data.trip;
  return (
    <header className="site-head">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true">R</span>
        <div>
          <h1 className="trip-title">{t.title_zh}</h1>
          <p className="trip-sub">{shortDate(t.start_date)}–{shortDate(t.end_date)} · {ix.days.length} 天<span className="cities"> · {ix.tripCities.map((c) => ix.cityName.get(c)).join(' · ')}</span></p>
        </div>
      </div>
      <nav className="tabs" aria-label="视图">
        {TABS.map(([v, label]) => (
          <a key={v} href={v === 'day' ? '?' : `?v=${v}`} className="tab" aria-current={view === v ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); onView(v); }}>{label}</a>
        ))}
      </nav>
    </header>
  );
}
