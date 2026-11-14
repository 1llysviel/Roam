import { useCallback, useEffect, useMemo } from 'react';
import type { Index } from '../lib/derive';
import { dayPlaces } from '../lib/derive';
import type { UrlState } from '../lib/url';
import { longDateZh } from '../lib/dates';
import { BOOKING_LABEL } from '../lib/derive';
import { appleMapsPlace, googleMapsPlace } from '../lib/links';
import DateNav from './DateNav';
import ItemCard from './ItemCard';
import MapPane, { type MapPoint } from './MapPane';
import Badge from './Badge';
import type { ImportedLayer } from './ExtensionsPanel';

export default function DayView({ ix, day, url, nav, today, imported }: {
  ix: Index; day: string; url: UrlState; nav: (p: Partial<UrlState>, push?: boolean) => void; today: string; imported: ImportedLayer[];
}) {
  const items = ix.itemsByDay.get(day) ?? [];
  const stay = ix.stayByNight.get(day);
  const stayPlace = stay?.selected_place_id ? ix.places.get(stay.selected_place_id) : null;
  const stayBooking = stay?.booking_id ? ix.bookings.get(stay.booking_id) : null;
  const cities = (ix.cityOfDay.get(day) ?? []).map((c) => ix.cityName.get(c) ?? c);

  const { points, seqOfPlace } = useMemo(() => {
    const seq = new Map<string, number>();
    for (const it of items) if (it.type === 'activity' && it.a.place_id && ix.places.get(it.a.place_id)?.coord && !seq.has(it.a.place_id)) seq.set(it.a.place_id, seq.size + 1);
    const pts: MapPoint[] = dayPlaces(ix, day).map((p) => ({ place: p, n: seq.get(p.id) ?? null }));
    return { points: pts, seqOfPlace: seq };
  }, [ix, day, items]);
  const legs = useMemo(() => items.flatMap((i) => (i.type === 'leg' ? [i.l] : [])), [items]);

  const select = useCallback((id: string) => nav({ p: id }, false), [nav]);
  useEffect(() => {
    if (!url.p) return;
    const card = items.find((i) => (i.type === 'activity' ? i.a.place_id === url.p : i.l.to_place_id === url.p));
    if (card && url.m !== 'map') document.getElementById(`item-${card.type === 'activity' ? card.a.id : card.l.id}`)?.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  }, [url.p, url.m, items]);

  const sel = url.p ? ix.places.get(url.p) : null;
  const draft = ix.bundle.data.trip.draft_notice;

  return (
    <main className="dayview">
      <DateNav ix={ix} day={day} today={today} onPick={(d) => nav({ d, p: null })} />
      {draft && <p className="draft-note" role="note"><span aria-hidden="true">✎</span> {draft}</p>}
      <div className="mobile-switch" role="group" aria-label="显示方式">
        <button type="button" aria-pressed={url.m === 'list'} onClick={() => nav({ m: 'list' }, false)}>行程</button>
        <button type="button" aria-pressed={url.m === 'map'} onClick={() => nav({ m: 'map' }, false)}>地图</button>
      </div>
      <div className={`day-grid mode-${url.m}`}>
        <section className="day-list" aria-label={`${longDateZh(day)} 行程`}>
          <header className="day-head">
            <h2>{longDateZh(day)}</h2>
            <p className="day-cities">{cities.join(' → ') || '城市未定'}{day === today && <Badge tone="accent">今天</Badge>}</p>
          </header>
          {day !== ix.bundle.data.trip.end_date && (
            <div className={`stay${stayPlace ? '' : ' is-gap'}`}>
              <span className="stay-label">当晚住宿</span>
              {stayPlace ? (
                <span className="stay-name">
                  <button type="button" className="linklike" onClick={() => stayPlace.coord && select(stayPlace.id)}>{stayPlace.name_zh}</button>
                  {stay?.selection_basis && <span className="muted small"> · {stay.selection_basis}</span>}
                </span>
              ) : <span className="stay-name">未选定 · {ix.cityName.get(stay?.city ?? '') ?? ''}</span>}
              {stayBooking ? <Badge tone={stayBooking.status === 'booked' ? 'ok' : 'warn'} icon={stayBooking.status === 'booked' ? '✓' : '!'}>{BOOKING_LABEL[stayBooking.status]}</Badge>
                : <Badge tone="warn" icon="!">住宿空缺</Badge>}
            </div>
          )}
          {items.length === 0 ? <p className="empty">当天尚无安排。</p> : (
            <ol className="timeline">
              {items.map((it) => {
                const pid = it.type === 'activity' ? it.a.place_id : it.l.to_place_id;
                return (
                  <li key={it.type === 'activity' ? it.a.id : it.l.id}>
                    <ItemCard ix={ix} item={it} n={it.type === 'activity' && pid ? seqOfPlace.get(pid) ?? null : null}
                      selected={!!pid && pid === url.p} onLocate={(id) => nav({ p: id, m: 'map' }, false)} />
                  </li>
                );
              })}
            </ol>
          )}
        </section>
        <div className="day-map">
          <MapPane ix={ix} points={points} legs={legs} selected={url.p} onSelect={select} imported={imported} />
          {sel && (
            <aside className="place-sheet" aria-label="地点详情">
              <button type="button" className="sheet-close" aria-label="关闭地点详情" onClick={() => nav({ p: null }, false)}>×</button>
              <h3>{sel.name_zh}</h3>
              <p className="card-sub">{sel.name_en}</p>
              <p className="small">{sel.address ?? '地址未录入'}</p>
              <p className="small muted">坐标：{sel.coord ? `${sel.coord.lat.toFixed(4)}, ${sel.coord.lng.toFixed(4)}` : '缺失'} · {sel.coord_source === 'manual_verified' ? '人工核对入口' : sel.coord_source === 'initial_draft' ? '初稿，待核对入口' : sel.coord_source}</p>
              <div className="card-actions">
                <a className="btn btn-ghost" href={appleMapsPlace(sel)} target="_blank" rel="noopener noreferrer">Apple 地图 ↗</a>
                <a className="btn btn-ghost" href={googleMapsPlace(sel)} target="_blank" rel="noopener noreferrer">Google 地图 ↗</a>
                {url.m === 'map' && <button type="button" className="btn" onClick={() => nav({ m: 'list' }, false)}>看行程</button>}
              </div>
            </aside>
          )}
        </div>
      </div>
    </main>
  );
}
