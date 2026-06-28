# Summary Contract

The run summary is the primary agent-facing artifact.

Location:

```text
runs/<run-id>/state/summary.json
```

Top-level shape:

```json
{
  "run_id": "pulse-20260628T000000Z",
  "timestamp": "2026-06-28T00:00:00Z",
  "mesh": {},
  "sensors": [],
  "alerts": []
}
```

## Mesh Fields

| Field | Meaning |
|---|---|
| `sensor_count` | Number of sensors in the run. |
| `live_sensor_count` | Sensors using live provider data. |
| `fallback_sensor_count` | Sensors using cache or synthetic fallback. |
| `mesh_health` | Average sensor health. |
| `mesh_coherence` | Average sensor coherence. |
| `highest_anomaly` | Compact descriptor for the highest anomaly sensor. |

## Sensor Fields

Each sensor object includes:

- identity: `profile_id`, `provider`, `label`, `sensor_name`
- source: `used_live_data`, `fallback_reason`, `source_url`
- metrics: `metrics`
- artifacts: `artifacts.csv`, optional `artifacts.plot`
- alerts: `alerts`
- optional baseline: `baseline`

## Core Metrics

- `mean`
- `median`
- `min`
- `max`
- `stdev`
- `mad`
- `coherence_avg`
- `stability_fraction`
- `volatility`
- `drift`
- `spike_count`
- `anomaly_score`
- `health_score`

