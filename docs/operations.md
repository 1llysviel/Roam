# 运维：发布、回滚、迁移

## 发布

- 推送到 `main` → 工作流 *Build & deploy site*：`npm ci → validate → test → build → 部署 Pages`。
- 站点子路径从仓库名推导（当前为 `/Roam/`）；改仓库名后无需改代码。需要自定义时设置环境变量 `ROAM_BASE`。
- 每日 *Check sources*：检查来源 → 有变化才提交 `history/checks.json` → 在同一工作流里构建并部署（`GITHUB_TOKEN` 推送不会触发其他工作流）。
- 定时任务可能延迟；公开仓库 60 天无活动时 GitHub 会停用定时任务，需要在 Actions 页重新启用。网站按确认时间判断过期，不会因为检查停了就一直显示「已核实」。

## 回滚

- 数据改错：在 GitHub 上 revert 对应提交，推送后自动重新发布。
- 只想重发某个旧版本：在 Actions 中找到该提交的 *Build & deploy site* 运行，点 *Re-run jobs*。

## 本地静态运行（不依赖 GitHub）

```bash
npm ci && npm run build
```

```bash
npx vite preview --port 4173
```

`dist/` 是纯静态文件，可以放到任何静态服务器的任意子目录（构建前设置 `ROAM_BASE=/子目录/`）。

## 导出与迁移

- 构建时生成 `public/exports/`：`uk-2026-12.json`（完整导出包：数据、来源、复核与检查历史、GeoJSON、许可）、`*-itinerary.csv`、`*-bookings.csv`、`*-claims.csv`、`*.ics`。网站页脚有下载链接。
- 导出包不包含底图瓦片、受限网页、私人订单或凭据。
- 导出包带 `schema_version`；导入时由 `src/lib/exporters.ts` 的 `MIGRATIONS` 逐级迁移。往返一致性有测试覆盖。
- 在线地图需要网络；导出的文字行程与数据可以离线保存，不提供完整离线地图。

## 复制为下一次旅行

1. 复制 `data/trips/uk-2026-12.yaml` 与 `data/sources/uk-2026-12.yaml` 为新的 `<trip-id>.yaml`，改内容。
2. 清空 `history/reviews.yaml` 的 `reviews` 与 `history/checks.json`（保留结构）。
3. 设置环境变量 `ROAM_TRIP=<trip-id>`（或把 `scripts/lib/load.ts` 中 `TRIP_ID` 的默认值改掉）；导出文件名随 trip id 自动变化。
4. `npm run validate && npm test && npm run build`。
