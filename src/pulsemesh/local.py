from __future__ import annotations

import os
import platform
import re
import shutil
import socket
import subprocess
import time

from .models import TelemetryProfile, TelemetrySeries


def fetch_system(profile: TelemetryProfile, max_points: int, _: float) -> TelemetrySeries:
    samples = max(4, min(max_points, int(profile.params.get("samples", 24))))
    interval = max(0.0, float(profile.params.get("interval", 0.0)))
    variable = (profile.variable or str(profile.params.get("variable", "cpu_load"))).lower()
    values: list[float] = []
    times: list[str] = []

    for i in range(samples):
        if variable in {"disk_free_percent", "disk_free"}:
            total, used, free = shutil.disk_usage(str(profile.params.get("path", ".")))
            value = 100.0 * free / total
        elif variable in {"disk_used_percent", "disk_used"}:
            total, used, free = shutil.disk_usage(str(profile.params.get("path", ".")))
            value = 100.0 * used / total
        elif variable in {"load1", "cpu_load"}:
            try:
                value = float(os.getloadavg()[0])
            except (AttributeError, OSError):
                value = _windows_cpu_proxy()
        elif variable in {"process_count", "processes"}:
            value = float(_process_count())
        elif variable in {"memory_used_percent", "memory"}:
            value = _windows_numeric("(Get-CimInstance Win32_OperatingSystem | ForEach-Object { (($_.TotalVisibleMemorySize - $_.FreePhysicalMemory) / $_.TotalVisibleMemorySize) * 100 })")
        elif variable in {"memory_free_percent"}:
            value = _windows_numeric("(Get-CimInstance Win32_OperatingSystem | ForEach-Object { ($_.FreePhysicalMemory / $_.TotalVisibleMemorySize) * 100 })")
        elif variable in {"battery_percent", "battery"}:
            value = _windows_numeric("(Get-CimInstance Win32_Battery | Measure-Object -Property EstimatedChargeRemaining -Average).Average")
        elif variable in {"uptime_hours", "uptime"}:
            value = _uptime_hours()
        elif variable in {"net_bytes_sent", "network_sent"}:
            value = float(_network_bytes(sent=True))
        elif variable in {"net_bytes_recv", "network_recv"}:
            value = float(_network_bytes(sent=False))
        else:
            raise ValueError(f"unknown system variable: {variable}")
        values.append(value)
        times.append(f"sample:{i:04d}")
        if interval > 0 and i != samples - 1:
            time.sleep(interval)

    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"System {variable}",
        sensor_name=f"Local system sensor: {platform.node()}",
        times=times,
        values=values,
        unit="percent" if "percent" in variable or variable.startswith("disk_") else "count",
        metadata={"variable": variable, "platform": platform.platform()},
    )


def fetch_ping(profile: TelemetryProfile, max_points: int, timeout: float) -> TelemetrySeries:
    host = str(profile.params.get("host") or profile.params.get("target") or "1.1.1.1")
    count = max(4, min(max_points, int(profile.params.get("count", 8))))
    values: list[float] = []
    times: list[str] = []
    for i in range(count):
        started = time.perf_counter()
        ok = _tcp_probe(host, int(profile.params.get("port", 443)), timeout)
        elapsed_ms = (time.perf_counter() - started) * 1000.0
        values.append(elapsed_ms if ok else timeout * 1000.0)
        times.append(f"probe:{i:04d}")
    return TelemetrySeries(
        profile_id=profile.id,
        provider=profile.provider,
        label=profile.label or f"TCP latency {host}",
        sensor_name=f"TCP probe {host}:{profile.params.get('port', 443)}",
        times=times,
        values=values,
        unit="ms",
        metadata={"host": host, "port": int(profile.params.get("port", 443))},
    )


def _tcp_probe(host: str, port: int, timeout: float) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _windows_cpu_proxy() -> float:
    try:
        cmd = ["powershell", "-NoProfile", "-Command", "(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average"]
        out = subprocess.check_output(cmd, text=True, timeout=5).strip()
        return float(out or 0.0)
    except Exception:
        return 0.0


def _process_count() -> int:
    try:
        cmd = ["powershell", "-NoProfile", "-Command", "(Get-Process).Count"]
        out = subprocess.check_output(cmd, text=True, timeout=5).strip()
        return int(float(out or 0))
    except Exception:
        return 0


def _windows_numeric(script: str) -> float:
    try:
        cmd = ["powershell", "-NoProfile", "-Command", script]
        out = subprocess.check_output(cmd, text=True, timeout=5).strip()
        match = re.search(r"-?\d+(?:\.\d+)?", out)
        return float(match.group(0)) if match else 0.0
    except Exception:
        return 0.0


def _uptime_hours() -> float:
    try:
        return float(time.monotonic() / 3600.0)
    except Exception:
        return 0.0


def _network_bytes(sent: bool) -> int:
    try:
        prop = "BytesSentPersec" if sent else "BytesReceivedPersec"
        script = f"(Get-CimInstance Win32_PerfFormattedData_Tcpip_NetworkInterface | Measure-Object -Property {prop} -Sum).Sum"
        return int(_windows_numeric(script))
    except Exception:
        return 0
