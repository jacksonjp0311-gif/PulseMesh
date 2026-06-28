import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

from pulsemesh.cli import demo_workflow
from pulsemesh.util import write_json


class DemoCliTests(unittest.TestCase):
    def test_demo_workflow_writes_artifacts(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            profiles = root / "profiles.json"
            out = root / "runs"
            write_json(profiles, {"profiles": [{"id": "demo", "provider": "synthetic", "label": "Demo"}]})
            args = Namespace(
                profiles=str(profiles),
                out=str(out),
                run_id="demo-test",
                cache_dir=None,
                baseline=None,
                baseline_window=10,
                max_points=16,
                timeout=2.0,
                stability_threshold=0.70,
                refresh_seconds=30,
                no_plots=True,
            )

            rc = demo_workflow(args)

            self.assertEqual(rc, 0)
            self.assertTrue((out / "demo-test" / "state" / "summary.json").exists())
            self.assertTrue((out / "demo-test" / "report.md").exists())
            self.assertTrue((out / "demo-test" / "dashboard.html").exists())
            self.assertTrue((out / "baseline.json").exists())
            self.assertTrue((out / "history.md").exists())


if __name__ == "__main__":
    unittest.main()

