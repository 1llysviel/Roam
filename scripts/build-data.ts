// 校验主数据 → 合并为 public/data/roam.json → 生成 public/exports/*。本地与 Actions 使用同一命令。
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadAll, validateAll, applyEditFiles, ROOT, TRIP_ID } from './lib/load';
import type { Bundle } from '../src/lib/model';
import { SCHEMA_VERSION } from '../src/lib/model';
import { EXPORTERS } from '../src/lib/io';

const base = loadAll();
const errs = validateAll(base);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }
const { loaded, applied, rejected } = applyEditFiles(base);
for (const r of rejected) console.warn(`⚠ 跳过 data/edits/${r.file}：${r.errors.join('；')}`);

let commit: string | null = process.env.GITHUB_SHA ?? null;
if (!commit) { try { commit = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = null; } }
function repoFromGit(): string | null {
  try {
    const url = execSync('git remote get-url origin', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
    const m = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?$/.exec(url);
    return m ? m[1] : null;
  } catch { return null; }
}
const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const builtAt = new Date().toISOString();

const bundle: Bundle = {
  schema_version: SCHEMA_VERSION,
  build: { version: `${pkgVersion}+${commit ? commit.slice(0, 7) : 'local'}`, built_at: builtAt, commit, repo: process.env.GITHUB_REPOSITORY ?? repoFromGit(), branch: process.env.GITHUB_REF_NAME ?? 'main' },
  edits: { applied, rejected },
  data: loaded.data, sources: loaded.sources, reviews: loaded.reviews, checks: loaded.checks,
  features: loaded.features, geo: loaded.geo, templates: loaded.templates,
  license: '行程数据与核实记录：CC BY 4.0（仓库作者）。地图底图 © OpenStreetMap contributors（ODbL），不随导出分发。',
};

const pub = join(ROOT, 'public');
mkdirSync(join(pub, 'data'), { recursive: true });
mkdirSync(join(pub, 'exports'), { recursive: true });
const exportsOnly = process.argv.includes('--exports-only');
if (!exportsOnly) writeFileSync(join(pub, 'data', 'roam.json'), JSON.stringify(bundle));
const ex = join(pub, 'exports');
// 导出清单与网页共用（src/lib/io.ts 的 EXPORTERS）
for (const e of EXPORTERS) writeFileSync(join(ex, e.filename(TRIP_ID)), e.render(bundle, builtAt));
writeFileSync(join(ex, 'LICENSE.txt'), bundle.license + '\n');
console.log(`✓ 构建数据 ${bundle.build.version}（修改记录 ${applied.length} 个，跳过 ${rejected.length} 个）：${loaded.data.activities.length} 活动 / ${loaded.data.legs.length} 交通段 / ${loaded.data.claims.length} 待核实事实`);
