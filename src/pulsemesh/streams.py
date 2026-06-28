from __future__ import annotations

import json
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

from .models import TelemetryProfile, TelemetrySeries
from .util import fetch_json, fetch_text, finite_float


def fetch_jsonl_log(profile: TelemetryProfile, max_points: int, _: float) -> TelemetrySeries:
    path = Path(str(profile.params.get("path") or profile.params.get("file") or ""))
    if not path.exists():
        raise FileNotFoundError(path)
    metric = str(profile.params.get("metric", "count"))
    value_field = profile.params.get("value_field")
    pattern = profile.params.get("pattern")
    lines = path.read_text(encoding="utf-8", errors="replace").splitlines()[-max_points:]
    values: list[float] = []
    times: list[str] = []
    for i, line in enumerate(lines):
        value = 1.0
        if value_field:
            try:
                obj = json.loads(line)
                parsed = finite_float(obj.get(str(value_field))) if isinstance(obj, dict) else None
                value = parsed if parsed is not None else 0.0
            except Exception:
                value = 0.0
        elif pattern:
            value = 1.0 if re.search(str(pattern), line) else 0.0
        elif metric == "length":
            value = float(len(line))
        values.append(value)
        times.append(f"line:{i:04d}")
    if len(values) < 4:
        raise RuntimeError("JSONL/log provider found too few rows")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"Log {path.name}",
        sensor_name=f"Local log stream: {path}",
        times=times,
        values=values,
        unit=str(profile.params.get("unit", metric)),
        metadata={"path": str(path), "metric": metric, "value_field": value_field, "pattern": pattern},
    )


def fetch_rss(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    url = str(profile.params.get("url") or profile.params.get("feed") or "")
    if not url:
        raise ValueError("rss provider requires url")
    text = fetch_text(url, timeout=timeout)
    root = ET.fromstring(text)
    items = root.findall(".//item") or root.findall(".//{http://www.w3.org/2005/Atom}entry")
    keyword = str(profile.params.get("keyword", "")).lower()
    values: list[float] = []
    times: list[str] = []
    for i, item in enumerate(items[-max_points:]):
        body = " ".join(item.itertext())
        if keyword:
            values.append(float(body.lower().count(keyword)))
        else:
            values.append(1.0)
        times.append(item.findtext("pubDate") or item.findtext("{http://www.w3.org/2005/Atom}updated") or f"item:{i:04d}")
    if len(values) < 1:
        raise RuntimeError("rss provider found no feed entries")
    while len(values) < 4:
        values.append(0.0)
        times.append(f"pad:{len(values)}")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or "RSS pulse",
        sensor_name=f"RSS feed pulse: {url}",
        times=times[-max_points:],
        values=values[-max_points:],
        unit="keyword_count" if keyword else "entry",
        source_url=url,
        metadata={"keyword": keyword},
    )


def fetch_github_repo(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    repo = str(profile.params.get("repo") or "")
    if not repo or "/" not in repo:
        raise ValueError("github provider requires repo in owner/name form")
    metric = str(profile.params.get("metric", "stars")).lower()
    obj = fetch_json(f"https://api.github.com/repos/{repo}", timeout=timeout)
    mapping = {
        "stars": "stargazers_count",
        "forks": "forks_count",
        "issues": "open_issues_count",
        "watchers": "watchers_count",
        "size": "size",
    }
    if metric == "recent_commit_activity":
        commits = fetch_json(f"https://api.github.com/repos/{repo}/commits?per_page={max(4, min(max_points, 30))}", timeout=timeout)
        values = [1.0 for _ in commits if isinstance(commits, list)]
        times = []
        for item in commits if isinstance(commits, list) else []:
            times.append(item.get("commit", {}).get("committer", {}).get("date", ""))
        while len(values) < 4:
            values.append(0.0)
            times.append(f"pad:{len(values)}")
    else:
        key = mapping.get(metric)
        if not key:
            raise ValueError(f"unsupported github metric: {metric}")
        value = finite_float(obj.get(key))
        if value is None:
            raise RuntimeError(f"github metric unavailable: {metric}")
        values = [value] * max(4, min(max_points, 8))
        times = [datetime.now(timezone.utc).isoformat().replace("+00:00", "Z") for _ in values]
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"GitHub {repo} {metric}",
        sensor_name=f"GitHub repository telemetry: {repo}",
        times=times[-max_points:],
        values=values[-max_points:],
        unit=metric,
        source_url=f"https://github.com/{repo}",
        metadata={"repo": repo, "metric": metric},
    )


def fetch_mqtt_snapshot(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    try:
        import paho.mqtt.client as mqtt
    except Exception as exc:
        raise RuntimeError("mqtt provider requires optional dependency paho-mqtt") from exc
    host = str(profile.params.get("host", "localhost"))
    topic = str(profile.params.get("topic", "#"))
    port = int(profile.params.get("port", 1883))
    seconds = max(1.0, min(float(profile.params.get("seconds", 5.0)), timeout))
    values: list[float] = []
    times: list[str] = []

    def on_message(_client, _userdata, msg):
        if len(values) >= max_points:
            return
        try:
            payload = msg.payload.decode("utf-8", errors="replace")
            value = finite_float(payload)
            if value is None:
                value = float(len(payload))
            values.append(value)
            times.append(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
        except Exception:
            pass

    client = mqtt.Client()
    client.on_message = on_message
    client.connect(host, port, keepalive=int(seconds) + 5)
    client.subscribe(topic)
    client.loop_start()
    time.sleep(seconds)
    client.loop_stop()
    client.disconnect()
    if len(values) < 4:
        raise RuntimeError("mqtt provider collected too few messages")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"MQTT {topic}",
        sensor_name=f"MQTT snapshot {host}:{port}/{topic}",
        times=times,
        values=values,
        unit=str(profile.params.get("unit", "payload")),
        metadata={"host": host, "port": port, "topic": topic},
    )


def fetch_serial_snapshot(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    try:
        import serial
    except Exception as exc:
        raise RuntimeError("serial provider requires optional dependency pyserial") from exc
    port = str(profile.params.get("port") or "")
    if not port:
        raise ValueError("serial provider requires port")
    baud = int(profile.params.get("baud", 9600))
    seconds = max(1.0, min(float(profile.params.get("seconds", 5.0)), timeout))
    values: list[float] = []
    times: list[str] = []
    deadline = time.time() + seconds
    with serial.Serial(port, baudrate=baud, timeout=0.5) as ser:
        while time.time() < deadline and len(values) < max_points:
            line = ser.readline().decode("utf-8", errors="replace").strip()
            if not line:
                continue
            value = finite_float(line)
            values.append(value if value is not None else float(len(line)))
            times.append(datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"))
    if len(values) < 4:
        raise RuntimeError("serial provider collected too few rows")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"Serial {port}",
        sensor_name=f"Serial snapshot {port}@{baud}",
        times=times,
        values=values,
        unit=str(profile.params.get("unit", "line")),
        metadata={"port": port, "baud": baud},
    )

