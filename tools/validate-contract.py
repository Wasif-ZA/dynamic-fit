#!/usr/bin/env python3
"""Check every file in contract/examples/ against the schemas, and check the
geometry is physically possible.

Schema validation alone is not enough. A response can be perfectly well-formed
JSON and still describe items sticking through the side of the box or occupying
the same space as each other. This catches both.

Run it with no setup:

    uv run --with jsonschema tools/validate-contract.py

This is repo tooling, not solver code. It stays Python whatever we write the
solver in.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    sys.exit("needs jsonschema: uv run --with jsonschema tools/validate-contract.py")

ROOT = Path(__file__).resolve().parent.parent
CONTRACT = ROOT / "contract"
EXAMPLES = CONTRACT / "examples"


def overlaps(a: dict, b: dict) -> bool:
    """True if two placements share any volume.

    Two axis-aligned boxes overlap only if they overlap on all three axes.
    Touching faces do not count: an item ending at x=150 and the next starting
    at x=150 is correct packing, not a collision.
    """
    for axis, dim in (("x", "width"), ("y", "height"), ("z", "depth")):
        a_lo, a_hi = a["position"][axis], a["position"][axis] + a["size"][dim]
        b_lo, b_hi = b["position"][axis], b["position"][axis] + b["size"][dim]
        if a_hi <= b_lo or b_hi <= a_lo:
            return False
    return True


def check_geometry(response: dict) -> list[str]:
    """Every placement inside its box, and no two sharing space."""
    problems: list[str] = []
    steps: list[int] = []

    for container in response.get("containers", []):
        cid = container["instanceId"]
        interior = container["interior"]
        placements = container["placements"]

        for p in placements:
            steps.append(p["step"])
            label = f"{cid} step {p['step']} ({p['itemId']} unit {p['unit']})"
            for axis, dim in (("x", "width"), ("y", "height"), ("z", "depth")):
                far = p["position"][axis] + p["size"][dim]
                if far > interior[dim]:
                    problems.append(
                        f"{label} sticks out of the box: {axis} reaches {far} mm "
                        f"but the interior {dim} is {interior[dim]} mm"
                    )

        for i, a in enumerate(placements):
            for b in placements[i + 1 :]:
                if overlaps(a, b):
                    problems.append(
                        f"{cid} steps {a['step']} and {b['step']} occupy the same space"
                    )

    if steps and sorted(steps) != list(range(1, len(steps) + 1)):
        problems.append(
            f"step numbers must be 1..{len(steps)} with no gaps or repeats across the "
            f"whole response, got {sorted(steps)}"
        )

    return problems


def check_status(response: dict) -> list[str]:
    """status must agree with what is actually in containers and unpacked."""
    placed = sum(len(c["placements"]) for c in response.get("containers", []))
    unpacked = len(response.get("unpacked", []))

    if placed and unpacked:
        expected = "partial"
    elif placed:
        expected = "solved"
    else:
        expected = "rejected"

    actual = response["status"]
    if actual != expected:
        return [
            f"status is '{actual}' but {placed} placed and {unpacked} unpacked "
            f"means it should be '{expected}'"
        ]
    return []


def main() -> int:
    request_schema = json.loads((CONTRACT / "packing-request.schema.json").read_text())
    response_schema = json.loads((CONTRACT / "packing-response.schema.json").read_text())

    files = sorted(EXAMPLES.glob("*.json"))
    if not files:
        print(f"no examples found in {EXAMPLES}")
        return 1

    failures = 0
    for path in files:
        rel = path.relative_to(ROOT).as_posix()
        doc = json.loads(path.read_text())
        is_request = path.name.endswith(".request.json")
        schema = request_schema if is_request else response_schema

        problems: list[str] = []
        try:
            jsonschema.validate(doc, schema)
        except jsonschema.ValidationError as err:
            where = "/".join(str(p) for p in err.absolute_path) or "(root)"
            problems.append(f"schema: {err.message} at {where}")
        else:
            if not is_request:
                problems += check_status(doc)
                problems += check_geometry(doc)

        if problems:
            failures += 1
            print(f"FAIL  {rel}")
            for problem in problems:
                print(f"        {problem}")
        else:
            print(f"ok    {rel}")

    print()
    if failures:
        print(f"{failures} of {len(files)} example(s) failed")
        return 1
    print(f"all {len(files)} examples valid")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
