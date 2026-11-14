// 可共享链接：只保存非敏感参数（日期、视图、地点、手机端模式）。使用查询串，刷新不会 404。
export type View = 'day' | 'claims' | 'bookings' | 'overview' | 'print';
export interface UrlState { d: string | null; v: View; p: string | null; m: 'list' | 'map'; f: string | null }

const VIEWS: View[] = ['day', 'claims', 'bookings', 'overview', 'print'];

export function readUrl(search: string): UrlState {
  const s = new URLSearchParams(search);
  const v = s.get('v') as View;
  return {
    d: s.get('d'),
    v: VIEWS.includes(v) ? v : 'day',
    p: s.get('p'),
    m: s.get('m') === 'map' ? 'map' : 'list',
    f: s.get('f'),
  };
}

export function writeUrl(st: UrlState): string {
  const s = new URLSearchParams();
  if (st.v !== 'day') s.set('v', st.v);
  if (st.d) s.set('d', st.d);
  if (st.p) s.set('p', st.p);
  if (st.m === 'map') s.set('m', 'map');
  if (st.f) s.set('f', st.f);
  const q = s.toString();
  return q ? `?${q}` : '';
}
