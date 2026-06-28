from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class TelemetryProfile:
    id: str
    provider: str
    label: str | None = None
    lat: float | None = None
    lon: float | None = None
    variable: str | None = None
    params: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, obj: dict[str, Any]) -> "TelemetryProfile":
        params = dict(obj)
        known = {k: params.pop(k, None) for k in ("id", "provider", "label", "lat", "lon", "variable")}
        if not known["id"]:
            raise ValueError("profile is missing required field: id")
        if not known["provider"]:
            raise ValueError(f"profile {known['id']} is missing required field: provider")
        return cls(
            id=str(known["id"]),
            provider=str(known["provider"]),
            label=None if known["label"] is None else str(known["label"]),
            lat=None if known["lat"] is None else float(known["lat"]),
            lon=None if known["lon"] is None else float(known["lon"]),
            variable=None if known["variable"] is None else str(known["variable"]),
            params=params,
        )


@dataclass(frozen=True)
class TelemetrySeries:
    profile_id: str
    provider: str
    label: str
    sensor_name: str
    times: list[str]
    values: list[float]
    unit: str = ""
    used_live_data: bool = True
    fallback_reason: str | None = None
    source_url: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class FusionResult:
    normalized: list[float]
    delta: list[float]
    coherence: list[float]
    metrics: dict[str, Any]

