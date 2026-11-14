// 核实项模板：选择适用模板 → 用项目数据填充 {{占位符}} → 拼接为 Claim 与编辑操作。
// 模板定义在 templates/claims.yaml，构建时校验后随数据包发布。
import type { Activity, Claim, ClaimTemplate, Importance, Leg, Source, TripData } from './model';
export type { ClaimTemplate } from './model';
import { DAYPART_LABEL, MODE_LABEL } from './derive';
import { parseISODate, weekdayZh } from './dates';
import { newId, type EditOp } from './edits';

export type TemplateSubject = { entity: 'activity'; item: Activity } | { entity: 'leg'; item: Leg };

/** 从项目与地点数据得到占位符取值。 */
export function templateContext(subject: TemplateSubject, data: TripData): Record<string, string> {
  const place = (id: string | null | undefined) => (id ? data.places.find((p) => p.id === id) : undefined);
  const city = (id: string | undefined) => data.trip.cities.find((c) => c.id === id)?.name_zh ?? '';
  const { m, d } = parseISODate(subject.item.date);
  const base = {
    date: subject.item.date, md: `${m}/${d}`, weekday: weekdayZh(subject.item.date),
    daypart: subject.item.daypart ? DAYPART_LABEL[subject.item.daypart] : '',
  };
  if (subject.entity === 'activity') {
    const a = subject.item;
    const p = place(a.place_id);
    return { ...base, title: a.title_zh, place: p?.name_zh ?? '', city: city(p?.city), time: a.time?.start ?? '' };
  }
  const l = subject.item;
  const f = place(l.from_place_id), t = place(l.to_place_id);
  return {
    ...base, title: `${f?.name_zh ?? ''} → ${t?.name_zh ?? ''}`, from: f?.name_zh ?? '', to: t?.name_zh ?? '',
    from_en: f?.name_en ?? '', to_en: t?.name_en ?? '', mode: MODE_LABEL[l.mode], depart: l.depart ?? '', city: city(f?.city), time: l.depart ?? '',
  };
}

/** 填充占位符；返回文本和缺失的占位符。多余空白会被收拢。 */
export function render(tpl: string, ctx: Record<string, string>): { text: string; missing: string[] } {
  const missing: string[] = [];
  const text = tpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => {
    const v = ctx[k];
    if (v === undefined || v === '') { missing.push(k); return ''; }
    return v;
  }).replace(/\s{2,}/g, ' ').replace(/（\s*）/g, '').trim();
  return { text, missing };
}

/** 适用于该项目的模板（类型匹配且 requires 中的占位符都有值）。 */
export function applicableTemplates(templates: ClaimTemplate[], subject: TemplateSubject, ctx: Record<string, string>): ClaimTemplate[] {
  const kind = subject.entity === 'activity' ? subject.item.kind : subject.item.mode;
  return templates.filter((t) => {
    const list = t.for[subject.entity];
    if (!list || !(list.includes('*') || list.includes(kind))) return false;
    return (t.requires ?? []).every((k) => !!ctx[k]);
  });
}

/** 网页上待提交的核实项草稿（来自模板或自定义）。 */
export interface ClaimDraft { key: string; template_id: string | null; checked: boolean; statement: string; kind: string; critical: boolean; max_age_days: number }

const isCritical = (c: ClaimTemplate['critical'], imp: Importance) => (c === 'inherit' ? imp === 'critical' || imp === 'high' : c);

export function draftsFor(templates: ClaimTemplate[], subject: TemplateSubject, data: TripData): ClaimDraft[] {
  const ctx = templateContext(subject, data);
  return applicableTemplates(templates, subject, ctx).map((t) => ({
    key: t.id, template_id: t.id, checked: t.default, statement: render(t.statement, ctx).text,
    kind: t.kind, critical: isCritical(t.critical, subject.item.importance), max_age_days: t.max_age_days,
  }));
}

export const customDraft = (subject: TemplateSubject): ClaimDraft => ({
  key: newId('custom'), template_id: null, checked: true, statement: '', kind: 'other',
  critical: subject.item.importance === 'critical', max_age_days: 14,
});

/** 来源选择：已有来源 / 新来源 / 暂无。 */
export type SourceChoice = { type: 'existing'; id: string } | { type: 'new'; title: string; url: string; publisher: string } | { type: 'none' };

/** 拼接：把勾选的草稿与来源选择变成编辑操作（add_source + add_claim）。 */
export function composeClaimOps(drafts: ClaimDraft[], subject: TemplateSubject, data: TripData, source: SourceChoice): EditOp[] {
  const picked = drafts.filter((d) => d.checked && d.statement.trim());
  if (picked.length === 0) return [];
  const ops: EditOp[] = [];
  let sourceIds: string[] = [];
  if (source.type === 'existing') sourceIds = [source.id];
  if (source.type === 'new') {
    const url = source.url.trim();
    const src: Source = {
      id: newId('src-u'), kind: 'official', title: source.title.trim() || url, url: /^https:\/\//.test(url) ? url : null,
      publisher: source.publisher.trim() || source.title.trim() || '未填写', fetch: /^https:\/\//.test(url) ? 'auto' : 'manual', lead: true, keywords: [],
    };
    ops.push({ type: 'add_source', source: src });
    sourceIds = [src.id];
  }
  const ctx = templateContext(subject, data);
  for (const d of picked) {
    const claim: Claim = {
      id: newId('cl-u'), subject_id: subject.item.id, kind: d.kind, statement_zh: d.statement.trim(), target_date: subject.item.date,
      importance: subject.item.importance, critical: d.critical, source_ids: sourceIds, max_age_days: d.max_age_days,
    };
    if (subject.entity === 'leg' && ctx.from_en && ctx.to_en) claim.direction = `${ctx.from_en} → ${ctx.to_en}`;
    ops.push({ type: 'add_claim', claim });
  }
  return ops;
}
