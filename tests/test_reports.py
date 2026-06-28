import tempfile
import unittest
from pathlib import Path

from pulsemesh.reports import compare_summaries
from pulsemesh.util import write_json


class ReportTests(unittest.TestCase):
    def test_compare_summaries_computes_mesh_delta(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            before = root / "before.json"
            after = root / "after.json"
            base = {
                "mesh": {"mesh_health": 0.5, "mesh_coherence": 0.6, "fallback_sensor_count": 1},
                "sensors": [{
                    "profile_id": "a",
                    "used_live_data": True,
                    "metrics": {"health_score": 0.5, "anomaly_score": 0.5, "coherence_avg": 0.5},
                }],
            }
            newer = {
                "mesh": {"mesh_health": 0.8, "mesh_coherence": 0.7, "fallback_sensor_count": 0},
                "sensors": [{
                    "profile_id": "a",
                    "used_live_data": False,
                    "metrics": {"health_score": 0.7, "anomaly_score": 0.3, "coherence_avg": 0.6},
                }],
            }
            write_json(before, base)
            write_json(after, newer)

            diff = compare_summaries(before, after)

            self.assertAlmostEqual(diff["mesh"]["health_delta"], 0.3)
            self.assertEqual(diff["mesh"]["fallback_delta"], -1)
            self.assertTrue(diff["sensors"][0]["live_data_changed"])


if __name__ == "__main__":
    unittest.main()

