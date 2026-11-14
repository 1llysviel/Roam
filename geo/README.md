# geo/

放置**已审核、可再分发**的 GeoJSON（真实路线或可达范围）。每个文件必须是 FeatureCollection，并带 `roam` 元数据：

```json
{ "type": "FeatureCollection", "features": [...],
  "roam": { "source": "数据来源", "license": "许可", "generated_at": "2026-11-20T10:00:00Z",
            "query": { "origin_place_id": "pl-...", "direction": "depart_from", "mode": "walk", "minutes": 15, "date": "2026-12-25", "time": "15:00" } } }
```

交通段要显示真实路径时，在该 leg 上写 `route_precision: actual_network` 与 `route_geojson: 文件名.geojson`。没有文件时保持 `schematic`。当前为空。
