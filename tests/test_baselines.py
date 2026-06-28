import tempfile
import unittest
from pathlib import Path

from pulsemesh.baselines import annotate_summary_with_baselines, update_baselines_from_summary
from pulsemesh.util import load_json, write_json


class BaselineTests(unittest.TestCase):
    def test_update_and_annotate_baseline(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            summary = root / "summary.json"
            baseline = root / "baseline.json"
            write_json(summary, {
                "run_id": "r1",
                "timestamp": "2026-01-01T00:00:00Z",
                "mesh": {"sensor_count": 1},
                "sensors": [{
                    "profile_id": "s1",
                    "label": "Sensor",
                    "provider": "synthetic",
                    "used_live_data": True,
                    "metrics": {"health_score": 0.8, "anomaly_score": 0.2, "coherence_avg": 0.9},
                }],
            })

            update_baselines_from_summary(summary, baseline)
            annotate_summary_with_baselines(summary, baseline)
            obj = load_json(summary)

            self.assertIn("baseline", obj["sensors"][0])
            self.assertEqual(obj["sensors"][0]["baseline"]["sample_count"], 1)


if __name__ == "__main__":
    unittest.main()

