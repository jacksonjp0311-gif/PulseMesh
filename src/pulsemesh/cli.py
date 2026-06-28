from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

from .alerts import evaluate_alerts
from .artifacts import sensor_state, write_plot, write_run, write_series_csv
from .baselines import annotate_summary_with_baselines, update_baselines_from_summary
from .dashboard import write_html_dashboard
from .fusion import fuse_series, summarize_mesh
from .history import write_history_json, write_history_markdown
from .models import TelemetryProfile
from .providers import acquire_with_cache
from .reports import write_compare_json, write_markdown_report
from .schemas import validate_profiles_file, validate_summary_file
from .util import load_json, write_json


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
    payload = execute_run(args)
    print(json.dumps(payload, indent=2, sort_keys=True))
    return 0


def execute_run(args: argparse.Namespace) -> dict:
    profiles = load_profiles(Path(args.profiles))
    out_dir = Path(args.out)
    run_id = args.run_id or make_run_id()
    cache_dir = Path(args.cache_dir) if args.cache_dir else out_dir / ".cache"

    fused = []
    states = []
    alerts = []
    run_dir = out_dir / run_id
    data_dir = run_dir / "data"
    visual_dir = run_dir / "visuals"

    for profile in profiles:
        series = acquire_with_cache(profile, max_points=args.max_points, timeout=args.timeout, cache_dir=cache_dir)
        result = fuse_series(series, stability_threshold=args.stability_threshold)
        csv_path = data_dir / f"{profile.id}.csv"
        write_series_csv(csv_path, series, result)
        plot_path = None
        if not args.no_plots:
            plot_path = write_plot(visual_dir / f"{profile.id}.png", series, result)
        state = sensor_state(series, result, csv_path, plot_path)
        rules = list(profile.params.get("alerts", []))
        fired = evaluate_alerts(state, rules)
        state["alerts"] = fired
        alerts.extend(fired)
        states.append(state)
        fused.append((series, result))

    mesh = summarize_mesh(fused)
    payload = write_run(out_dir, run_id, states, mesh)
    summary_path = Path(payload["summary_path"])
    summary = load_json(summary_path)
    summary["alerts"] = alerts
    write_json(summary_path, summary)
    if getattr(args, "baseline", None):
        annotate_summary_with_baselines(summary_path, Path(args.baseline))
    if getattr(args, "update_baseline", None):
        update_baselines_from_summary(summary_path, Path(args.update_baseline), window=args.baseline_window)
    payload["alert_count"] = len(alerts)
    return payload


def list_providers(_: argparse.Namespace) -> int:
    providers = {
        "goes_xray": "NOAA SWPC GOES primary X-ray flux. Optional params: transform=log10|raw.",
        "openmeteo": "Open-Meteo forecast/archive-style hourly weather. Requires lat/lon. Variables include temperature_2m, wind_speed_10m, precipitation, pressure_msl, relative_humidity_2m, cloud_cover.",
        "openmeteo_air": "Open-Meteo air quality. Requires lat/lon. Variables include us_aqi, european_aqi, pm10, pm2_5, carbon_monoxide, ozone, nitrogen_dioxide.",
        "usgs_earthquake": "USGS event magnitudes. Optional lat/lon/radius_km, days, min_magnitude.",
        "csv": "Local CSV sensor. Requires path. Optional value_column, time_column, unit.",
        "system": "Local system telemetry. Variables: cpu_load, load1, process_count, disk_free_percent, disk_used_percent, memory_used_percent, memory_free_percent, battery_percent, uptime_hours, net_bytes_sent, net_bytes_recv.",
        "ping": "TCP latency probe. Params: host, port, count.",
        "jsonl": "Local JSONL/log tail. Params: path, value_field or pattern, metric.",
        "rss": "RSS/Atom feed pulse. Params: url, optional keyword.",
        "github": "GitHub repository telemetry. Params: repo, metric.",
        "mqtt": "MQTT snapshot. Requires optional dependency paho-mqtt. Params: host, port, topic.",
        "serial": "Serial snapshot. Requires optional dependency pyserial. Params: port, baud.",
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
    run.add_argument("--cache-dir", help="Cache directory for last-good live sensor data.")
    run.add_argument("--baseline", help="Read a baseline JSON and annotate this run with historical deltas.")
    run.add_argument("--update-baseline", help="Update a baseline JSON from this run after writing artifacts.")
    run.add_argument("--baseline-window", type=int, default=50, help="Samples retained per sensor when updating baseline.")
    run.add_argument("--stability-threshold", type=float, default=0.70, help="Coherence threshold for stability fraction.")
    run.add_argument("--no-plots", action="store_true", help="Skip matplotlib plot generation.")
    run.set_defaults(func=run_mesh)

    watch = sub.add_parser("watch", help="Run a telemetry mesh repeatedly.")
    watch.add_argument("--profiles", required=True, help="Path to profiles JSON.")
    watch.add_argument("--out", default="runs", help="Output directory for run artifacts.")
    watch.add_argument("--interval", type=float, default=60.0, help="Seconds between runs.")
    watch.add_argument("--iterations", type=int, default=0, help="Number of runs; 0 means forever.")
    watch.add_argument("--max-points", type=int, default=512)
    watch.add_argument("--timeout", type=float, default=12.0)
    watch.add_argument("--cache-dir")
    watch.add_argument("--baseline")
    watch.add_argument("--update-baseline")
    watch.add_argument("--baseline-window", type=int, default=50)
    watch.add_argument("--stability-threshold", type=float, default=0.70)
    watch.add_argument("--no-plots", action="store_true")
    watch.set_defaults(func=watch_mesh)

    report = sub.add_parser("report", help="Render a Markdown report from a summary JSON.")
    report.add_argument("--summary", required=True)
    report.add_argument("--out", required=True)
    report.set_defaults(func=report_summary)

    dashboard = sub.add_parser("dashboard", help="Render a self-contained HTML dashboard from a summary JSON.")
    dashboard.add_argument("--summary", required=True)
    dashboard.add_argument("--out", required=True)
    dashboard.add_argument("--refresh-seconds", type=int)
    dashboard.set_defaults(func=dashboard_summary)

    compare = sub.add_parser("compare", help="Compare two PulseMesh summary JSON files.")
    compare.add_argument("--before", required=True)
    compare.add_argument("--after", required=True)
    compare.add_argument("--out", required=True)
    compare.set_defaults(func=compare_runs)

    baseline = sub.add_parser("baseline", help="Update a rolling baseline from a summary JSON.")
    baseline.add_argument("--summary", required=True)
    baseline.add_argument("--out", required=True)
    baseline.add_argument("--window", type=int, default=50)
    baseline.set_defaults(func=baseline_update)

    validate = sub.add_parser("validate", help="Validate a profiles or summary JSON file.")
    validate.add_argument("--profiles")
    validate.add_argument("--summary")
    validate.set_defaults(func=validate_file)

    history = sub.add_parser("history", help="Summarize run history from a runs directory ledger.")
    history.add_argument("--runs-dir", default="runs")
    history.add_argument("--out", required=True)
    history.add_argument("--format", choices=["json", "md"], default="json")
    history.add_argument("--limit", type=int, default=20)
    history.set_defaults(func=history_summary)

    providers = sub.add_parser("providers", help="List supported telemetry providers.")
    providers.set_defaults(func=list_providers)
    return parser


def watch_mesh(args: argparse.Namespace) -> int:
    i = 0
    while True:
        i += 1
        args.run_id = make_run_id(prefix=f"watch-{i:04d}")
        payload = execute_run(args)
        print(json.dumps(payload, sort_keys=True))
        if args.iterations and i >= args.iterations:
            return 0
        time.sleep(args.interval)


def report_summary(args: argparse.Namespace) -> int:
    write_markdown_report(Path(args.summary), Path(args.out))
    print(json.dumps({"report_path": args.out}, indent=2, sort_keys=True))
    return 0


def dashboard_summary(args: argparse.Namespace) -> int:
    write_html_dashboard(Path(args.summary), Path(args.out), refresh_seconds=args.refresh_seconds)
    print(json.dumps({"dashboard_path": args.out}, indent=2, sort_keys=True))
    return 0


def compare_runs(args: argparse.Namespace) -> int:
    write_compare_json(Path(args.before), Path(args.after), Path(args.out))
    print(json.dumps({"compare_path": args.out}, indent=2, sort_keys=True))
    return 0


def baseline_update(args: argparse.Namespace) -> int:
    baseline = update_baselines_from_summary(Path(args.summary), Path(args.out), window=args.window)
    print(json.dumps({
        "baseline_path": args.out,
        "sensor_count": len(baseline.get("sensors", {})),
        "updated_at": baseline.get("updated_at"),
    }, indent=2, sort_keys=True))
    return 0


def validate_file(args: argparse.Namespace) -> int:
    errors: list[str] = []
    if args.profiles:
        errors.extend(validate_profiles_file(Path(args.profiles)))
    if args.summary:
        errors.extend(validate_summary_file(Path(args.summary)))
    if not args.profiles and not args.summary:
        errors.append("provide --profiles or --summary")
    print(json.dumps({"ok": not errors, "errors": errors}, indent=2, sort_keys=True))
    return 0 if not errors else 1


def history_summary(args: argparse.Namespace) -> int:
    runs_dir = Path(args.runs_dir)
    out = Path(args.out)
    if args.format == "md":
        write_history_markdown(runs_dir, out, limit=args.limit)
    else:
        write_history_json(runs_dir, out, limit=args.limit)
    print(json.dumps({"history_path": args.out}, indent=2, sort_keys=True))
    return 0


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
