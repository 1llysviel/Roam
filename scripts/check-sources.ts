// 每日来源检查（单一状态写入者：只写 history/checks.json）。
// - 只检查已登记、fetch: auto 的官方来源；同一 URL 一次获取供多个事实使用。
// - 按域名限速、条件请求、超时、有限重试与退避。
// - 内容变化只产生待复核记录；HTTP 200 / 哈希不变 / 抓取失败都不会改变事实确认时间。
// - 旅行结束后直接退出，不再抓取。
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadAll, ROOT } from './lib/load';
import { textBlocks, relevantBlocks, hashBlocks, looksBlocked } from './lib/extract';
import { RULES } from '../src/lib/rules';
import { londonToday } from '../src/lib/dates';
import type { ChecksState, CheckEvent, FetchStatus, SourceState } from '../src/lib/model';

const l = loadAll();
const cfg = l.features.sourceChecks;
const now = new Date();
const today = londonToday(now);
const report: string[] = [`# 来源检查报告 ${now.toISOString()}`, ''];

function finish(code = 0) {
  mkdirSync(join(ROOT, 'reports'), { recursive: true });
  writeFileSync(join(ROOT, 'reports', 'check-report.md'), report.join('\n') + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report.join('\n') + '\n');
  console.log(report.join('\n'));
  process.exit(code);
}

if (today > l.data.trip.end_date && !process.argv.includes('--force')) {
  report.push(`旅行已于 ${l.data.trip.end_date} 结束，停止检查（未发起任何请求）。`);
  finish(0);
}

const statePath = join(ROOT, 'history', 'checks.json');
const state: ChecksState = JSON.parse(readFileSync(statePath, 'utf8'));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const lastHit = new Map<string, number>();
const UA = 'roam-trip-checker/0.1 (static travel planner; low-frequency daily check)';

async function politeFetch(url: string, prev: SourceState | undefined) {
  const host = new URL(url).host;
  const wait = (lastHit.get(host) ?? 0) + cfg.perDomainDelayMs - Date.now();
  if (wait > 0) await sleep(wait);
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= cfg.retries; attempt++) {
    lastHit.set(host, Date.now());
    try {
      const headers: Record<string, string> = { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/pdf;q=0.5' };
      if (prev?.etag) headers['if-none-match'] = prev.etag;
      if (prev?.last_modified) headers['if-modified-since'] = prev.last_modified;
      const res = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(cfg.timeoutMs) });
      if (res.status >= 500 || res.status === 429) {
        lastErr = new Error(`HTTP ${res.status}`);
        if (attempt < cfg.retries) { await sleep(1000 * 2 ** attempt * 2); continue; }
      }
      return { res, body: res.status === 200 ? await res.text() : '' };
    } catch (e) {
      lastErr = e;
      if (attempt < cfg.retries) await sleep(1000 * 2 ** attempt * 2);
    }
  }
  throw lastErr;
}

const byUrl = new Map<string, typeof l.sources>();
for (const s of l.sources) {
  if (s.fetch !== 'auto' || !s.url) continue;
  byUrl.set(s.url, [...(byUrl.get(s.url) ?? []), s]);
}

const events: CheckEvent[] = [];
let ok = 0, failed = 0, changed = 0;
const stamp = now.toISOString();
const seq = () => `ce-${stamp.replace(/[^0-9]/g, '').slice(0, 14)}-${events.length + 1}`;

for (const [url, srcs] of byUrl) {
  let status: FetchStatus = 'error';
  let http: number | null = null;
  let body = '';
  let etag: string | null = null, lastMod: string | null = null, note = '';
  try {
    const { res, body: b } = await politeFetch(url, state.sources[srcs[0].id]);
    http = res.status;
    etag = res.headers.get('etag');
    lastMod = res.headers.get('last-modified');
    const ctype = res.headers.get('content-type') ?? '';
    if (res.status === 304) status = 'ok';
    else if ([401, 403, 407, 429].includes(res.status)) { status = 'blocked'; note = '来源拒绝或限流，转人工核实'; }
    else if (res.status !== 200) { status = 'error'; note = `HTTP ${res.status}`; }
    else if (/pdf/i.test(ctype)) { status = 'unsupported'; note = 'PDF 暂不自动解析，转人工核实'; }
    else if (looksBlocked(b)) { status = 'blocked'; note = '疑似验证码/机器人拦截页，转人工核实'; }
    else { status = 'ok'; body = b; }
  } catch (e) {
    status = 'error';
    note = (e as Error)?.name === 'TimeoutError' ? '请求超时' : String((e as Error)?.message ?? e).slice(0, 120);
  }

  const blocks = body ? textBlocks(body) : [];
  for (const s of srcs) {
    const prev = state.sources[s.id];
    const next: SourceState = {
      last_attempt_at: stamp,
      last_ok_at: status === 'ok' ? stamp : prev?.last_ok_at ?? null,
      fetch_status: status,
      http_status: http,
      etag: status === 'ok' ? etag ?? prev?.etag ?? null : prev?.etag ?? null,
      last_modified: status === 'ok' ? lastMod ?? prev?.last_modified ?? null : prev?.last_modified ?? null,
      hash: prev?.hash ?? null,
      excerpt: prev?.excerpt ?? [],
      note,
    };
    let didChange = false;
    if (status === 'ok' && http === 200) {
      const rel = relevantBlocks(blocks, s.keywords, cfg.excerptMaxBlocks, cfg.excerptMaxChars);
      const h = hashBlocks(rel);
      if (prev?.hash && prev.hash !== h) {
        didChange = true; changed++;
        const claimIds = l.data.claims.filter((c) => c.source_ids.includes(s.id)).map((c) => c.id);
        state.pending_reviews = state.pending_reviews.filter((p) => p.source_id !== s.id);
        state.pending_reviews.push({ id: `pr-${s.id}-${stamp.slice(0, 10)}`, source_id: s.id, claim_ids: claimIds, detected_at: stamp, old_hash: prev.hash, new_hash: h, excerpt: rel });
      }
      next.hash = h; next.excerpt = rel;
      // 专用规则：仅对显式配置 check_rule 的 Claim 生效
      for (const c of l.data.claims.filter((c) => c.check_rule && c.source_ids.includes(s.id))) {
        const rule = RULES[c.check_rule!];
        if (!rule) continue;
        const out = rule(c, blocks);
        state.rule_results = state.rule_results.filter((r) => !(r.claim_id === c.id && r.source_id === s.id));
        state.rule_results.push({ id: `rr-${c.id}-${stamp.slice(0, 10)}`, claim_id: c.id, rule: c.check_rule!, at: stamp, matched: out.matched, verified_for_date: c.target_date, value: out.value, reason: out.reason, source_id: s.id });
      }
    }
    state.sources[s.id] = next;
    events.push({ id: seq(), source_id: s.id, at: stamp, fetch_status: status, http_status: http, changed: didChange, hash: next.hash, note: note || undefined });
  }
  if (status === 'ok') ok++; else failed++;
  report.push(`- ${status === 'ok' ? '✓' : '✕'} ${status.padEnd(11)} ${http ?? '—'}  ${url}${note ? '  ' + note : ''}`);
}

state.events = [...state.events, ...events].slice(-cfg.maxEvents);
state.last_attempt_at = stamp;
if (ok > 0) state.last_success_at = stamp;
state.last_run_summary = `检查 ${byUrl.size} 个来源：成功 ${ok}，失败/拦截 ${failed}，内容变化待复核 ${changed}`;
writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
report.splice(1, 0, state.last_run_summary, '');
report.push('', '说明：内容变化只生成待复核记录；抓取失败不推断停运、闭馆或售罄。');
finish(0);
