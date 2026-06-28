from __future__ import annotations

import csv
from pathlib import Path

from .fusion import FusionResult
from .models import TelemetrySeries
from .util import now_iso, write_json, write_jsonl


def write_series_csv(path: Path, series: TelemetrySeries, fusion: FusionResult) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = zip(series.times, series.values, fusion.normalized, fusion.delta, fusion.coherence, strict=False)
    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["time", "value", "normalized", "delta", "coherence"])
        writer.writerows(rows)


def write_plot(path: Path, series: TelemetrySeries, fusion: FusionResult) -> str | None:
    try:
        import matplotlib.pyplot as plt
    except Exception:
        return None

    path.parent.mkdir(parents=True, exist_ok=True)
    x = list(range(len(fusion.normalized)))
    fig, axes = plt.subplots(3, 1, figsize=(9, 7), dpi=130, sharex=True)
    fig.patch.set_facecolor("#f8fafc")

    axes[0].plot(x, series.values[: len(x)], color="#0f766e", linewidth=1.5)
    axes[0].set_ylabel(series.unit or "value")
    axes[0].set_title(series.label)

    axes[1].plot(x, fusion.delta, color="#b45309", linewidth=1.2)
    axes[1].axhline(0.0, color="#64748b", linewidth=0.8)
    axes[1].set_ylabel("delta")

    axes[2].plot(x, fusion.coherence, color="#2563eb", linewidth=1.2)
    axes[2].axhline(0.70, color="#dc2626", linewidth=0.8, linestyle="--")
    axes[2].set_ylabel("stability")
    axes[2].set_xlabel("sample")

    for ax in axes:
        ax.grid(True, alpha=0.25)

    plt.tight_layout()
    plt.savefig(path, bbox_inches="tight")
    plt.close(fig)
    return str(path)


def sensor_state(series: TelemetrySeries, fusion: FusionResult, csv_path: Path, plot_path: str | None) -> dict:
    return {
        "profile_id": series.profile_id,
        "provider": series.provider,
        "label": series.label,
        "sensor_name": series.sensor_name,
        "unit": series.unit,
        "used_live_data": series.used_live_data,
        "fallback_reason": series.fallback_reason,
        "source_url": series.source_url,
        "metadata": series.metadata,
        "metrics": fusion.metrics,
        "artifacts": {
            "csv": str(csv_path),
            "plot": plot_path,
        },
    }


def write_run(out_dir: Path, run_id: str, states: list[dict], mesh_summary: dict) -> dict:
    run_dir = out_dir / run_id
    state_dir = run_dir / "state"
    state_dir.mkdir(parents=True, exist_ok=True)
    summary = {
        "run_id": run_id,
        "timestamp": now_iso(),
        "mesh": mesh_summary,
        "sensors": states,
    }
    summary_path = state_dir / "summary.json"
    write_json(summary_path, summary)
    write_jsonl(out_dir / "ledger.jsonl", {
        "run_id": run_id,
        "timestamp": summary["timestamp"],
        "mesh": mesh_summary,
    })
    return {
        "run_dir": str(run_dir),
        "summary_path": str(summary_path),
        "sensor_count": mesh_summary.get("sensor_count", 0),
        "mesh_health": mesh_summary.get("mesh_health", 0.0),
    }

