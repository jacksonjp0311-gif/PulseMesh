# PulseMesh

PulseMesh is an adaptive telemetry mesh for agents and operators.

It fetches multiple live sensor streams, falls back to deterministic synthetic data when a source is unavailable, normalizes each stream into comparable change/stability metrics, and writes agent-readable artifacts.

## What It Does

- Acquires telemetry from multiple providers:
  - NOAA SWPC GOES X-ray flux
  - Open-Meteo weather
  - Open-Meteo air quality
  - USGS earthquake events
  - local CSV sensor logs
  - deterministic synthetic fallback/demo sensors
- Converts every stream into a common shape:
  - raw values
  - robust normalized values
  - first-difference change signal
  - stability/coherence score: `1 / (1 + abs(delta))`
- Emits:
  - `summary.json`
  - per-sensor CSV files
  - optional PNG plots when `matplotlib` is installed
  - append-only `ledger.jsonl`

PulseMesh is a telemetry and summarization tool. It does not claim prediction, safety, consciousness, autonomy, or production monitoring readiness.

## Quick Start

```powershell
cd C:\Users\jacks\OneDrive\Desktop\PulseMesh
python -m pulsemesh.cli providers
python -m pulsemesh.cli run --profiles examples\profiles.offline.json --out runs --no-plots
```

For live telemetry:

```powershell
python -m pulsemesh.cli run --profiles examples\profiles.local.json --out runs
```

If a live provider fails, PulseMesh records the fallback reason and substitutes a deterministic synthetic stream so downstream agents still receive a complete artifact set.

## Install For Local CLI

```powershell
cd C:\Users\jacks\OneDrive\Desktop\PulseMesh
python -m pip install -e .
pulsemesh run --profiles examples\profiles.local.json --out runs
```

Plots are optional:

```powershell
python -m pip install -e ".[visuals]"
```

## Profile Format

```json
{
  "profiles": [
    {
      "id": "local_temperature",
      "label": "Local Temperature",
      "provider": "openmeteo",
      "lat": 40.7128,
      "lon": -74.006,
      "variable": "temperature_2m"
    }
  ]
}
```

## Provider Notes

- `goes_xray`: NOAA SWPC GOES primary X-ray flux. Optional `transform`: `log10` or `raw`.
- `openmeteo`: hourly weather. Requires `lat`, `lon`, and an hourly variable.
- `openmeteo_air`: air quality. Requires `lat`, `lon`, and an hourly variable.
- `usgs_earthquake`: earthquake event magnitudes. Optional `lat`, `lon`, `radius_km`, `days`, `min_magnitude`.
- `csv`: arbitrary local sensor CSV. Required `path`; optional `value_column`, `time_column`, `unit`.
- `synthetic`: deterministic offline/demo signal.

## Output Shape

Each run writes:

```text
runs/
  ledger.jsonl
  pulse-YYYYMMDDTHHMMSSZ/
    data/
      sensor_id.csv
    visuals/
      sensor_id.png
    state/
      summary.json
```

The summary contains mesh-level health plus per-sensor metrics:

- `coherence_avg`
- `stability_fraction`
- `volatility`
- `drift`
- `spike_count`
- `anomaly_score`
- `health_score`
- `used_live_data`
- `fallback_reason`

## Development

```powershell
python -m pip install -e ".[dev]"
python -m pytest
```
