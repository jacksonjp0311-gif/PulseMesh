import unittest

from pulsemesh.alerts import evaluate_alerts


class AlertTests(unittest.TestCase):
    def test_evaluate_alerts_fires_matching_rule(self):
        state = {
            "profile_id": "sensor",
            "label": "Sensor",
            "metrics": {"health_score": 0.25},
        }
        rules = [{
            "metric": "health_score",
            "op": "<=",
            "threshold": 0.5,
            "severity": "critical",
        }]

        fired = evaluate_alerts(state, rules)

        self.assertEqual(len(fired), 1)
        self.assertEqual(fired[0]["severity"], "critical")


if __name__ == "__main__":
    unittest.main()

