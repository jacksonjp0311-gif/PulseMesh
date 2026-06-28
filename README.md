<div align="center">

# PulseMesh

### A local-first telemetry mesh for agents, operators, and observability experiments.

PulseMesh turns live APIs, local machine stats, logs, feeds, network probes, and sensor streams into a grounded operating picture: health scores, anomaly signals, baselines, history, reports, and dashboards.

[![CI](https://github.com/jacksonjp0311-gif/PulseMesh/actions/workflows/ci.yml/badge.svg)](https://github.com/jacksonjp0311-gif/PulseMesh/actions/workflows/ci.yml)
![Python](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Local First](https://img.shields.io/badge/local--first-telemetry-0f766e)

</div>

---

## The Idea

Agents need more than prompts and memory. They need **measurable context**.

PulseMesh is a sensor layer for agent operations. It collects signals from the machine, the network, the environment, and external feeds, then normalizes them into artifacts an agent or human can inspect before acting.

It answers questions like:

- Is my local system healthy right now?
- Did network latency drift?
- Are live data sources reachable, cached, or synthetic?
- Which sensor is most anomalous?
- How does this run compare to the baseline?
- What evidence can I hand to another agent or operator?

PulseMesh is not an autonomous agent and does not claim prediction, safety, consciousness, or production monitoring readiness. It is a telemetry acquisition and summarization toolkit.

---

## What You Get

One command can produce a complete telemetry packet:

```text
runs/
  baseline.json
  history.json
  history.md
  ledger.jsonl
  demo-YYYYMMDDTHHMMSSZ/
    data/
      sensor.csv
    state/
      summary.json
    report.md
    dashboard.html
```

The primary artifact is `summary.json`: a compact, agent-readable snapshot of sensor health, anomaly score, live/fallback status, alerts, and baseline deltas.

---

## Quick Start

```powershell
git clone https://github.com/jacksonjp0311-gif/PulseMesh.git
cd PulseMesh
.\scripts\install-dev.ps1
pulsemesh demo --profiles examples\profiles.rich.json --out runs --no-plots
```

Open the emitted `dashboard_path` in your browser.

No install mode:

```powershell
$env:PYTHONPATH='src'
python -m pulsemesh.cli demo --profiles examples\profiles.rich.json --out runs --no-plots
```

---

## Demo Command

`pulsemesh demo` runs the full operator loop:

1. Validate the profile file.
2. Acquire telemetry.
3. Use live -> cache -> synthetic fallback.
4. Normalize each stream.
5. Compute health, anomaly, drift, volatility, spikes, and stability.
6. Annotate with baseline when available.
7. Update the rolling baseline.
8. Write summary JSON and per-sensor CSV.
9. Render Markdown report.
10. Render HTML dashboard.
11. Update JSON and Markdown history.
12. Print every important artifact path.

```powershell
pulsemesh demo --profiles examples\profiles.rich.json --out runs --cache-dir runs\.cache --baseline runs\baseline.json
```

---

## Providers

| Provider | Signal Type | Example Use |
|---|---|---|
| `system` | Local machine telemetry | disk, memory, battery, uptime, process count, network counters |
| `ping` | TCP latency probe | endpoint/network health |
| `goes_xray` | NOAA SWPC solar X-ray flux | space-weather pulse |
| `openmeteo` | Weather telemetry | temperature, wind, pressure, precipitation |
| `openmeteo_air` | Air quality | AQI and pollutant variables |
| `usgs_earthquake` | Earthquake magnitudes | regional geophysical pulse |
| `csv` | Local sensor CSV | lab exports, spreadsheets, simple logs |
| `jsonl` | Local log tail | error counts, numeric log fields |
| `rss` | RSS/Atom feed pulse | feed activity or keyword counts |
| `github` | GitHub repo telemetry | stars, forks, issues, commit pulse |
| `mqtt` | MQTT snapshot | IoT streams, optional `paho-mqtt` |
| `serial` | Serial snapshot | Arduino/hardware streams, optional `pyserial` |
| `synthetic` | Deterministic fallback | offline demos and resilient runs |

---

## Commands

| Command | Purpose |
|---|---|
| `pulsemesh demo` | Run the complete workflow and emit artifact paths |
| `pulsemesh run` | Run one telemetry mesh |
| `pulsemesh watch` | Run repeatedly on an interval |
| `pulsemesh dashboard` | Render self-contained HTML dashboard |
| `pulsemesh report` | Render Markdown report |
| `pulsemesh compare` | Compare two run summaries |
| `pulsemesh baseline` | Update rolling baseline |
| `pulsemesh history` | Summarize recent runs from `ledger.jsonl` |
| `pulsemesh validate` | Validate profile or summary JSON shape |
| `pulsemesh providers` | List supported providers |

---

## AGNT Plugin

PulseMesh also ships an AGNT plugin bridge in [agnt-plugin](agnt-plugin). It exposes PulseMesh as a tool surface for agent workflows:

| AGNT Tool | Purpose |
|---|---|
| `pulsemesh-demo` | Run the full telemetry workflow |
| `pulsemesh-run` | Run a selected profile |
| `pulsemesh-status` | Summarize latest mesh health, alerts, fallback use, and highest anomaly |
| `pulsemesh-gate` | Return `go`, `warn`, or `hold` before an agent proceeds |
| `pulsemesh-dashboard` | Render the HTML dashboard |
| `pulsemesh-compare` | Compare recent telemetry runs |
| `pulsemesh-providers` | List available telemetry providers |
| `pulsemesh-validate` | Validate profile or summary contracts |

Build the installable package:

```powershell
cd agnt-plugin
npm install
npm run build
```

The build emits `agnt-plugin/dist/pulsemesh.agnt` and vendors the PulseMesh Python core so AGNT can run the tools outside the source checkout.

---

## Metrics

Every sensor is normalized with a robust median/MAD baseline and converted into comparable metrics:

- `health_score`
- `anomaly_score`
- `coherence_avg`
- `stability_fraction`
- `volatility`
- `drift`
- `spike_count`
- `used_live_data`
- `fallback_reason`

Mesh-level summaries aggregate live/fallback counts, average health, average coherence, and the highest-anomaly sensor.

---

## Baselines And History

PulseMesh stores rolling baselines so each new run can be compared against recent behavior.

```powershell
pulsemesh baseline --summary runs\demo\state\summary.json --out runs\baseline.json
pulsemesh history --runs-dir runs --out runs\history.md --format md --limit 20
```

When a baseline is supplied, each sensor can receive:

- `baseline.deltas`
- `baseline.zscores`
- `baseline.sample_count`

This lets a run say not only "what happened now?" but "how different is now from normal?"

---

## Dashboard

The HTML dashboard is self-contained and opens directly from disk.

It includes:

- auto-refresh support
- mesh summary cards
- live/fallback badges
- alert badges
- inline SVG sparklines
- sensor detail cards
- baseline delta coloring

```powershell
pulsemesh dashboard --summary runs\demo\state\summary.json --out runs\demo\dashboard.html --refresh-seconds 60
```

---

## Contracts

PulseMesh is built around stable artifact contracts:

- [Profile contract](docs/contracts/profile-contract.md)
- [Provider result contract](docs/contracts/provider-result-contract.md)
- [Summary contract](docs/contracts/summary-contract.md)
- [Baseline contract](docs/contracts/baseline-contract.md)

Machine-readable schemas live in [schemas](schemas).

---

## Example Profiles

| File | Purpose |
|---|---|
| `examples/profiles.rich.json` | Full live/local/network demo |
| `examples/profiles.system.json` | Local system telemetry |
| `examples/profiles.ingestion.json` | JSONL, RSS, GitHub ingestion |
| `examples/profiles.local.json` | Weather/air/quake/solar mix |
| `examples/profiles.offline.json` | Deterministic offline demo |
| `examples/profiles.csv.json` | CSV sensor input |

---

## Development

```powershell
.\scripts\test.ps1
```

Manual equivalent:

```powershell
$env:PYTHONPATH='src'
python -m unittest discover -s tests -v
python -m compileall -q src tests
```

Optional extras:

```powershell
.\scripts\install-dev.ps1 -WithVisuals -WithIoT
```

---

## Roadmap

- Provider plugin interface
- Packaged releases
- Dashboard filtering and search
- Long-running service mode
- Webhook/email alert delivery
- More hardware and infrastructure integrations

---

## License

MIT

