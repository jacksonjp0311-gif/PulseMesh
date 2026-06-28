from __future__ import annotations

from pathlib import Path
from typing import Any

from .util import load_json


def validate_profiles_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        obj = load_json(path)
    except Exception as exc:
        return [f"failed to read JSON: {exc}"]

    profiles = obj.get("profiles") if isinstance(obj, dict) else obj
    if not isinstance(profiles, list):
        return ["profile file must be a list or object with a profiles list"]
    seen: set[str] = set()
    for i, profile in enumerate(profiles):
        prefix = f"profiles[{i}]"
        if not isinstance(profile, dict):
            errors.append(f"{prefix} must be an object")
            continue
        pid = profile.get("id")
        provider = profile.get("provider")
        if not isinstance(pid, str) or not pid.strip():
            errors.append(f"{prefix}.id is required")
        elif pid in seen:
            errors.append(f"{prefix}.id duplicates {pid}")
        else:
            seen.add(pid)
        if not isinstance(provider, str) or not provider.strip():
            errors.append(f"{prefix}.provider is required")
        if provider in {"openmeteo", "openmeteo_air"}:
            if "lat" not in profile or "lon" not in profile:
                errors.append(f"{prefix} provider {provider} requires lat and lon")
        if provider in {"csv", "local_csv"} and not (profile.get("path") or profile.get("file")):
            errors.append(f"{prefix} provider csv requires path or file")
        for j, rule in enumerate(profile.get("alerts", []) or []):
            if not isinstance(rule, dict):
                errors.append(f"{prefix}.alerts[{j}] must be an object")
                continue
            if "metric" not in rule or "threshold" not in rule:
                errors.append(f"{prefix}.alerts[{j}] requires metric and threshold")
    return errors


def validate_summary_file(path: Path) -> list[str]:
    errors: list[str] = []
    try:
        obj = load_json(path)
    except Exception as exc:
        return [f"failed to read JSON: {exc}"]
    if not isinstance(obj, dict):
        return ["summary must be an object"]
    if "mesh" not in obj:
        errors.append("summary.mesh is required")
    if not isinstance(obj.get("sensors"), list):
        errors.append("summary.sensors must be a list")
    for i, sensor in enumerate(obj.get("sensors", []) if isinstance(obj.get("sensors"), list) else []):
        if not isinstance(sensor, dict):
            errors.append(f"sensors[{i}] must be an object")
            continue
        for key in ("profile_id", "provider", "metrics"):
            if key not in sensor:
                errors.append(f"sensors[{i}].{key} is required")
    return errors

