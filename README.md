# Roam

同行共享的旅行计划站：逐日行程、地图、来源核实与预订待办。纯静态，部署在 GitHub Pages，**运行和维护费用为零**：不需要后端、数据库、第三方账户或 API key。

首个行程：**2026-12-11 → 12-25 英国冬季旅行**（伦敦 · 剑桥 · 约克 · 杜伦 · Lumley Castle · Beamish Hall · 爱丁堡 · 牛津 · 返程）。

> 第一版（v0.1）。每日城市分配与活动顺序为**初稿**，预订状态全部为「未知」，所有事实均为「未核实」。请同行对照原始聊天确认后在 `data/trips/uk-2026-12.yaml` 中修正。

## 站点

- 线上：`https://1llysviel.github.io/roam/`（启用 Pages 后可用）
- 视图：`行程`（日期导航 + 当天卡片 + 地图）· `核实`（事实、来源、历史）· `预订`（待办与住宿空缺）· `总览`（覆盖率、有效核实率、预订完成率、关键缺口、扩展开关）· `打印版`
- 链接带日期 / 视图 / 地点参数，例如 `?d=2026-12-25&p=pl-victoria-coach`，可以直接发给同行，刷新不会 404。

## 首次启用（仅需一次）

1. **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
2. **Settings → Actions → General → Workflow permissions** 选 **Read and write permissions**（每日来源检查需要写入 `history/checks.json`；不开也能用，只是检查结果不会写回，只出报告）。
3. 在 **Actions** 页手动运行一次 *Build & deploy site*（或推送任意提交）。

## 本地运行

无需 `.env` 或任何 key：

```bash
npm ci
```

```bash
npm run dev
```

| 命令 | 作用 |
| --- | --- |
| `npm run validate` | JSON Schema + 引用完整性 + 真实性约定校验 |
| `npm test` | 单元测试（Node 内置 test runner） |
| `npm run build` | 生成 `public/data/roam.json`、导出文件，并构建静态站到 `dist/` |
| `npm run export` | 仅生成导出：JSON 包 / CSV / ICS |
| `npm run check:sources` | 检查已登记的官方来源（Actions 每日运行同一命令） |
| `npm run shots` | 本地 Playwright 截图（1440 / 768 / 390 / 375），需全局安装 Playwright |

## 能力一览

| 默认可用 | 接口保留、默认关闭 |
| --- | --- |
| 逐日行程、候选与建议时间区分 | 路线计算 `routeCalculation` |
| Leaflet + OSM 标准瓦片地图、编号标记、行程连接示意线 | 等时圈计算 `isochroneCalculation` |
| 来源详情、事实状态（未核实/已核实/待复核/冲突/无效）、新鲜度 | 公交路由 `transitRouting` |
| 每日自动检查登记来源（变化 → 待复核，不自动改事实） | 在线地理编码 `onlineGeocoding` |
| 预订待办、住宿空缺、统计与点击定位 | AI 提取 `aiExtraction` |
| Apple / Google 地图外部导航链接 | |
| 本地 GeoJSON 导入（仅当前设备）与校验 | |
| JSON / CSV / ICS 导出、打印版 | |

开关在 `config/features.json`，接口在 `providers/`，关闭时不会产生任何对应网络请求（有测试覆盖）。

## 目录

```
data/trips/      行程主数据（YAML）        data/sources/   来源登记
history/         reviews.yaml 人工复核 · checks.json 自动检查状态（唯一写入者：check-sources）
schemas/         JSON Schema               geo/            已审核的路线 / 范围 GeoJSON（需声明来源与许可）
src/             React + TypeScript 前端   scripts/        校验、构建、导出、来源检查、截图
providers/       扩展接口与关闭实现         tests/          单元测试
design/          视觉规格、审查记录、基准截图  docs/           编辑、运维、迁移与 TODO 状态
```

## 文档

- [编辑数据与核实](docs/editing.md)
- [发布、回滚与复制为下一次旅行](docs/operations.md)
- [实施 TODO 状态](docs/TODO.md)
- [视觉规格](design/visual-spec.md) · [视觉审查记录](design/review-log.md)

## 许可

代码 MIT；行程数据与核实记录 CC BY 4.0。地图底图 © OpenStreetMap contributors（ODbL），不随导出分发。
