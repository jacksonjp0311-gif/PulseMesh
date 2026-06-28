from __future__ import annotations

import math
import statistics
from typing import Any

from .models import FusionResult, TelemetrySeries
from .util import clamp


def median_abs_deviation(values: list[float], center: float) -> float:
    deviations = [abs(v - center) for v in values if math.isfinite(v)]
    if not deviations:
        return 1.0
    mad = statistics.median(deviations)
    return mad if mad > 1e-12 else 1.0


def gradient(values: list[float]) -> list[float]:
    n = len(values)
    if n == 0:
        return []
    if n == 1:
        return [0.0]
    out: list[float] = []
    for i in range(n):
        if i == 0:
            out.append(values[1] - values[0])
        elif i == n - 1:
            out.append(values[-1] - values[-2])
        else:
            out.append((values[i + 1] - values[i - 1]) / 2.0)
    return out


def percentile(values: list[float], pct: float) -> float:
    if not values:
        return 0.0
    vals = sorted(values)
    pos = clamp(pct, 0.0, 100.0) / 100.0 * (len(vals) - 1)
    lo = int(math.floor(pos))
    hi = int(math.ceil(pos))
    if lo == hi:
        return vals[lo]
    weight = pos - lo
    return vals[lo] * (1.0 - weight) + vals[hi] * weight


def fuse_series(series: TelemetrySeries, stability_threshold: float = 0.70) -> FusionResult:
    clean = [float(v) for v in series.values if math.isfinite(float(v))]
    if len(clean) < 4:
        raise ValueError(f"{series.profile_id} has too few finite values")

    center = statistics.median(clean)
    scale = median_abs_deviation(clean, center)
    normalized = [(v - center) / scale for v in clean]
    delta = gradient(normalized)
    coherence = [1.0 / (1.0 + abs(d)) for d in delta]

    mean = statistics.fmean(clean)
    stdev = statistics.pstdev(clean) if len(clean) > 1 else 0.0
    delta_abs = [abs(d) for d in delta]
    coherence_avg = statistics.fmean(coherence)
    volatility = statistics.fmean(delta_abs)
    spike_threshold = percentile(delta_abs, 95.0)
    spikes = [i for i, d in enumerate(delta_abs) if d >= spike_threshold and d > 0.0]
    stability_fraction = sum(1 for c in coherence if c >= stability_threshold) / len(coherence)

    drift = 0.0
    if len(normalized) >= 8:
        first = statistics.fmean(normalized[: max(2, len(normalized) // 4)])
        last = statistics.fmean(normalized[-max(2, len(normalized) // 4) :])
        drift = last - first

    anomaly_score = clamp((1.0 - coherence_avg) + min(1.0, volatility / 5.0) + min(1.0, len(spikes) / len(clean)), 0.0, 1.0)
    health_score = clamp(1.0 - anomaly_score, 0.0, 1.0)

    metrics: dict[str, Any] = {
        "points": len(clean),
        "mean": mean,
        "median": center,
        "min": min(clean),
        "max": max(clean),
        "stdev": stdev,
        "mad": scale,
        "coherence_avg": coherence_avg,
        "stability_fraction": stability_fraction,
        "volatility": volatility,
        "drift": drift,
        "spike_count": len(spikes),
        "spike_indices": spikes[:25],
        "anomaly_score": anomaly_score,
        "health_score": health_score,
        "used_live_data": series.used_live_data,
        "fallback_reason": series.fallback_reason,
    }
    return FusionResult(normalized=normalized, delta=delta, coherence=coherence, metrics=metrics)


def summarize_mesh(results: list[tuple[TelemetrySeries, FusionResult]]) -> dict[str, Any]:
    if not results:
        return {
            "sensor_count": 0,
            "live_sensor_count": 0,
            "fallback_sensor_count": 0,
            "mesh_health": 0.0,
            "mesh_coherence": 0.0,
            "highest_anomaly": None,
        }

    health = [float(r.metrics["health_score"]) for _, r in results]
    coherence = [float(r.metrics["coherence_avg"]) for _, r in results]
    live = [s for s, _ in results if s.used_live_data]
    highest = max(results, key=lambda item: float(item[1].metrics["anomaly_score"]))

    return {
        "sensor_count": len(results),
        "live_sensor_count": len(live),
        "fallback_sensor_count": len(results) - len(live),
        "mesh_health": statistics.fmean(health),
        "mesh_coherence": statistics.fmean(coherence),
        "highest_anomaly": {
            "profile_id": highest[0].profile_id,
            "label": highest[0].label,
            "provider": highest[0].provider,
            "anomaly_score": highest[1].metrics["anomaly_score"],
            "health_score": highest[1].metrics["health_score"],
        },
    }

