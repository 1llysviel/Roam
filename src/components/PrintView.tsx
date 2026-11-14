import type { Index } from '../lib/derive';
import { BASIS_LABEL, BOOKING_LABEL, MODE_LABEL } from '../lib/derive';
import { longDateZh } from '../lib/dates';

/** 打印版：全部日期的文字行程，不依赖地图。 */
export default function PrintView({ ix }: { ix: Index }) {
  return (
    <main className="page print">
      <p className="no-print"><button type="button" className="btn" onClick={() => print()}>打印 / 存为 PDF</button></p>
      {ix.days.map((d) => {
        const stay = ix.stayByNight.get(d);
        const sp = stay?.selected_place_id ? ix.places.get(stay.selected_place_id) : null;
        return (
          <section key={d} className="print-day">
            <h2>{longDateZh(d)} · {(ix.cityOfDay.get(d) ?? []).map((c) => ix.cityName.get(c)).join(' → ')}</h2>
            <ul>
              {(ix.itemsByDay.get(d) ?? []).map((it) => it.type === 'activity' ? (
                <li key={it.a.id}><strong>{it.a.time?.start ?? '时间未定'}</strong>{it.a.time && `（${BASIS_LABEL[it.a.time.basis]}）`} {it.a.title_zh}{it.a.place_id && ` — ${ix.places.get(it.a.place_id)?.address ?? ''}`}</li>
              ) : (
                <li key={it.l.id}><strong>{it.l.depart ?? '班次未定'}</strong>{it.l.timing_basis && `（${BASIS_LABEL[it.l.timing_basis]}）`} {MODE_LABEL[it.l.mode]}：{ix.subjectOf.get(it.l.id)?.title}</li>
              ))}
            </ul>
            {d !== ix.bundle.data.trip.end_date && <p className="small">住宿：{sp ? `${sp.name_zh}（${BOOKING_LABEL[ix.bookings.get(stay!.booking_id!)?.status ?? 'unknown']}）` : '未选定'}</p>}
          </section>
        );
      })}
    </main>
  );
}
