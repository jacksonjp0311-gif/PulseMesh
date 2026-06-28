import unittest
from pathlib import Path

from pulsemesh.cli import load_profiles


class ProfileTests(unittest.TestCase):
    def test_load_profiles_from_example(self):
        root = Path(__file__).resolve().parents[1]
        profiles = load_profiles(root / "examples" / "profiles.offline.json")

        self.assertEqual(len(profiles), 3)
        self.assertEqual(profiles[0].id, "offline_temp")
        self.assertEqual(profiles[0].provider, "synthetic")


if __name__ == "__main__":
    unittest.main()
