import tempfile
import unittest
from pathlib import Path

from pulsemesh.dashboard import write_html_dashboard
from pulsemesh.schemas import validate_profiles_file, validate_summary_file
from pulsemesh.util import write_json


class SchemaDashboardTests(unittest.TestCase):
    def test_validate_profiles_and_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles.json"
            summary = root / "summary.json"
            write_json(profiles, {"profiles": [{"id": "s", "provider": "synthetic"}]})
            write_json(summary, {
                "mesh": {"sensor_count": 1},
                "sensors": [{"profile_id": "s", "provider": "synthetic", "metrics": {}}],
            })

            self.assertEqual(validate_profiles_file(profiles), [])
            self.assertEqual(validate_summary_file(summary), [])

    def test_dashboard_writes_html(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            summary = root / "summary.json"
            out = root / "dashboard.html"
            write_json(summary, {
                "run_id": "demo",
                "timestamp": "2026-01-01T00:00:00Z",
                "alerts": [],
                "mesh": {"sensor_count": 1, "live_sensor_count": 1, "mesh_health": 0.9},
                "sensors": [{
                    "profile_id": "s",
                    "label": "Sensor",
                    "provider": "synthetic",
                    "used_live_data": True,
                    "metrics": {"health_score": 0.9, "anomaly_score": 0.1, "coherence_avg": 0.8, "drift": 0.0},
                }],
            })

            write_html_dashboard(summary, out)

            self.assertTrue(out.exists())
            self.assertIn("PulseMesh Dashboard", out.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()

