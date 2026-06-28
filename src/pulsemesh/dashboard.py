from __future__ import annotations

import html
from pathlib import Path

from .util import load_json


def write_html_dashboard(summary_path: Path, out_path: Path, refresh_seconds: int | None = None) -> None:
    summary = load_json(summary_path)
    mesh = summary.get("mesh", {})
    sensors = summary.get("sensors", [])
    alerts = summary.get("alerts", [])
    rows = []
    detail_cards = []
    for sensor in sensors:
        metrics = sensor.get("metrics", {})
        baseline = sensor.get("baseline", {})
        health = float(metrics.get("health_score", 0.0))
        status = "good" if health >= 0.75 else "warn" if health >= 0.45 else "bad"
        source = "live" if sensor.get("used_live_data") else "fallback"
        alert_count = len(sensor.get("alerts", []))
        rows.append(
            "<tr>"
            f"<td><a href='#{_anchor(sensor)}'>{html.escape(str(sensor.get('label', sensor.get('profile_id'))))}</a></td>"
            f"<td>{html.escape(str(sensor.get('provider', '')))}</td>"
            f"<td><span class='badge {source}'>{source}</span></td>"
            f"<td class='{status}'>{health:.3f}</td>"
            f"<td>{float(metrics.get('anomaly_score', 0.0)):.3f}</td>"
            f"<td>{float(metrics.get('coherence_avg', 0.0)):.3f}</td>"
            f"<td>{_sparkline_from_csv(sensor)}</td>"
            f"<td>{_baseline_cell(baseline)}</td>"
            f"<td>{_alert_badge(alert_count)}</td>"
            "</tr>"
        )
        detail_cards.append(_detail_card(sensor, status))
    alert_items = "\n".join(
        f"<li><strong>{html.escape(str(a.get('severity', 'warning')))}</strong> "
        f"{html.escape(str(a.get('profile_id', '')))}: {html.escape(str(a.get('message', '')))}</li>"
        for a in alerts
    ) or "<li>No alerts fired.</li>"
    refresh = f"<meta http-equiv='refresh' content='{int(refresh_seconds)}'>" if refresh_seconds else ""
    doc = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  {refresh}
  <title>PulseMesh Dashboard - {html.escape(str(summary.get('run_id', 'run')))}</title>
  <style>
    body {{ margin: 0; font-family: Segoe UI, Arial, sans-serif; background: #f6f8fb; color: #172033; }}
    header {{ background: #102033; color: white; padding: 24px 32px; }}
    main {{ max-width: 1220px; margin: 0 auto; padding: 24px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }}
    .card, .detail {{ background: white; border: 1px solid #d8e0ea; border-radius: 8px; padding: 16px; }}
    .label {{ color: #65758b; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }}
    .value {{ font-size: 28px; font-weight: 650; margin-top: 6px; }}
    table {{ width: 100%; border-collapse: collapse; background: white; border: 1px solid #d8e0ea; }}
    th, td {{ padding: 10px 12px; border-bottom: 1px solid #e5ebf2; text-align: left; font-size: 14px; vertical-align: middle; }}
    th {{ background: #edf2f7; color: #243246; position: sticky; top: 0; }}
    a {{ color: #1d4ed8; text-decoration: none; }}
    .good {{ color: #047857; font-weight: 650; }}
    .warn {{ color: #b45309; font-weight: 650; }}
    .bad {{ color: #b91c1c; font-weight: 650; }}
    .badge {{ display: inline-block; border-radius: 999px; padding: 3px 8px; font-size: 12px; font-weight: 650; }}
    .badge.live {{ background: #dcfce7; color: #166534; }}
    .badge.fallback {{ background: #fee2e2; color: #991b1b; }}
    .badge.alert {{ background: #fef3c7; color: #92400e; }}
    .badge.none {{ background: #e2e8f0; color: #475569; }}
    .spark {{ width: 120px; height: 32px; }}
    .details {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }}
    .kv {{ display: grid; grid-template-columns: 150px 1fr; gap: 6px; font-size: 13px; }}
    section {{ margin-top: 24px; }}
    code {{ background: #edf2f7; padding: 2px 5px; border-radius: 4px; }}
    @media (max-width: 860px) {{ .grid, .details {{ grid-template-columns: 1fr; }} table {{ font-size: 12px; }} }}
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
      <h2>Sensor Overview</h2>
      <table>
        <thead><tr><th>Sensor</th><th>Provider</th><th>Source</th><th>Health</th><th>Anomaly</th><th>Coherence</th><th>Trend</th><th>Baseline</th><th>Alerts</th></tr></thead>
        <tbody>{''.join(rows)}</tbody>
      </table>
    </section>
    <section>
      <h2>Alerts</h2>
      <ul>{alert_items}</ul>
    </section>
    <section>
      <h2>Sensor Details</h2>
      <div class="details">{''.join(detail_cards)}</div>
    </section>
  </main>
</body>
</html>
"""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(doc, encoding="utf-8")


def _anchor(sensor: dict) -> str:
    return "sensor-" + "".join(ch if ch.isalnum() else "-" for ch in str(sensor.get("profile_id", "sensor")))


def _alert_badge(count: int) -> str:
    if count:
        return f"<span class='badge alert'>{count}</span>"
    return "<span class='badge none'>0</span>"


def _baseline_cell(baseline: dict) -> str:
    if not baseline:
        return "n/a"
    z = baseline.get("zscores", {}).get("health_score")
    d = baseline.get("deltas", {}).get("health_score")
    if z is None or d is None:
        return "n/a"
    cls = "good" if float(d) >= 0 else "bad"
    return f"<span class='{cls}'>health delta {float(d):+.3f}, z {float(z):+.2f}</span>"


def _sparkline_from_csv(sensor: dict) -> str:
    csv_path = sensor.get("artifacts", {}).get("csv")
    values: list[float] = []
    if csv_path:
        try:
            lines = Path(csv_path).read_text(encoding="utf-8").splitlines()[1:]
            for line in lines[-48:]:
                parts = line.split(",")
                if len(parts) >= 2:
                    values.append(float(parts[1]))
        except Exception:
            values = []
    if not values:
        return ""
    lo = min(values)
    hi = max(values)
    span = hi - lo if hi > lo else 1.0
    points = []
    width = 120
    height = 32
    for i, value in enumerate(values):
        x = i * width / max(1, len(values) - 1)
        y = height - ((value - lo) / span * (height - 4) + 2)
        points.append(f"{x:.1f},{y:.1f}")
    return f"<svg class='spark' viewBox='0 0 {width} {height}'><polyline fill='none' stroke='#2563eb' stroke-width='2' points='{' '.join(points)}'/></svg>"


def _detail_card(sensor: dict, status: str) -> str:
    metrics = sensor.get("metrics", {})
    fallback = sensor.get("fallback_reason") or "none"
    return (
        f"<div class='detail' id='{_anchor(sensor)}'>"
        f"<h3>{html.escape(str(sensor.get('label', sensor.get('profile_id'))))}</h3>"
        "<div class='kv'>"
        f"<div>Provider</div><div>{html.escape(str(sensor.get('provider', '')))}</div>"
        f"<div>Source</div><div>{'live' if sensor.get('used_live_data') else 'fallback'}</div>"
        f"<div>Health</div><div class='{status}'>{float(metrics.get('health_score', 0.0)):.4f}</div>"
        f"<div>Anomaly</div><div>{float(metrics.get('anomaly_score', 0.0)):.4f}</div>"
        f"<div>Volatility</div><div>{float(metrics.get('volatility', 0.0)):.4f}</div>"
        f"<div>Fallback</div><div>{html.escape(str(fallback))}</div>"
        f"<div>CSV</div><div><code>{html.escape(str(sensor.get('artifacts', {}).get('csv', '')))}</code></div>"
        "</div></div>"
    )

