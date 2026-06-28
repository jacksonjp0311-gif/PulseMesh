from __future__ import annotations

import statistics
from pathlib import Path
from typing import Any

from .util import load_json, now_iso, write_json

TRACKED_METRICS = [
    "mean",
    "coherence_avg",
    "health_score",
    "anomaly_score",
    "volatility",
    "drift",
    "stability_fraction",
]


def load_baselines(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {"version": "0.2", "updated_at": None, "sensors": {}}
    obj = load_json(path)
    if not isinstance(obj, dict):
        return {"version": "0.2", "updated_at": None, "sensors": {}}
    obj.setdefault("version", "0.2")
    obj.setdefault("sensors", {})
    return obj


def update_baselines_from_summary(summary_path: Path, baseline_path: Path, window: int = 50) -> dict[str, Any]:
    summary = load_json(summary_path)
    baselines = load_baselines(baseline_path)
    sensors = baselines.setdefault("sensors", {})

    for sensor in summary.get("sensors", []):
        sid = sensor.get("profile_id")
        if not sid:
            continue
        entry = sensors.setdefault(sid, {
            "profile_id": sid,
            "label": sensor.get("label", sid),
            "provider": sensor.get("provider"),
            "samples": [],
        })
        sample = {
            "timestamp": summary.get("timestamp", now_iso()),
            "run_id": summary.get("run_id"),
            "used_live_data": bool(sensor.get("used_live_data")),
            "metrics": {
                k: float(sensor.get("metrics", {}).get(k, 0.0))
                for k in TRACKED_METRICS
                if k in sensor.get("metrics", {})
            },
        }
        entry["label"] = sensor.get("label", entry.get("label", sid))
        entry["provider"] = sensor.get("provider", entry.get("provider"))
        entry["samples"].append(sample)
        entry["samples"] = entry["samples"][-max(1, window):]
        entry["stats"] = _stats(entry["samples"])

    baselines["updated_at"] = now_iso()
    write_json(baseline_path, baselines)
    return baselines


def annotate_summary_with_baselines(summary_path: Path, baseline_path: Path) -> dict[str, Any]:
    summary = load_json(summary_path)
    baselines = load_baselines(baseline_path)
    by_id = baselines.get("sensors", {})
    for sensor in summary.get("sensors", []):
        sid = sensor.get("profile_id")
        stats = by_id.get(sid, {}).get("stats", {})
        if not stats:
            continue
        metrics = sensor.get("metrics", {})
        deltas = {}
        zscores = {}
        for key, stat in stats.items():
            if key not in metrics:
                continue
            value = float(metrics.get(key, 0.0))
            avg = float(stat.get("mean", 0.0))
            stdev = float(stat.get("stdev", 0.0))
            deltas[key] = value - avg
            zscores[key] = 0.0 if stdev <= 1e-12 else (value - avg) / stdev
        sensor["baseline"] = {
            "sample_count": by_id.get(sid, {}).get("sample_count", len(by_id.get(sid, {}).get("samples", []))),
            "deltas": deltas,
            "zscores": zscores,
        }
    summary["baseline_path"] = str(baseline_path)
    write_json(summary_path, summary)
    return summary


def _stats(samples: list[dict[str, Any]]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for metric in TRACKED_METRICS:
        values = [
            float(sample.get("metrics", {}).get(metric))
            for sample in samples
            if metric in sample.get("metrics", {})
        ]
        if not values:
            continue
        out[metric] = {
            "mean": statistics.fmean(values),
            "min": min(values),
            "max": max(values),
            "stdev": statistics.pstdev(values) if len(values) > 1 else 0.0,
        }
    return out

