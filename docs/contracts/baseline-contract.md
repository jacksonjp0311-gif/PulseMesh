# Baseline Contract

Baselines are rolling per-sensor histories.

Default location:

```text
runs/baseline.json
```

Top-level shape:

```json
{
  "version": "0.2",
  "updated_at": "2026-06-28T00:00:00Z",
  "sensors": {
    "sensor_id": {
      "profile_id": "sensor_id",
      "label": "Sensor",
      "provider": "system",
      "samples": [],
      "stats": {}
    }
  }
}
```

## Samples

Each sample stores:

- `timestamp`
- `run_id`
- `used_live_data`
- tracked `metrics`

## Stats

Stats are computed over the retained sample window. Each tracked metric may include:

- `mean`
- `min`
- `max`
- `stdev`

## Summary Annotation

When a run is annotated with a baseline, each sensor may receive:

```json
{
  "baseline": {
    "sample_count": 12,
    "deltas": {
      "health_score": 0.05
    },
    "zscores": {
      "health_score": 1.2
    }
  }
}
```

