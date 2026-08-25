#!/usr/bin/env python3
"""Validate the contract and optionally build its distributable bundle.

Run from the repo root after installing ``fitsolver[dev]``:

    python contract/validate_fixtures.py
    python contract/validate_fixtures.py --bundle
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path
from zipfile import ZIP_STORED, ZipFile, ZipInfo

import jsonschema
from jsonschema.validators import validator_for

from fitsolver.engine import solve
from fitsolver.io import SCHEMA_VERSION

ROOT = Path(__file__).resolve().parent
FIXTURES = sorted((ROOT / "fixtures").glob("*.json"))
FIXED_ZIP_TIME = (1980, 1, 1, 0, 0, 0)


def overlaps(pa, da, pb, db) -> bool:
    return all(pa[i] < pb[i] + db[i] and pb[i] < pa[i] + da[i] for i in range(3))


def check_physics(doc: dict) -> list[str]:
    errs: list[str] = []
    for carton in doc["cartons"]:
        cid, inner = carton["carton_id"], carton["inner_dims"]
        placements = carton["placements"]

        ids = [p["placement_id"] for p in placements]
        if len(set(ids)) != len(ids):
            errs.append(f"{cid}: duplicate placement_id")
        seqs = [p["sequence"] for p in placements]
        if len(set(seqs)) != len(seqs):
            errs.append(f"{cid}: duplicate sequence, step-through would skip an item")

        for i, placement in enumerate(placements):
            pos, dims = placement["position"], placement["dims"]
            if any(pos[k] < 0 or pos[k] + dims[k] > inner[k] for k in range(3)):
                errs.append(
                    f"{cid}/{placement['placement_id']}: {pos}+{dims} outside carton {inner}"
                )
            for other in placements[i + 1 :]:
                if overlaps(pos, dims, other["position"], other["dims"]):
                    errs.append(
                        f"{cid}: {placement['placement_id']} overlaps {other['placement_id']}"
                    )

        mass = sum(placement["mass"] for placement in placements)
        if mass != carton["contents_mass"]:
            errs.append(f"{cid}: contents_mass {carton['contents_mass']} != sum of items {mass}")

    count = len(doc["cartons"])
    if doc["metrics"]["carton_count"] != count:
        errs.append(f"metrics.carton_count {doc['metrics']['carton_count']} != {count} cartons")
    return errs


def load_checked_schema(name: str) -> tuple[dict, jsonschema.protocols.Validator]:
    schema = json.loads((ROOT / name).read_text(encoding="utf-8"))
    validator_class = validator_for(schema)
    validator_class.check_schema(schema)
    return schema, validator_class(schema)


def check_contract() -> tuple[int, dict, dict]:
    if not FIXTURES:
        print("no fixtures found", file=sys.stderr)
        return 1, {}, {}

    request_schema, request_validator = load_checked_schema("request.schema.json")
    solution_schema, solution_validator = load_checked_schema("solution.schema.json")

    request = json.loads((ROOT / "fixtures_request_example.json").read_text(encoding="utf-8"))
    request_validator.validate(request)
    solution_validator.validate(solve(request))

    id_version = solution_schema["$id"].rstrip("/").rsplit("/", 1)[-1]
    const_version = solution_schema["properties"]["schema_version"]["const"]
    if not (SCHEMA_VERSION == id_version == const_version):
        print(
            "solution version mismatch: "
            f"io={SCHEMA_VERSION}, id={id_version}, const={const_version}",
            file=sys.stderr,
        )
        return 1, request_schema, solution_schema

    failed = 0
    for path in FIXTURES:
        document = json.loads(path.read_text(encoding="utf-8"))
        errors: list[str] = []
        try:
            solution_validator.validate(document)
        except jsonschema.ValidationError as error:
            errors.append(f"schema: {error.json_path}: {error.message}")
        if document.get("schema_version") != SCHEMA_VERSION:
            errors.append(
                f"schema_version {document.get('schema_version')!r} != {SCHEMA_VERSION!r}"
            )
        errors += check_physics(document)

        if errors:
            failed += 1
            print(f"FAIL {path.name}")
            for error in errors:
                print(f"     {error}")
        else:
            print(f"ok   {path.name}")

    print(f"\n{len(FIXTURES) - failed}/{len(FIXTURES)} fixtures valid")
    return (1 if failed else 0), request_schema, solution_schema


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def write_zip(path: Path, entries: list[tuple[str, bytes]]) -> None:
    with ZipFile(path, "w") as archive:
        for name, data in entries:
            info = ZipInfo(name, FIXED_ZIP_TIME)
            info.compress_type = ZIP_STORED
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)


def build_bundle(request_schema: dict, solution_schema: dict) -> Path:
    fixtures_zip = ROOT / "fixtures.zip"
    write_zip(
        fixtures_zip,
        [(f"fixtures/{path.name}", path.read_bytes()) for path in FIXTURES],
    )

    source_files = [
        ROOT / "request.schema.json",
        ROOT / "solution.schema.json",
        ROOT / "fixtures_request_example.json",
        *FIXTURES,
    ]
    manifest = {
        "schema_version": SCHEMA_VERSION,
        "request_schema_id": request_schema["$id"],
        "solution_schema_id": solution_schema["$id"],
        "fixture_count": len(FIXTURES),
        "files": {
            path.relative_to(ROOT).as_posix(): digest(path) for path in source_files
        },
    }
    manifest["files"]["fixtures.zip"] = digest(fixtures_zip)

    manifest_path = ROOT / "contract-manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )

    bundle_path = ROOT / f"contract-{SCHEMA_VERSION}.zip"
    bundle_files = [*source_files, fixtures_zip, manifest_path]
    write_zip(
        bundle_path,
        [(path.relative_to(ROOT).as_posix(), path.read_bytes()) for path in bundle_files],
    )
    checksum_path = ROOT / f"{bundle_path.name}.sha256"
    checksum_path.write_text(
        f"{digest(bundle_path)}  {bundle_path.name}\n",
        encoding="utf-8",
        newline="\n",
    )
    return bundle_path


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bundle", action="store_true", help="build the validated contract bundle")
    args = parser.parse_args()

    result, request_schema, solution_schema = check_contract()
    if result:
        return result
    if args.bundle:
        print(f"built {build_bundle(request_schema, solution_schema)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
