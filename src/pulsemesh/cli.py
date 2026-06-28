from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

from .artifacts import sensor_state, write_plot, write_run, write_series_csv
from .fusion import fuse_series, summarize_mesh
from .models import TelemetryProfile
from .providers import acquire
from .util import load_json


def load_profiles(path: Path) -> list[TelemetryProfile]:
    obj = load_json(path)
    if isinstance(obj, dict) and "profiles" in obj:
        raw_profiles = obj["profiles"]
    elif isinstance(obj, list):
        raw_profiles = obj
    else:
        raise ValueError("profile file must be a list or an object with a 'profiles' list")
    if not isinstance(raw_profiles, list):
        raise ValueError("'profiles' must be a list")
    return [TelemetryProfile.from_dict(item) for item in raw_profiles]


def make_run_id(prefix: str = "pulse") -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    return f"{prefix}-{stamp}"


def run_mesh(args: argparse.Namespace) -> int:
    profiles = load_profiles(Path(args.profiles))
    out_dir = Path(args.out)
    run_id = args.run_id or make_run_id()

    fused = []
    states = []
    run_dir = out_dir / run_id
    data_dir = run_dir / "data"
    visual_dir = run_dir / "visuals"

    for profile in profiles:
        series = acquire(profile, max_points=args.max_points, timeout=args.timeout)
        result = fuse_series(series, stability_threshold=args.stability_threshold)
        csv_path = data_dir / f"{profile.id}.csv"
        write_series_csv(csv_path, series, result)
        plot_path = None
        if not args.no_plots:
            plot_path = write_plot(visual_dir / f"{profile.id}.png", series, result)
        states.append(sensor_state(series, result, csv_path, plot_path))
        fused.append((series, result))

    mesh = summarize_mesh(fused)
    payload = write_run(out_dir, run_id, states, mesh)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


def list_providers(_: argparse.Namespace) -> int:
    providers = {
        "goes_xray": "NOAA SWPC GOES primary X-ray flux. Optional params: transform=log10|raw.",
        "openmeteo": "Open-Meteo forecast/archive-style hourly weather. Requires lat/lon. Variables include temperature_2m, wind_speed_10m, precipitation, pressure_msl, relative_humidity_2m, cloud_cover.",
        "openmeteo_air": "Open-Meteo air quality. Requires lat/lon. Variables include us_aqi, european_aqi, pm10, pm2_5, carbon_monoxide, ozone, nitrogen_dioxide.",
        "usgs_earthquake": "USGS event magnitudes. Optional lat/lon/radius_km, days, min_magnitude.",
        "csv": "Local CSV sensor. Requires path. Optional value_column, time_column, unit.",
        "synthetic": "Deterministic synthetic fallback/demo series.",
    }
    print(json.dumps(providers, indent=2, sort_keys=True))
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="pulsemesh", description="Adaptive multi-source telemetry mesh runner.")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="Run a telemetry mesh from a profiles JSON file.")
    run.add_argument("--profiles", required=True, help="Path to profiles JSON.")
    run.add_argument("--out", default="runs", help="Output directory for run artifacts.")
    run.add_argument("--run-id", help="Optional deterministic run id.")
    run.add_argument("--max-points", type=int, default=512, help="Maximum samples per sensor.")
    run.add_argument("--timeout", type=float, default=12.0, help="HTTP timeout in seconds.")
    run.add_argument("--stability-threshold", type=float, default=0.70, help="Coherence threshold for stability fraction.")
    run.add_argument("--no-plots", action="store_true", help="Skip matplotlib plot generation.")
    run.set_defaults(func=run_mesh)

    providers = sub.add_parser("providers", help="List supported telemetry providers.")
    providers.set_defaults(func=list_providers)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return int(args.func(args))
    except Exception as exc:
        print(f"pulsemesh: error: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
