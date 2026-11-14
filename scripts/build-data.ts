// 校验主数据 → 合并为 public/data/roam.json → 生成 public/exports/*。本地与 Actions 使用同一命令。
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { loadAll, validateAll, ROOT, TRIP_ID } from './lib/load';
import type { Bundle } from '../src/lib/model';
import { SCHEMA_VERSION } from '../src/lib/model';
import { activitiesCsv, bookingsCsv, claimsCsv, exportPackage, toIcs } from '../src/lib/exporters';

const loaded = loadAll();
const errs = validateAll(loaded);
if (errs.length) { console.error(errs.join('\n')); process.exit(1); }

let commit: string | null = process.env.GITHUB_SHA ?? null;
if (!commit) { try { commit = execSync('git rev-parse HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { commit = null; } }
const pkgVersion = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).version;
const builtAt = new Date().toISOString();

const bundle: Bundle = {
  schema_version: SCHEMA_VERSION,
  build: { version: `${pkgVersion}+${commit ? commit.slice(0, 7) : 'local'}`, built_at: builtAt, commit },
  data: loaded.data, sources: loaded.sources, reviews: loaded.reviews, checks: loaded.checks,
  features: loaded.features, geo: loaded.geo,
  license: '行程数据与核实记录：CC BY 4.0（仓库作者）。地图底图 © OpenStreetMap contributors（ODbL），不随导出分发。',
};

const pub = join(ROOT, 'public');
mkdirSync(join(pub, 'data'), { recursive: true });
mkdirSync(join(pub, 'exports'), { recursive: true });
const exportsOnly = process.argv.includes('--exports-only');
if (!exportsOnly) writeFileSync(join(pub, 'data', 'roam.json'), JSON.stringify(bundle));
const ex = join(pub, 'exports');
writeFileSync(join(ex, `${TRIP_ID}.json`), JSON.stringify(exportPackage(bundle, builtAt), null, 2));
writeFileSync(join(ex, `${TRIP_ID}-itinerary.csv`), activitiesCsv(bundle));
writeFileSync(join(ex, `${TRIP_ID}-bookings.csv`), bookingsCsv(bundle));
writeFileSync(join(ex, `${TRIP_ID}-claims.csv`), claimsCsv(bundle));
writeFileSync(join(ex, `${TRIP_ID}.ics`), toIcs(bundle, builtAt));
writeFileSync(join(ex, 'LICENSE.txt'), bundle.license + '\n');
console.log(`✓ 构建数据 ${bundle.build.version}：${loaded.data.activities.length} 活动 / ${loaded.data.legs.length} 交通段 / ${loaded.data.claims.length} 待核实事实`);
