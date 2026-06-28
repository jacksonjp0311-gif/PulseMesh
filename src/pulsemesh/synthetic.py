from __future__ import annotations

import math
import random

from .models import TelemetryProfile, TelemetrySeries


def synthetic_series(profile: TelemetryProfile, reason: str, max_points: int) -> TelemetrySeries:
    seed = hash((profile.id, profile.provider, profile.variable)) & 0xFFFFFFFF
    rng = random.Random(seed)
    n = max(24, int(max_points))
    provider = profile.provider.lower()
    variable = (profile.variable or profile.params.get("variable") or provider).lower()

    if "quake" in provider or "quake" in variable:
        base, amp, pulse = 2.0, 0.8, 2.2
        unit = "magnitude"
    elif "air" in provider or "aqi" in variable or "pm2" in variable or "pm10" in variable:
        base, amp, pulse = 35.0, 10.0, 18.0
        unit = "index"
    elif "goes" in provider or "solar" in provider or "xray" in variable:
        base, amp, pulse = -6.2, 0.4, 1.1
        unit = "log10 W/m^2"
    elif "wind" in variable:
        base, amp, pulse = 8.0, 2.5, 4.0
        unit = "km/h"
    elif "precip" in variable:
        base, amp, pulse = 0.1, 0.25, 1.0
        unit = "mm"
    elif "pressure" in variable:
        base, amp, pulse = 1012.0, 4.0, 8.0
        unit = "hPa"
    else:
        base, amp, pulse = 20.0, 5.0, 3.0
        unit = "synthetic"

    values: list[float] = []
    times: list[str] = []
    for i in range(n):
        t = i / max(1, n - 1)
        wave = amp * math.sin(2.0 * math.pi * t)
        transient = pulse * math.exp(-0.5 * ((t - 0.62) / 0.06) ** 2)
        noise = rng.gauss(0.0, max(abs(amp) * 0.08, 0.05))
        values.append(base + wave + transient + noise)
        times.append(f"synthetic:{i:04d}")

    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or profile.id,
        sensor_name=f"Synthetic fallback for {profile.provider}",
        times=times,
        values=values[-max_points:],
        unit=unit,
        used_live_data=False,
        fallback_reason=reason,
        metadata={"synthetic_seed": seed},
    )
