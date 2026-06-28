# PulseMesh AGNT Plugin

PulseMesh for AGNT is a local-first telemetry sensorium. It gives an agent a measured view of the machine, network, and live data environment before it acts.

The plugin wraps the PulseMesh Python engine with AGNT tools that emit structured JSON, reports, dashboards, baselines, comparisons, and gate decisions.

## Tool Surface

| Tool | Purpose |
|---|---|
| `pulsemesh-demo` | Run the full telemetry workflow and emit all artifact paths. |
| `pulsemesh-run` | Run a selected telemetry profile. |
| `pulsemesh-status` | Read the latest run and summarize mesh health. |
| `pulsemesh-gate` | Return `go`, `warn`, or `hold` for agent workflows. |
| `pulsemesh-dashboard` | Render a self-contained HTML dashboard. |
| `pulsemesh-compare` | Compare two summaries or the two most recent runs. |
| `pulsemesh-providers` | List supported telemetry providers. |
| `pulsemesh-validate` | Validate profile or summary JSON contracts. |

## Why It Matters

Agents should not operate from prompt context alone. PulseMesh turns measurable signals into an operational packet:

- local CPU, memory, disk, battery, uptime, and network counters
- TCP latency checks
- live API, cache, and synthetic fallback state
- anomaly scores, health scores, drift, volatility, and stability
- critical/warning alerts
- dashboard, Markdown report, history, and baseline artifacts

## Local Development

From the PulseMesh repo:

```powershell
cd agnt-plugin
npm install
node pulsemesh-agnt.js demo --out runs/agnt
node pulsemesh-agnt.js status --runs-dir runs/agnt
node pulsemesh-agnt.js gate --runs-dir runs/agnt
```

## Build AGNT Package

```powershell
cd agnt-plugin
npm install
npm run build
```

The build writes:

```text
agnt-plugin/dist/pulsemesh.agnt
```

The package vendors the PulseMesh Python core so the AGNT plugin can run outside the source repository.

## Gate Decisions

`pulsemesh-gate` turns telemetry into a compact workflow signal:

```json
{
  "decision": "warn",
  "reasons": [
    "1 sensor(s) used fallback data"
  ]
}
```

Use `go` to proceed, `warn` to proceed with context, and `hold` to pause higher-risk work until the operator or another agent inspects the environment.
