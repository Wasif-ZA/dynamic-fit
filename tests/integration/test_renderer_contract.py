"""Can the renderer actually draw a solution document?

The Python suites check the document against the published JSON Schema. The schema
says what a solution must contain; it does not say what `apps/visualiser/
visualiser.js` reads. Those drifted apart once already, which is how the Portal
came to be emitting field names the solver could not parse.

`renderer_contract.mjs` extracts the field list from the renderer's own source, so
this test fails if either side moves.

The checks that solved orders through the Portal first needed a database, so they
have been removed for now. The committed fixtures are still checked below.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "tests" / "integration" / "renderer_contract.mjs"

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="node is not on PATH; the renderer check cannot run"
)


def check_with_node(document: dict, tmp_path: Path) -> str:
    path = tmp_path / "solution.json"
    path.write_text(json.dumps(document), encoding="utf-8")

    result = subprocess.run(
        ["node", str(CHECKER), str(path)],
        capture_output=True,
        text=True,
        cwd=ROOT,
        timeout=60,
    )
    assert result.returncode == 0, f"renderer contract failed:\n{result.stdout}\n{result.stderr}"
    return result.stdout


@pytest.mark.parametrize(
    "fixture", sorted((ROOT / "contract" / "fixtures").glob("*.json")), ids=lambda p: p.stem
)
def test_every_committed_fixture_satisfies_the_renderer(fixture, tmp_path):
    """The fixtures are what the visualiser team builds against day to day, so a
    renderer change that outgrows them should fail here rather than in a demo."""
    check_with_node(json.loads(fixture.read_text(encoding="utf-8")), tmp_path)
