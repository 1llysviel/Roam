import { loadAll, validateAll } from './lib/load';

const errs = validateAll(loadAll());
if (errs.length) {
  console.error(`✕ 校验失败（${errs.length}）：`);
  for (const e of errs) console.error('  - ' + e);
  process.exit(1);
}
console.log('✓ 数据校验通过');
