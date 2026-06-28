from __future__ import annotations

from pathlib import Path
from typing import Any

from .util import load_json, now_iso, write_json


def load_summary(path: Path) -> dict[str, Any]:
    obj = load_json(path)
    if not isinstance(obj, dict) or "mesh" not in obj or "sensors" not in obj:
        raise ValueError(f"not a PulseMesh summary: {path}")
    return obj


def compare_summaries(before_path: Path, after_path: Path) -> dict[str, Any]:
    before = load_summary(before_path)
    after = load_summary(after_path)
    before_sensors = {s["profile_id"]: s for s in before.get("sensors", [])}
    after_sensors = {s["profile_id"]: s for s in after.get("sensors", [])}
    all_ids = sorted(set(before_sensors) | set(after_sensors))
    sensors = []
    for sid in all_ids:
        old = before_sensors.get(sid)
        new = after_sensors.get(sid)
        if old is None:
            sensors.append({"profile_id": sid, "status": "added"})
            continue
        if new is None:
            sensors.append({"profile_id": sid, "status": "removed"})
            continue
        old_m = old.get("metrics", {})
        new_m = new.get("metrics", {})
        sensors.append({
            "profile_id": sid,
            "status": "changed",
            "health_delta": float(new_m.get("health_score", 0.0)) - float(old_m.get("health_score", 0.0)),
            "anomaly_delta": float(new_m.get("anomaly_score", 0.0)) - float(old_m.get("anomaly_score", 0.0)),
            "coherence_delta": float(new_m.get("coherence_avg", 0.0)) - float(old_m.get("coherence_avg", 0.0)),
            "live_data_changed": bool(old.get("used_live_data")) != bool(new.get("used_live_data")),
        })
    return {
        "timestamp": now_iso(),
        "before": str(before_path),
        "after": str(after_path),
        "mesh": {
            "health_delta": float(after["mesh"].get("mesh_health", 0.0)) - float(before["mesh"].get("mesh_health", 0.0)),
            "coherence_delta": float(after["mesh"].get("mesh_coherence", 0.0)) - float(before["mesh"].get("mesh_coherence", 0.0)),
            "fallback_delta": int(after["mesh"].get("fallback_sensor_count", 0)) - int(before["mesh"].get("fallback_sensor_count", 0)),
        },
        "sensors": sensors,
    }


def write_markdown_report(summary_path: Path, out_path: Path) -> None:
    summary = load_summary(summary_path)
    mesh = summary.get("mesh", {})
    lines = [
        f"# PulseMesh Report: {summary.get('run_id')}",
        "",
        f"- Generated: {now_iso()}",
        f"- Summary: `{summary_path}`",
        f"- Sensors: {mesh.get('sensor_count', 0)}",
        f"- Live sensors: {mesh.get('live_sensor_count', 0)}",
        f"- Fallback sensors: {mesh.get('fallback_sensor_count', 0)}",
        f"- Mesh health: {float(mesh.get('mesh_health', 0.0)):.4f}",
        f"- Mesh coherence: {float(mesh.get('mesh_coherence', 0.0)):.4f}",
        "",
        "## Sensors",
        "",
        "| Sensor | Provider | Live | Health | Anomaly | Stability | Drift |",
        "|---|---:|---:|---:|---:|---:|---:|",
    ]
    for sensor in summary.get("sensors", []):
        metrics = sensor.get("metrics", {})
        lines.append(
            "| {label} | {provider} | {live} | {health:.4f} | {anomaly:.4f} | {stable:.4f} | {drift:.4f} |".format(
                label=str(sensor.get("label", sensor.get("profile_id", ""))).replace("|", "\\|"),
                provider=sensor.get("provider", ""),
                live="yes" if sensor.get("used_live_data") else "no",
                health=float(metrics.get("health_score", 0.0)),
                anomaly=float(metrics.get("anomaly_score", 0.0)),
                stable=float(metrics.get("stability_fraction", 0.0)),
                drift=float(metrics.get("drift", 0.0)),
            )
        )
    lines.append("")
    alerts = summary.get("alerts", [])
    if alerts:
        lines.extend(["## Alerts", ""])
        for alert in alerts:
            lines.append(f"- **{alert.get('severity', 'warning')}** `{alert.get('profile_id')}`: {alert.get('message')} (value={alert.get('value')})")
        lines.append("")
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines), encoding="utf-8")


def write_compare_json(before_path: Path, after_path: Path, out_path: Path) -> None:
    write_json(out_path, compare_summaries(before_path, after_path))

