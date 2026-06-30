from __future__ import annotations

import json
import re
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET


KML_NS = {"k": "http://www.opengis.net/kml/2.2"}
BLOCK_CODE_RE = re.compile(r"^[0-9A-Z]+(?:-[0-9A-Z]+)+$", re.IGNORECASE)


def parse_coordinates(text: str) -> list[list[float]]:
    points: list[list[float]] = []
    for token in (text or "").split():
        parts = token.split(",")
        if len(parts) < 2:
            continue
        try:
            lon = float(parts[0])
            lat = float(parts[1])
        except ValueError:
            continue
        points.append([lon, lat])
    return points


def polygon_rings(placemark: ET.Element) -> list[list[list[float]]]:
    rings: list[list[list[float]]] = []
    for coord in placemark.findall(".//k:Polygon/k:outerBoundaryIs/k:LinearRing/k:coordinates", KML_NS):
        ring = parse_coordinates(coord.text or "")
        if len(ring) >= 3:
            rings.append(ring)
    return rings


def extended_data(placemark: ET.Element) -> dict[str, str]:
    result: dict[str, str] = {}
    for data in placemark.findall(".//k:ExtendedData/k:Data", KML_NS):
        key = data.attrib.get("name", "").strip()
        value = data.findtext("k:value", default="", namespaces=KML_NS).strip()
        if key and value:
            result[key] = value
    return result


def build_geojson(kmz_path: Path) -> dict:
    with zipfile.ZipFile(kmz_path) as archive:
        kml_name = next(name for name in archive.namelist() if name.lower().endswith(".kml"))
        root = ET.fromstring(archive.read(kml_name))

    features = []
    bounds = [180.0, 90.0, -180.0, -90.0]
    for placemark in root.findall(".//k:Placemark", KML_NS):
        name = (placemark.findtext("k:name", default="", namespaces=KML_NS) or "").strip()
        block_code = name.upper().replace(" ", "")
        if not block_code or not BLOCK_CODE_RE.match(block_code):
            continue
        rings = polygon_rings(placemark)
        if not rings:
            continue
        for ring in rings:
            for lon, lat in ring:
                bounds[0] = min(bounds[0], lon)
                bounds[1] = min(bounds[1], lat)
                bounds[2] = max(bounds[2], lon)
                bounds[3] = max(bounds[3], lat)
        props = extended_data(placemark)
        props.update({"block_code": block_code, "name": name})
        features.append(
            {
                "type": "Feature",
                "properties": props,
                "geometry": {"type": "Polygon", "coordinates": rings},
            }
        )

    features.sort(key=lambda feature: feature["properties"]["block_code"])
    return {
        "type": "FeatureCollection",
        "source": {
            "file": str(kmz_path).replace("\\", "/"),
            "generated_at": datetime.now().replace(microsecond=0).isoformat(),
            "feature_count": len(features),
        },
        "bounds": bounds if features else [],
        "features": features,
    }


def main() -> int:
    if len(sys.argv) != 3:
        print("Usage: build_block_map_geojson.py <source.kmz> <output.json>", file=sys.stderr)
        return 2
    source = Path(sys.argv[1])
    output = Path(sys.argv[2])
    data = build_geojson(source)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {len(data['features'])} block polygons to {output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
