// 本地视觉检查：固定日期、数据、视口与本地地图测试瓦片，截图到 design/shots/。
// 用法：npm run build && npm run shots  （可加 --tiles=fail 模拟底图不可用）
import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { ROOT } from './lib/load';

function crc32(buf: Buffer) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; }
  return (crc ^ 0xffffffff) >>> 0;
}
/** 固定的本地地图测试瓦片：浅灰底 + 网格线，避免真实底图变化干扰布局比较。 */
function fixtureTile(): Buffer {
  const W = 256, raw = Buffer.alloc((W * 3 + 1) * W);
  for (let y = 0; y < W; y++) {
    raw[y * (W * 3 + 1)] = 0;
    for (let x = 0; x < W; x++) {
      const line = x % 64 === 0 || y % 64 === 0;
      const o = y * (W * 3 + 1) + 1 + x * 3;
      raw[o] = line ? 0xcf : 0xe4; raw[o + 1] = line ? 0xd3 : 0xe6; raw[o + 2] = line ? 0xcc : 0xdf;
    }
  }
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(W, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// Playwright 不作为项目依赖：优先用本地安装，否则使用全局安装（npm i -g playwright）。
async function loadPlaywright(): Promise<typeof import('playwright')> {
  try { return await import('playwright'); }
  catch { return createRequire(join(execSync('npm root -g').toString().trim(), 'x.js'))('playwright'); }
}
const { chromium } = await loadPlaywright();

const tilesFail = process.argv.includes('--tiles=fail');
const outDir = join(ROOT, 'design', 'shots');
mkdirSync(outDir, { recursive: true });
const port = 4319;
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));

const VIEWPORTS = [
  { name: 'desktop-1440', width: 1440, height: 900 },
  { name: 'tablet-768', width: 768, height: 1024 },
  { name: 'phone-390', width: 390, height: 844 },
  { name: 'phone-375', width: 375, height: 812 },
];
const PAGES = [
  { name: 'day-1225', q: '?d=2026-12-25' },
  { name: 'day-1217', q: '?d=2026-12-17' },
  { name: 'day-1225-map', q: '?d=2026-12-25&m=map&p=pl-victoria-coach', mobileOnly: true },
  { name: 'claims', q: '?v=claims' },
  { name: 'bookings', q: '?v=bookings' },
  { name: 'overview', q: '?v=overview' },
];

const browser = await chromium.launch();
const tile = fixtureTile();
const problems: string[] = [];
try {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, timezoneId: 'America/Los_Angeles', locale: 'zh-CN' });
    await ctx.route('https://tile.openstreetmap.org/**', (route) => (tilesFail ? route.abort() : route.fulfill({ body: tile, contentType: 'image/png' })));
    const page = await ctx.newPage();
    page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
    for (const p of PAGES) {
      if (p.mobileOnly && vp.width > 860) continue;
      await page.goto(`http://localhost:${port}/${p.q}`, { waitUntil: 'networkidle' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) problems.push(`${vp.name} ${p.name}: 横向溢出 ${overflow}px`);
      const clipped = await page.evaluate(() => [...document.querySelectorAll('.card-title, .stay-name, .claim-statement')]
        .filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.textContent?.slice(0, 30)));
      if (clipped.length) problems.push(`${vp.name} ${p.name}: 文字被截断 ${clipped.join(' | ')}`);
      await page.screenshot({ path: join(outDir, `${vp.name}--${p.name}${tilesFail ? '--tilesfail' : ''}.png`), fullPage: !p.name.includes('map') && !p.name.startsWith('day') });
    }
    await ctx.close();
  }
} finally {
  await browser.close();
  server.kill();
}
console.log(problems.length ? `发现问题：\n${problems.join('\n')}` : '✓ 无横向溢出、无关键文字截断、无运行时错误');
console.log(`截图位于 ${outDir}`);
