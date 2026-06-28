from __future__ import annotations

import csv
import math
import urllib.parse
from collections.abc import Callable
from datetime import datetime, timedelta, timezone

from .cache import load_series, save_series
from .local import fetch_ping, fetch_system
from .models import TelemetryProfile, TelemetrySeries
from .streams import fetch_github_repo, fetch_jsonl_log, fetch_mqtt_snapshot, fetch_rss, fetch_serial_snapshot
from .synthetic import synthetic_series
from .util import fetch_json, finite_float

Provider = Callable[[TelemetryProfile, int, float], TelemetrySeries]


def acquire(profile: TelemetryProfile, max_points: int = 512, timeout: float = 12.0, cache_dir=None) -> TelemetrySeries:
    provider = profile.provider.lower()
    try:
        if provider in {"goes_xray", "solar_goes_xray"}:
            return fetch_goes_xray(profile, max_points, timeout)
        if provider in {"openmeteo", "openmeteo_weather", "weather"}:
            return fetch_openmeteo_weather(profile, max_points, timeout)
        if provider in {"openmeteo_air", "air_quality"}:
            return fetch_openmeteo_air(profile, max_points, timeout)
        if provider in {"usgs_earthquake", "earthquake"}:
            return fetch_usgs_earthquakes(profile, max_points, timeout)
        if provider in {"csv", "local_csv"}:
            return fetch_local_csv(profile, max_points, timeout)
        if provider in {"system", "local_system"}:
            return fetch_system(profile, max_points, timeout)
        if provider in {"ping", "tcp_ping", "latency"}:
            return fetch_ping(profile, max_points, timeout)
        if provider in {"jsonl", "log", "log_tail"}:
            return fetch_jsonl_log(profile, max_points, timeout)
        if provider in {"rss", "feed"}:
            return fetch_rss(profile, max_points, timeout)
        if provider in {"github", "github_repo"}:
            return fetch_github_repo(profile, max_points, timeout)
        if provider == "mqtt":
            return fetch_mqtt_snapshot(profile, max_points, timeout)
        if provider == "serial":
            return fetch_serial_snapshot(profile, max_points, timeout)
        if provider in {"synthetic", "demo"}:
            return synthetic_series(profile, "requested synthetic provider", max_points)
        raise ValueError(f"unknown provider: {profile.provider}")
    except Exception as exc:
        if cache_dir is not None:
            cached = load_series(cache_dir, profile.id, f"{type(exc).__name__}: {exc}")
            if cached is not None:
                return cached
        return synthetic_series(profile, f"{type(exc).__name__}: {exc}", max_points)


def acquire_with_cache(profile: TelemetryProfile, max_points: int = 512, timeout: float = 12.0, cache_dir=None) -> TelemetrySeries:
    series = acquire(profile, max_points=max_points, timeout=timeout, cache_dir=cache_dir)
    if cache_dir is not None and series.used_live_data:
        save_series(cache_dir, series)
    return series


def fetch_goes_xray(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    urls = [
        "https://services.swpc.noaa.gov/json/goes/primary/xrays-1-day.json",
        "https://services.swpc.noaa.gov/json/goes/primary/xrays-6-hour.json",
    ]
    last_error: Exception | None = None
    for url in urls:
        try:
            obj = fetch_json(url, timeout=timeout)
            values: list[float] = []
            times: list[str] = []
            for item in obj if isinstance(obj, list) else []:
                if not isinstance(item, dict):
                    continue
                flux = item.get("flux")
                value = finite_float(flux)
                if value is None or value <= 0.0:
                    continue
                transform = str(profile.params.get("transform", "log10")).lower()
                values.append(math.log10(value) if transform == "log10" else value)
                times.append(str(item.get("time_tag") or item.get("time") or ""))
            if len(values) >= 8:
                return TelemetrySeries(
                    profile_id=profile.id,
                    provider=profile.provider,
                    label=profile.label or "NOAA GOES X-ray",
                    sensor_name="NOAA SWPC GOES primary X-ray flux",
                    times=times[-max_points:],
                    values=values[-max_points:],
                    unit="log10 W/m^2" if str(profile.params.get("transform", "log10")).lower() == "log10" else "W/m^2",
                    source_url=url,
                )
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"GOES X-ray fetch failed: {last_error}")


def fetch_openmeteo_weather(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    if profile.lat is None or profile.lon is None:
        raise ValueError("Open-Meteo weather requires lat and lon")
    variable = profile.variable or str(profile.params.get("variable", "temperature_2m"))
    query = {
        "latitude": profile.lat,
        "longitude": profile.lon,
        "hourly": variable,
        "past_days": int(profile.params.get("past_days", 1)),
        "forecast_days": int(profile.params.get("forecast_days", 1)),
        "timezone": "UTC",
    }
    url = "https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(query)
    obj = fetch_json(url, timeout=timeout)
    hourly = obj.get("hourly", {}) if isinstance(obj, dict) else {}
    times = [str(x) for x in hourly.get("time", [])]
    values = [v for v in (finite_float(x) for x in hourly.get(variable, [])) if v is not None]
    if len(values) < 8:
        raise RuntimeError(f"Open-Meteo returned too few points for {variable}")
    units = obj.get("hourly_units", {}) if isinstance(obj, dict) else {}
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"Open-Meteo {variable}",
        sensor_name=f"Open-Meteo hourly {variable}",
        times=times[-max_points:],
        values=values[-max_points:],
        unit=str(units.get(variable, "")),
        source_url=url,
        metadata={"lat": profile.lat, "lon": profile.lon, "variable": variable},
    )


def fetch_openmeteo_air(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    if profile.lat is None or profile.lon is None:
        raise ValueError("Open-Meteo air quality requires lat and lon")
    variable = profile.variable or str(profile.params.get("variable", "us_aqi"))
    query = {
        "latitude": profile.lat,
        "longitude": profile.lon,
        "hourly": variable,
        "past_days": int(profile.params.get("past_days", 1)),
        "forecast_days": int(profile.params.get("forecast_days", 1)),
        "timezone": "UTC",
    }
    url = "https://air-quality-api.open-meteo.com/v1/air-quality?" + urllib.parse.urlencode(query)
    obj = fetch_json(url, timeout=timeout)
    hourly = obj.get("hourly", {}) if isinstance(obj, dict) else {}
    times = [str(x) for x in hourly.get("time", [])]
    values = [v for v in (finite_float(x) for x in hourly.get(variable, [])) if v is not None]
    if len(values) < 8:
        raise RuntimeError(f"Open-Meteo air quality returned too few points for {variable}")
    units = obj.get("hourly_units", {}) if isinstance(obj, dict) else {}
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"Open-Meteo Air {variable}",
        sensor_name=f"Open-Meteo air-quality hourly {variable}",
        times=times[-max_points:],
        values=values[-max_points:],
        unit=str(units.get(variable, "")),
        source_url=url,
        metadata={"lat": profile.lat, "lon": profile.lon, "variable": variable},
    )


def fetch_usgs_earthquakes(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    days = int(profile.params.get("days", 7))
    min_magnitude = float(profile.params.get("min_magnitude", 1.0))
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    query = {
        "format": "geojson",
        "starttime": start.strftime("%Y-%m-%d"),
        "endtime": end.strftime("%Y-%m-%d"),
        "minmagnitude": min_magnitude,
        "orderby": "time",
        "limit": max(max_points, 100),
    }
    if profile.lat is not None and profile.lon is not None:
        query["latitude"] = profile.lat
        query["longitude"] = profile.lon
        query["maxradiuskm"] = float(profile.params.get("radius_km", 1500))
    url = "https://earthquake.usgs.gov/fdsnws/event/1/query?" + urllib.parse.urlencode(query)
    obj = fetch_json(url, timeout=timeout)
    features = obj.get("features", []) if isinstance(obj, dict) else []
    values: list[float] = []
    times: list[str] = []
    for feature in features:
        props = feature.get("properties", {}) if isinstance(feature, dict) else {}
        mag = finite_float(props.get("mag"))
        if mag is None:
            continue
        values.append(mag)
        ms = finite_float(props.get("time"))
        if ms is None:
            times.append("")
        else:
            times.append(datetime.fromtimestamp(ms / 1000.0, tz=timezone.utc).isoformat().replace("+00:00", "Z"))
    if len(values) < 4:
        raise RuntimeError("USGS returned too few earthquake events")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or "USGS earthquakes",
        sensor_name="USGS earthquake event magnitudes",
        times=times[-max_points:],
        values=values[-max_points:],
        unit="magnitude",
        source_url=url,
        metadata={"days": days, "min_magnitude": min_magnitude},
    )


def fetch_local_csv(profile: TelemetryProfile, max_points: int, _: float) -> TelemetrySeries:
    path_value = profile.params.get("path") or profile.params.get("file")
    if not path_value:
        raise ValueError("CSV provider requires a 'path' field")
    value_column = str(profile.params.get("value_column", "value"))
    time_column = str(profile.params.get("time_column", "time"))

    values: list[float] = []
    times: list[str] = []
    with open(str(path_value), encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames or value_column not in reader.fieldnames:
            raise ValueError(f"CSV file must include value column '{value_column}'")
        for row in reader:
            value = finite_float(row.get(value_column))
            if value is None:
                continue
            values.append(value)
            times.append(str(row.get(time_column, len(times))))
    if len(values) < 4:
        raise RuntimeError("CSV provider found too few numeric rows")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"CSV {value_column}",
        sensor_name=f"Local CSV sensor: {path_value}",
        times=times[-max_points:],
        values=values[-max_points:],
        unit=str(profile.params.get("unit", "")),
        source_url=None,
        metadata={"path": str(path_value), "value_column": value_column, "time_column": time_column},
    )
