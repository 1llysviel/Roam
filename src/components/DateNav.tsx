import { useEffect, useRef } from 'react';
import type { Index } from '../lib/derive';
import { shortDate, weekdayZh } from '../lib/dates';

export default function DateNav({ ix, day, today, onPick }: { ix: Index; day: string; today: string; onPick: (d: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-current="date"]');
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' });
  }, [day]);
  return (
    <div className="datenav" ref={ref} role="tablist" aria-label="日期">
      {ix.days.map((d) => {
        const cities = (ix.cityOfDay.get(d) ?? []).map((c) => ix.cityName.get(c) ?? c);
        return (
          <a key={d} href={`?d=${d}`} role="tab" aria-selected={d === day} aria-current={d === day ? 'date' : undefined}
            className={`datechip${d === today ? ' is-today' : ''}`} title={`${shortDate(d)} ${weekdayZh(d)} ${cities.join(" → ")}`}
            onClick={(e) => { e.preventDefault(); onPick(d); }}>
            <span className="dc-date">{shortDate(d)} <span className="dc-week">{weekdayZh(d)}</span></span>
            <span className="dc-city">{cities.length ? cities.join('→') : '—'}</span>
          </a>
        );
      })}
    </div>
  );
}
