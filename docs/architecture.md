# 模板与拼接

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
