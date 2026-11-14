# 编辑数据与核实

第一版协作方式：在 GitHub 上直接编辑文件或提 PR。没有 GitHub 账户的同行可以浏览网站，由维护者代录修改。浏览器里导入的 GeoJSON 只影响当前设备，不是团队同步结果。

每次推送到 `main` 都会自动校验、测试、构建并发布。校验失败时网站保持上一版。

## 改行程（`data/trips/uk-2026-12.yaml`）

- **ID 稳定**：已发布的 ID 不改名、不复用。新对象用新 ID（小写字母、数字、连字符）。
- **日期**：`"2026-12-17"` 这样写纯日期（加引号），按伦敦时间解释。精确时刻写 `"16:45"`（24 小时制，伦敦时间）。
- **时间依据**：`time.basis` / `timing_basis` 取 `proposed`（建议）、`user_stated`（用户提供）、`booked`（已订）。写 `booked` 时，关联预订必须已经是 `booked`，否则校验失败。
- **计划状态**：`plan_status` 取 `selected` / `proposed` / `candidate`。候选项用 `alternative_to` 指向被替代的活动。
- **住宿**：每晚一条 `stays`。`candidates` 是候选，`selected_place_id` 必须在候选中。提到酒店不等于已订。
- **坐标**：只写人工核对过的入口坐标，并把 `coord_source` 改为 `manual_verified`、`coord_precision` 改为 `entrance`。没有坐标就写 `coord: null` + `coord_source: none`，地点会进入「待定位」列表，不会被猜测到地图上。
- **交通段**：没有真实路线文件时 `route_precision: schematic`。`duration_min` 只填人工核实的时长。

## 预订

`status` 取 `unknown` / `not_booked` / `booked` / `cancelled` / `not_required`。

- 改成 `booked` 时必须写 `evidence`（例如「Alice 11/20 在群里确认已付款」），**不要**写订单号、邮箱、电话等私密信息：仓库是公开的，前端隐藏不能起到保护作用。
- 金额写最小单位整数：£12.50 → `amount: { currency: GBP, minor: 1250 }`。

## 核实事实

1. 每条需要核实的具体事实是一条 `claims`：写清目标日期 `target_date`、交通方向 `direction`（`A → B`）、来源 `source_ids`、有效期 `max_age_days`。
2. 人工核对官网后，在 `history/reviews.yaml` **追加**一条记录：

```yaml
  - id: rv-0001
    claim_id: cl-xmas-coach-runs
    at: "2026-11-20T10:00:00Z"
    reviewer: 你的昵称
    result: verified            # verified / needs_review / conflict / invalid
    verified_for_date: "2026-12-25"
    value: 12/25 有 Victoria → Heathrow 班次，含 16:45
    source_id: src-national-express
    evidence: 官网时刻表查询（条件：2026-12-25，Victoria → Heathrow CBS），查询于 11/20
    method: manual
```

3. 「有效核实」= 已确认 + `verified_for_date` 与目标日期一致 + 未超过 `max_age_days` + 来源没有待复核的变化。

## 每日自动检查做什么、不做什么

- 只访问 `data/sources/*.yaml` 里 `fetch: auto` 的官方链接，按域名限速，带条件请求、超时和有限重试。
- 只提取匹配 `keywords` 的正文段落并计算哈希；导航、页脚、广告变化不触发。
- 段落变化 → 生成「待复核」，相关事实显示「待复核」，**不会**自动改确认值。
- HTTP 200、哈希不变、抓取失败都**不会**重置事实确认时间；抓取失败不推断停运、闭馆或售罄。
- 只有在 Claim 上显式配置 `check_rule`（`date-explicit-open` / `service-direction-date`）且规则匹配时，才会记为「规则核实」。规则会拒绝旧年份、错误方向和只有普通营业时间的页面。第一版种子数据没有启用任何规则。
- `src-*` 中的链接目前是**线索**（`lead: true`）：首次人工核对确认页面正确后改为 `false`。
