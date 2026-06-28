from __future__ import annotations

import html
from pathlib import Path

from .util import load_json


def write_html_dashboard(summary_path: Path, out_path: Path) -> None:
    summary = load_json(summary_path)
    mesh = summary.get("mesh", {})
    sensors = summary.get("sensors", [])
    alerts = summary.get("alerts", [])
    rows = []
    for sensor in sensors:
        metrics = sensor.get("metrics", {})
        baseline = sensor.get("baseline", {})
        health = float(metrics.get("health_score", 0.0))
        status = "good" if health >= 0.75 else "warn" if health >= 0.45 else "bad"
        rows.append(
            "<tr>"
            f"<td>{html.escape(str(sensor.get('label', sensor.get('profile_id'))))}</td>"
            f"<td>{html.escape(str(sensor.get('provider', '')))}</td>"
            f"<td>{'live' if sensor.get('used_live_data') else 'fallback'}</td>"
            f"<td class='{status}'>{health:.3f}</td>"
            f"<td>{float(metrics.get('anomaly_score', 0.0)):.3f}</td>"
            f"<td>{float(metrics.get('coherence_avg', 0.0)):.3f}</td>"
            f"<td>{float(metrics.get('drift', 0.0)):.3f}</td>"
            f"<td>{_baseline_cell(baseline)}</td>"
            "</tr>"
        )
    alert_items = "\n".join(
        f"<li><strong>{html.escape(str(a.get('severity', 'warning')))}</strong> "
        f"{html.escape(str(a.get('profile_id', '')))}: {html.escape(str(a.get('message', '')))}</li>"
        for a in alerts
    ) or "<li>No alerts fired.</li>"
    doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PulseMesh Dashboard - {html.escape(str(summary.get('run_id', 'run')))}</title>
  <style>
    body {{ margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #f6f8fb; color: #172033; }}
    header {{ background: #102033; color: white; padding: 24px 32px; }}
    main {{ max-width: 1180px; margin: 0 auto; padding: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }}
    .card {{ background: white; border: 1px solid #d8e0ea; border-radius: 8px; padding: 16px; }}
    .label {{ color: #65758b; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .value {{ font-size: 28px; font-weight: 650; margin-top: 6px; }}
    table {{ width: 100%; border-collapse: collapse; background: white; border: 1px solid #d8e0ea; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid #e5ebf2; text-align: left; font-size: 14px; }}
    th {{ background: #edf2f7; color: #243246; }}
    .good {{ color: #047857; font-weight: 650; }}
    .warn {{ color: #b45309; font-weight: 650; }}
    .bad {{ color: #b91c1c; font-weight: 650; }}
    section {{ margin-top: 24px; }}
    @media (max-width: 760px) {{ .grid {{ grid-template-columns: 1fr 1fr; }} table {{ font-size: 12px; }} }}
  </style>
</head>
<body>
  <header>
    <h1>PulseMesh Dashboard</h1>
    <div>{html.escape(str(summary.get('run_id', '')))} | {html.escape(str(summary.get('timestamp', '')))}</div>
  </header>
  <main>
    <div class="grid">
      <div class="card"><div class="label">Sensors</div><div class="value">{mesh.get('sensor_count', 0)}</div></div>
      <div class="card"><div class="label">Live</div><div class="value">{mesh.get('live_sensor_count', 0)}</div></div>
      <div class="card"><div class="label">Mesh Health</div><div class="value">{float(mesh.get('mesh_health', 0.0)):.3f}</div></div>
      <div class="card"><div class="label">Alerts</div><div class="value">{len(alerts)}</div></div>
    </div>
    <section>
      <h2>Sensors</h2>
      <table>
        <thead><tr><th>Sensor</th><th>Provider</th><th>Source</th><th>Health</th><th>Anomaly</th><th>Coherence</th><th>Drift</th><th>Baseline</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    <section>
      <h2>Alerts</h2>
      <ul>{alert_items}</ul>
    </section>
  </main>
</body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc, encoding="utf-8")


def _baseline_cell(baseline: dict) -> str:
    if not baseline:
        return "n/a"
    z = baseline.get("zscores", {}).get("health_score")
    d = baseline.get("deltas", {}).get("health_score")
    if z is None or d is None:
        return "n/a"
    return f"health Δ {float(d):+.3f}, z {float(z):+.2f}"

