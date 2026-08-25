"""Can the renderer actually draw what the Portal produced?

The Python suites check the document against the published JSON Schema. The schema
says what a solution must contain; it does not say what `apps/visualiser/
visualiser.js` reads. Those drifted apart once already, which is how the Portal
came to be emitting field names the solver could not parse.

`renderer_contract.mjs` extracts the field list from the renderer's own source, so
this test fails if either side moves.
"""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[2]
CHECKER = ROOT / "tests" / "integration" / "renderer_contract.mjs"

client = TestClient(app)

pytestmark = pytest.mark.skipif(
    shutil.which("node") is None, reason="node is not on PATH; the renderer check cannot run"
)


def solve_order(items: list[dict]) -> dict:
    created = client.post("/orders", json={"Items": items})
    assert created.status_code == 201, created.text
    order_id = created.json()["OrderId"]
    solved = client.post(f"/orders/{order_id}/solve")
    assert solved.status_code == 200, solved.text
    return solved.json()


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


def test_a_portal_solution_satisfies_the_renderer(tmp_path):
    document = solve_order(
        [
            {
                "ItemCode": "MUG",
                "ItemReference": "SKU-MUG",
                "Width": 100,
                "Length": 100,
                "Depth": 120,
                "Weight": 0.35,
            },
            {
                "ItemCode": "BOOK",
                "ItemReference": "SKU-BOOK",
                "Width": 150,
                "Length": 100,
                "Depth": 50,
                "Weight": 0.4,
            },
        ]
    )
    output = check_with_node(document, tmp_path)
    assert "OK:" in output


def test_a_solution_with_rejects_satisfies_the_renderer(tmp_path):
    """The rejects panel reads different fields from the carton legend."""
    document = solve_order(
        [
            {
                "ItemCode": "OK",
                "ItemReference": "SKU-OK",
                "Width": 100,
                "Length": 100,
                "Depth": 100,
                "Weight": 0.4,
            },
            {
                "ItemCode": "HUGE",
                "ItemReference": "SKU-HUGE",
                "Width": 900,
                "Length": 900,
                "Depth": 900,
                "Weight": 1.0,
            },
        ]
    )
    document_json = check_with_node(document, tmp_path)
    assert "reject(s)" in document_json
    assert len(document["rejects"]) == 1


def test_a_multi_carton_solution_satisfies_the_renderer(tmp_path):
    document = solve_order(
        [
            {
                "ItemCode": f"I{n}",
                "ItemReference": f"SKU-{n}",
                "Width": 200,
                "Length": 150,
                "Depth": 100,
                "Weight": 0.9,
            }
            for n in range(30)
        ]
    )
    # 30 x 3,000,000 mm3 against a 47,250,000 mm3 BOX-L: cannot be one carton.
    assert document["metrics"]["carton_count"] > 1
    check_with_node(document, tmp_path)


@pytest.mark.parametrize(
    "fixture", sorted((ROOT / "contract" / "fixtures").glob("*.json")), ids=lambda p: p.stem
)
def test_every_committed_fixture_satisfies_the_renderer(fixture, tmp_path):
    """The fixtures are what the visualiser team builds against day to day, so a
    renderer change that outgrows them should fail here rather than in a demo."""
    check_with_node(json.loads(fixture.read_text(encoding="utf-8")), tmp_path)
