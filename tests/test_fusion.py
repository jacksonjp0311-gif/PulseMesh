import unittest

from pulsemesh.fusion import fuse_series, summarize_mesh
from pulsemesh.models import TelemetrySeries


class FusionTests(unittest.TestCase):
    def test_fuse_series_generates_core_metrics(self):
        series = TelemetrySeries(
            profile_id="demo",
            provider="synthetic",
            label="Demo",
            sensor_name="Demo Sensor",
            times=[str(i) for i in range(16)],
            values=[float(i) for i in range(16)],
        )
        result = fuse_series(series)

        self.assertEqual(result.metrics["points"], 16)
        self.assertGreaterEqual(result.metrics["coherence_avg"], 0.0)
        self.assertLessEqual(result.metrics["coherence_avg"], 1.0)
        self.assertGreaterEqual(result.metrics["health_score"], 0.0)
        self.assertLessEqual(result.metrics["health_score"], 1.0)
        self.assertEqual(len(result.normalized), 16)
        self.assertEqual(len(result.delta), 16)
        self.assertEqual(len(result.coherence), 16)

    def test_mesh_summary_tracks_live_and_fallback_counts(self):
        live = TelemetrySeries(
            profile_id="live",
            provider="synthetic",
            label="Live",
            sensor_name="Live",
            times=[str(i) for i in range(8)],
            values=[1.0] * 8,
            used_live_data=True,
        )
        fallback = TelemetrySeries(
            profile_id="fallback",
            provider="synthetic",
            label="Fallback",
            sensor_name="Fallback",
            times=[str(i) for i in range(8)],
            values=[1.0, 2.0, 1.0, 2.0, 1.0, 2.0, 1.0, 2.0],
            used_live_data=False,
            fallback_reason="test",
        )

        summary = summarize_mesh([(live, fuse_series(live)), (fallback, fuse_series(fallback))])

        self.assertEqual(summary["sensor_count"], 2)
        self.assertEqual(summary["live_sensor_count"], 1)
        self.assertEqual(summary["fallback_sensor_count"], 1)
        self.assertGreaterEqual(summary["mesh_health"], 0.0)
        self.assertLessEqual(summary["mesh_health"], 1.0)


if __name__ == "__main__":
    unittest.main()
