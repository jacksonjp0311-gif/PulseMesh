from __future__ import annotations

from pathlib import Path


def replace_all(path: Path, replacements: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    original = text
    for a, b in replacements:
        if a not in text:
            print(f"[WARN] pattern not found in {path}: {a!r}")
        text = text.replace(a, b)
    if text != original:
        path.write_text(text, encoding="utf-8", newline="\n")
        print(f"[OK] patched {path}")
    else:
        print(f"[OK] no change {path}")


def main() -> None:
    # providers.py: Callable import + open() mode + import ordering block
    providers = Path("src/pulsemesh/providers.py")
    replace_all(
        providers,
        [
            (
                "import math\nimport urllib.parse\nimport csv\nfrom datetime import datetime, timedelta, timezone\nfrom typing import Callable\n",
                "import csv\nimport math\nimport urllib.parse\nfrom collections.abc import Callable\nfrom datetime import datetime, timedelta, timezone\n",
            ),
            (
                'with open(str(path_value), "r", encoding="utf-8-sig", newline="") as f:',
                'with open(str(path_value), encoding="utf-8-sig", newline="") as f:',
            ),
            (
                "from typing import Callable\n",
                "from collections.abc import Callable\n",
            ),
        ],
    )

    # schemas.py: remove unused Any
    schemas = Path("src/pulsemesh/schemas.py")
    replace_all(
        schemas,
        [
            (
                "from pathlib import Path\nfrom typing import Any\n\nfrom .util import load_json\n",
                "from pathlib import Path\n\nfrom .util import load_json\n",
            ),
            (
                "from typing import Any\n",
                "",
            ),
        ],
    )

    # streams.py: remove unused title
    streams = Path("src/pulsemesh/streams.py")
    replace_all(
        streams,
        [
            (
                '        title = "".join(item.findtext("title") or "")\n        body = " ".join(item.itertext())\n',
                '        body = " ".join(item.itertext())\n',
            )
        ],
    )

    # test_profiles.py: import ordering
    test_profiles = Path("tests/test_profiles.py")
    replace_all(
        test_profiles,
        [
            (
                "from pathlib import Path\nimport unittest\n\nfrom pulsemesh.cli import load_profiles\n",
                "import unittest\nfrom pathlib import Path\n\nfrom pulsemesh.cli import load_profiles\n",
            )
        ],
    )

    # alerts.py: remove unused Any and sort
    alerts = Path("src/pulsemesh/alerts.py")
    replace_all(
        alerts,
        [
            ("from typing import Any\n\n\n", ""),
            ("from typing import Any\n", ""),
        ],
    )

    # models.py: remove quotes in return type annotation
    models = Path("src/pulsemesh/models.py")
    replace_all(
        models,
        [
            (
                'def from_dict(cls, obj: dict[str, Any]) -> "TelemetryProfile":',
                "def from_dict(cls, obj: dict[str, Any]) -> TelemetryProfile:",
            )
        ],
    )

    # artifacts.py: zip strict
    artifacts = Path("src/pulsemesh/artifacts.py")
    replace_all(
        artifacts,
        [
            (
                "rows = zip(series.times, series.values, fusion.normalized, fusion.delta, fusion.coherence)",
                "rows = zip(series.times, series.values, fusion.normalized, fusion.delta, fusion.coherence, strict=False)",
            )
        ],
    )


if __name__ == "__main__":
    main()
