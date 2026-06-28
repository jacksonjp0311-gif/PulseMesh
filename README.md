# PulseMesh

PulseMesh is a local-first telemetry mesh for collecting, normalizing, comparing, and reporting signals from live APIs, local machine sensors, network probes, CSV logs, and deterministic fallback streams.

It is designed for agent workflows: every run writes structured JSON, per-sensor CSV, an append-only ledger, optional plots, alert evaluations, and Markdown reports that can be consumed by humans or automation.

## Why PulseMesh

Modern agents need grounded situational data, not just static context. PulseMesh gives an agent a repeatable way to ask:

- What changed across my environment?
- Which sensors are live, stale, cached, or synthetic?
- Which stream is most anomalous right now?
- Did system, weather, space-weather, network, or local sensor conditions drift since the last run?
- What evidence files were produced for audit or handoff?

PulseMesh does not claim prediction, safety, consciousness, autonomy, or production monitoring readiness. It is a telemetry acquisition and summarization toolkit.

## Current Capabilities

### Providers

| Provider | Purpose | Notes |
|---|---|---|
| `goes_xray` | NOAA SWPC GOES X-ray flux | Optional `transform`: `log10` or `raw` |
| `openmeteo` | Weather telemetry | Requires `lat`, `lon`; supports hourly Open-Meteo variables |
| `openmeteo_air` | Air-quality telemetry | Requires `lat`, `lon`; supports AQI and pollutant variables |
| `usgs_earthquake` | USGS earthquake magnitudes | Optional `lat`, `lon`, `radius_km`, `days`, `min_magnitude` |
| `ping` | TCP latency probe | Params: `host`, `port`, `count` |
| `system` | Local system telemetry | Variables: `cpu_load`, `process_count`, `disk_free_percent`, `disk_used_percent` |
| `csv` | Local sensor-log ingestion | Params: `path`, `value_column`, `time_column`, `unit` |
| `jsonl` | Local JSONL/log tail | Params: `path`, `value_field` or `pattern` |
| `rss` | RSS/Atom feed pulse | Params: `url`, optional `keyword` |
| `github` | GitHub repository telemetry | Params: `repo`, `metric` |
| `mqtt` | MQTT snapshot | Requires `paho-mqtt`; params: `host`, `port`, `topic` |
| `serial` | Serial snapshot | Requires `pyserial`; params: `port`, `baud` |
| `synthetic` | Deterministic demo/fallback stream | Stable fallback for offline runs |

### Commands

| Command | Purpose |
|---|---|
| `pulsemesh providers` | List provider capabilities |
| `pulsemesh run` | Run one telemetry mesh and write artifacts |
| `pulsemesh watch` | Run the mesh repeatedly on an interval |
| `pulsemesh report` | Render a Markdown report from a run summary |
| `pulsemesh dashboard` | Render a self-contained HTML dashboard from a run summary |
| `pulsemesh compare` | Compare two run summaries and write drift deltas |
| `pulsemesh baseline` | Update a rolling baseline from a summary |
| `pulsemesh validate` | Validate profile and summary JSON shape |
| `pulsemesh history` | Summarize recent runs from `ledger.jsonl` |

### Metrics

Every sensor is normalized with a median/MAD baseline and converted into comparable metrics:

- `coherence_avg`
- `stability_fraction`
- `volatility`
- `drift`
- `spike_count`
- `anomaly_score`
- `health_score`
- `used_live_data`
- `fallback_reason`

The mesh summary aggregates live/fallback counts, average health, average coherence, and the highest-anomaly stream.

## Quick Start

From the repository root:

```powershell
cd C:\Users\jacks\OneDrive\Desktop\PulseMesh
.\scripts\install-dev.ps1
pulsemesh providers
pulsemesh demo --profiles examples\profiles.rich.json --out runs --no-plots
```

Install as an editable local CLI:

```powershell
python -m pip install -e .
pulsemesh run --profiles examples\profiles.rich.json --out runs
```

Optional plotting support:

```powershell
.\scripts\install-dev.ps1 -WithVisuals
```

The `demo` command is the recommended first run. It validates profiles, runs telemetry, updates baseline, writes report/dashboard/history, and prints all artifact paths.

## Example Workflows

Run an offline deterministic mesh:

```powershell
python -m pulsemesh.cli run --profiles examples\profiles.offline.json --out runs --no-plots
```

Run live telemetry with cache fallback:

```powershell
python -m pulsemesh.cli run --profiles examples\profiles.local.json --out runs --cache-dir runs\.cache
```

Run a richer mesh with local system and network probes:

```powershell
python -m pulsemesh.cli run --profiles examples\profiles.rich.json --out runs --cache-dir runs\.cache
```

Run with baseline annotation and update:

```powershell
python -m pulsemesh.cli run --profiles examples\profiles.rich.json --out runs --baseline runs\baseline.json --update-baseline runs\baseline.json
```

Watch mode:

```powershell
python -m pulsemesh.cli watch --profiles examples\profiles.rich.json --out runs --interval 300 --iterations 12 --no-plots
```

Create a Markdown report:

```powershell
python -m pulsemesh.cli report --summary runs\rich-demo\state\summary.json --out runs\rich-demo\report.md
```

Create an HTML dashboard:

```powershell
python -m pulsemesh.cli dashboard --summary runs\rich-demo\state\summary.json --out runs\rich-demo\dashboard.html --refresh-seconds 60
```

Summarize run history:

```powershell
python -m pulsemesh.cli history --runs-dir runs --out runs\history.md --format md --limit 20
```

Compare two runs:

```powershell
python -m pulsemesh.cli compare --before runs\run-a\state\summary.json --after runs\run-b\state\summary.json --out runs\compare-a-b.json
```

Validate a profile file:

```powershell
python -m pulsemesh.cli validate --profiles examples\profiles.rich.json
```

## Profile Format

Profiles are JSON objects under a top-level `profiles` array.

```json
{
  "profiles": [
    {
      "id": "cloudflare_latency",
      "label": "Cloudflare TCP Latency",
      "provider": "ping",
      "host": "1.1.1.1",
      "port": 443,
      "count": 12,
      "alerts": [
        {
          "metric": "mean",
          "op": ">=",
          "threshold": 500,
          "severity": "warning",
          "message": "TCP probe latency average is high."
        }
      ]
    }
  ]
}
```

Unknown fields are preserved as provider parameters, so provider-specific options can live directly in each profile.

## Contracts

Stable artifact contracts are documented in [docs/contracts](docs/contracts/README.md):

- profile contract
- provider result contract
- summary contract
- baseline contract

Machine-readable schemas live in [schemas](schemas).

## Output Layout

```text
runs/
  ledger.jsonl
  .cache/
    profile_id.json
  pulse-YYYYMMDDTHHMMSSZ/
    data/
      profile_id.csv
    visuals/
      profile_id.png
    state/
      summary.json
    report.md
    dashboard.html
```

The summary file is the primary agent-facing artifact.

## Fallback Model

PulseMesh is designed to keep downstream workflows moving:

1. Try live provider acquisition.
2. If live acquisition fails and cache exists, use last-good cached data.
3. If no cache exists, emit deterministic synthetic telemetry.

Every fallback is explicitly marked in `used_live_data` and `fallback_reason`.

## Baselines

Baselines are rolling per-sensor histories stored as JSON. They let a run answer not only "what happened now?" but also "how far is this from recent behavior?"

```powershell
python -m pulsemesh.cli baseline --summary runs\rich-demo\state\summary.json --out runs\baseline.json
python -m pulsemesh.cli run --profiles examples\profiles.rich.json --out runs --baseline runs\baseline.json --update-baseline runs\baseline.json
```

When a baseline is supplied, each sensor receives `baseline.deltas` and `baseline.zscores` for tracked metrics such as health, anomaly, coherence, volatility, drift, and mean value.

## Dashboard

The HTML dashboard is self-contained and works from the local filesystem. It includes:

- auto-refresh support
- mesh summary cards
- alert badges
- live/fallback labels
- inline SVG sparklines from per-sensor CSV artifacts
- sensor detail cards
- baseline delta coloring

## Ingestion Expansion

`examples\profiles.ingestion.json` shows JSONL, RSS, and GitHub profile examples. MQTT and serial providers are available when their optional packages are installed:

```powershell
python -m pip install -e ".[mqtt,serial]"
```

## Development

```powershell
.\scripts\test.ps1
```

See [docs/operator-guide.md](docs/operator-guide.md) for install and operating workflows.

## Project Status

PulseMesh is currently a local research/operator tool. The next professional milestones are:

- provider plugin interface
- packaged releases
- richer HTML dashboard filtering/search
- long-running service mode
- webhook/email alert delivery
