from __future__ import annotations

from typing import Any


OPS = {
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
}


def evaluate_alerts(sensor_state: dict[str, Any], rules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    fired: list[dict[str, Any]] = []
    metrics = sensor_state.get("metrics", {})
    for rule in rules:
        metric = str(rule.get("metric", ""))
        op = str(rule.get("op", ">="))
        threshold = rule.get("threshold")
        if metric not in metrics or op not in OPS:
            continue
        try:
            value = float(metrics[metric])
            target = float(threshold)
        except (TypeError, ValueError):
            continue
        if OPS[op](value, target):
            fired.append({
                "profile_id": sensor_state.get("profile_id"),
                "label": sensor_state.get("label"),
                "severity": rule.get("severity", "warning"),
                "metric": metric,
                "op": op,
                "threshold": target,
                "value": value,
                "message": rule.get("message") or f"{metric} {op} {target}",
            })
    return fired

