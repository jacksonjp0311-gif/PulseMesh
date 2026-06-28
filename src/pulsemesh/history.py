from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from .util import load_json, write_json


def load_ledger(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict):
            rows.append(obj)
    return rows


def summarize_history(runs_dir: Path, limit: int = 20) -> dict[str, Any]:
    ledger = load_ledger(runs_dir / "ledger.jsonl")
    recent = ledger[-max(1, limit):]
    health = [float(r.get("mesh", {}).get("mesh_health", 0.0)) for r in recent]
    fallback = [int(r.get("mesh", {}).get("fallback_sensor_count", 0)) for r in recent]
    trend = 0.0
    if len(health) >= 2:
        trend = health[-1] - health[0]
    summaries = []
    worst_sensor = None
    for row in recent:
        run_id = row.get("run_id")
        summary_path = runs_dir / str(run_id) / "state" / "summary.json"
        item = {
            "run_id": run_id,
            "timestamp": row.get("timestamp"),
            "mesh": row.get("mesh", {}),
            "summary_path": str(summary_path),
        }
        if summary_path.exists():
            try:
                summary = load_json(summary_path)
                highest = summary.get("mesh", {}).get("highest_anomaly")
                item["highest_anomaly"] = highest
                if highest and (worst_sensor is None or float(highest.get("anomaly_score", 0.0)) > float(worst_sensor.get("anomaly_score", 0.0))):
                    worst_sensor = highest
            except Exception:
                pass
        summaries.append(item)
    return {
        "runs_dir": str(runs_dir),
        "run_count": len(ledger),
        "window_count": len(recent),
        "mesh_health_latest": health[-1] if health else None,
        "mesh_health_trend": trend,
        "fallback_total_window": sum(fallback),
        "fallback_frequency_window": (sum(1 for x in fallback if x > 0) / len(fallback)) if fallback else 0.0,
        "worst_sensor_window": worst_sensor,
        "runs": summaries,
    }


def write_history_json(runs_dir: Path, out_path: Path, limit: int = 20) -> None:
    write_json(out_path, summarize_history(runs_dir, limit=limit))


def write_history_markdown(runs_dir: Path, out_path: Path, limit: int = 20) -> None:
    summary = summarize_history(runs_dir, limit=limit)
    lines = [
        "# PulseMesh History",
        "",
        f"- Runs directory: `{summary['runs_dir']}`",
        f"- Total runs: {summary['run_count']}",
        f"- Window count: {summary['window_count']}",
        f"- Latest health: {summary['mesh_health_latest']}",
        f"- Health trend: {summary['mesh_health_trend']:+.4f}",
        f"- Fallback frequency: {summary['fallback_frequency_window']:.2%}",
        "",
        "| Run | Timestamp | Health | Coherence | Fallbacks | Highest anomaly |",
        "|---|---:|---:|---:|---:|---|",
    ]
    for run in summary.get("runs", []):
        mesh = run.get("mesh", {})
        highest = run.get("highest_anomaly") or {}
        highest_label = highest.get("label") or highest.get("profile_id") or ""
        lines.append(
            f"| {run.get('run_id')} | {run.get('timestamp')} | "
            f"{float(mesh.get('mesh_health', 0.0)):.4f} | "
            f"{float(mesh.get('mesh_coherence', 0.0)):.4f} | "
            f"{int(mesh.get('fallback_sensor_count', 0))} | {highest_label} |"
        )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(lines) + "\n", encoding="utf-8")

