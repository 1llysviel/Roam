import { loadAll, validateAll, applyEditFiles } from './lib/load';

const base = loadAll();
const errs = validateAll(base);
if (errs.length) {
  console.error(`✕ 主数据校验失败（${errs.length}）：`);
  for (const e of errs) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ 主数据校验通过');
const { applied, rejected } = applyEditFiles(base);
console.log(`✓ 网站修改记录：应用 ${applied.length} 个文件`);
for (const r of rejected) console.warn(`⚠ 跳过 data/edits/${r.file}：${r.errors.join('；')}`);
if (rejected.length && process.argv.includes('--strict')) process.exit(1);
