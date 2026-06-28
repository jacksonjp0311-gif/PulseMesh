from __future__ import annotations

from dataclasses import asdict
from pathlib import Path

from .models import TelemetrySeries
from .util import load_json, write_json


def cache_path(cache_dir: Path, profile_id: str) -> Path:
    safe = "".join(ch if ch.isalnum() or ch in {"-", "_"} else "_" for ch in profile_id)
    return cache_dir / f"{safe}.json"


def save_series(cache_dir: Path, series: TelemetrySeries) -> None:
    write_json(cache_path(cache_dir, series.profile_id), asdict(series))


def load_series(cache_dir: Path, profile_id: str, reason: str) -> TelemetrySeries | None:
    path = cache_path(cache_dir, profile_id)
    if not path.exists():
        return None
    try:
        obj = load_json(path)
        return TelemetrySeries(
            profile_id=str(obj["profile_id"]),
            provider=str(obj["provider"]),
            label=str(obj["label"]),
            sensor_name=str(obj.get("sensor_name", "Cached telemetry")),
            times=[str(x) for x in obj.get("times", [])],
            values=[float(x) for x in obj.get("values", [])],
            unit=str(obj.get("unit", "")),
            used_live_data=False,
            fallback_reason=f"cache fallback after {reason}",
            source_url=obj.get("source_url"),
            metadata={**dict(obj.get("metadata", {})), "cache_source": str(path)},
        )
    except Exception:
        return None

