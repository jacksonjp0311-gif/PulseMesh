import tempfile
import unittest
from pathlib import Path

from pulsemesh.history import summarize_history
from pulsemesh.models import TelemetryProfile
from pulsemesh.streams import fetch_jsonl_log
from pulsemesh.util import write_json, write_jsonl


class HistoryStreamsTests(unittest.TestCase):
    def test_history_summarizes_ledger(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            runs = root / "runs"
            write_jsonl(runs / "ledger.jsonl", {"run_id": "r1", "timestamp": "t1", "mesh": {"mesh_health": 0.4, "mesh_coherence": 0.5, "fallback_sensor_count": 1}})
            write_jsonl(runs / "ledger.jsonl", {"run_id": "r2", "timestamp": "t2", "mesh": {"mesh_health": 0.7, "mesh_coherence": 0.8, "fallback_sensor_count": 0}})
            write_json(runs / "r2" / "state" / "summary.json", {
                "mesh": {"highest_anomaly": {"profile_id": "s", "anomaly_score": 0.9}},
                "sensors": [],
            })

            summary = summarize_history(runs)

            self.assertEqual(summary["run_count"], 2)
            self.assertAlmostEqual(summary["mesh_health_trend"], 0.3)
            self.assertEqual(summary["fallback_total_window"], 1)

    def test_jsonl_provider_reads_value_field(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "events.jsonl"
            path.write_text('{"value": 1}\n{"value": 2}\n{"value": 3}\n{"value": 4}\n', encoding="utf-8")
            profile = TelemetryProfile(id="log", provider="jsonl", params={"path": str(path), "value_field": "value"})

            series = fetch_jsonl_log(profile, 10, 1.0)

            self.assertEqual(series.values, [1.0, 2.0, 3.0, 4.0])


if __name__ == "__main__":
    unittest.main()
