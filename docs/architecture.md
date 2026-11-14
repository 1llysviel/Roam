# 模板与拼接

三处用同一个思路：**固定格式写成模板 / 清单，变化的数据在运行时填进去再拼接**。

和 Shadowrocket-ADBlock-Rules-Forever 的 `factory/template` + `build_confs.py`、TrendRadar 的提示词 / 推送模板一样，这里把「固定格式」放进模板，把「每次不同的数据」在运行时填进去再拼接。

## 1. 核实项模板（数据侧）

```
templates/claims.yaml        模板：按活动类型 / 交通方式定义核实项，正文带 {{占位符}}
        │  (构建时 Schema 校验，随 roam.json 发布)
        ▼
src/lib/templates.ts         templateContext()   项目 → 占位符取值（名称、日期、星期、起终点、方式、出发时间…）
                             applicableTemplates() 按类型与 requires 过滤
                             render()             填充 {{占位符}}
                             composeClaimOps()    拼接：勾选的核实项 + 来源 → add_source / add_claim 编辑操作
        ▼
网页编辑（新增活动 / 交通、或卡片上「＋ 核实项」）→ 本地草稿 → data/edits/*.json
        ▼
scripts/lib/load.ts applyEditFiles()  构建时按序应用，每批完整校验
```

要改核实项的措辞、默认勾选、有效期，或者给新的活动类型加模板，只需改 `templates/claims.yaml`，不用改代码。占位符列表写在该文件顶部。

## 2. GitHub Actions（流程侧）

```
.github/actions/setup/action.yml     公共步骤模板：setup-node + npm ci
.github/workflows/_deploy-pages.yml  可复用模板：build → upload-pages-artifact → deploy-pages（workflow_call）

pages.yml          = verify（setup → validate → test） + 引用 _deploy-pages
check-sources.yml  = check（setup → check:sources → 提交 history/checks.json） + 有变化时引用 _deploy-pages(ref: main)
```

新增一个需要发布网站的工作流时，只要拼一个 job：`uses: ./.github/workflows/_deploy-pages.yml`，并在调用方授予 `pages: write` 与 `id-token: write`。

## 3. 进出通道（统一的变更包）

所有需要更新到云端的内容，都变成同一种**变更包**（`roam-edits`，一批编辑操作），走同一条路：

```
            ┌ 网页编辑（活动、交通、住宿、预订、核实、附带核实项）
  进 ───────┤ 导入文件 ─ src/lib/io.ts INBOUND 适配器：
            │             roam-edits  → 原样合并（已发布 / 已提交的批次不重复）
            │             roam-export → 与当前数据比对，只把差异转成操作（不删除）
            │             GeoJSON     → 元数据完整：add_geo（可共享）；不完整：仅本设备预览
            └→ 本地草稿 → 「提交给同行」→ data/edits/ed-….json → 构建 applyEditFiles() 逐批完整校验 → 发布

  出 ─────── src/lib/io.ts EXPORTERS 清单：完整导出包 / 行程 CSV / 预订 CSV / 核实 CSV / ICS
             构建脚本写出「已发布版本」，网页按同一清单生成「当前预览（含草稿）」

  送 ─────── githubNewFileUrl()（预填 GitHub 新建文件页，过长时改用剪贴板）· downloadText()（发给维护者代录）
```

编辑操作的种类集中在 `src/lib/edits.ts`（`set` 白名单字段、`add_place`、`select_stay`、`add_activity`、`add_leg`、`add_source`、`add_claim`、`add_review`、`add_geo`），浏览器预览与构建使用同一个 `applyChange()`。

新增一种可导入的文件：在 `INBOUND` 里加一个适配器（`detect` + `toOps`）。新增一种导出格式：在 `EXPORTERS` 里加一项。两边都不需要改提交、校验和发布流程。

**例外**：`history/checks.json` 由来源检查定时任务独占写入（单一写入者、机器生成、高频），不走变更包，避免与同行提交互相冲突。
