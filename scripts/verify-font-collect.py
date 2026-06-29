#!/usr/bin/env python3
"""验证 _collect_session_fonts 修复：从 /entities 拉取实体，离线调用收集逻辑。"""
import sys, json, urllib.request

DOC_ID = sys.argv[1] if len(sys.argv) > 1 else None
if not DOC_ID:
    print("Usage: verify-font-collect.py <doc_id>")
    sys.exit(1)

with urllib.request.urlopen(f"http://localhost:5174/api/dwg/{DOC_ID}/entities?space_id=model&limit=500") as r:
    entities = json.loads(r.read().decode()).get("entities", [])

# 复制修复后的逻辑
TEXT_TYPES = {"TEXT", "MTEXT", "ATTRIB", "ATTDEF"}

def is_text_entity(t):
    return str(t or "").upper() in TEXT_TYPES

import re
def sanitize_key(v):
    s = re.sub(r"[^a-z0-9]+", "", str(v or "").lower().split(".")[0])
    return s or "default"

aggregated = {}

def ingest(meta):
    fk_raw = meta.get("font_key") or meta.get("font_style_name") or meta.get("font_name") or meta.get("font_family")
    if not fk_raw:
        return
    fk = sanitize_key(fk_raw)
    rec = aggregated.setdefault(fk, {
        "key": fk,
        "style_name": meta.get("font_style_name") or meta.get("style_name"),
        "name": meta.get("font_name"),
        "kind": meta.get("font_kind"),
        "usage_count": 0,
        "sources": set(),
    })
    rec["usage_count"] += 1
    rec["sources"].add(meta.get("kind", "geom"))

for ent in entities:
    et = ent.get("type")
    geom = ent.get("geom") or {}
    if is_text_entity(et):
        ingest(geom)
    prims = geom.get("primitives") or []
    for p in prims:
        if isinstance(p, dict) and str(p.get("kind", "")).lower() == "text":
            ingest({**p, "kind": "text-prim"})

print("修复后预期产出的 font keys:")
for k, r in sorted(aggregated.items()):
    print(f"  key={k!r:<12} style={r['style_name']!r:<20} kind={r['kind']!r:<8} usage={r['usage_count']} sources={r['sources']}")

print("\n当前后端 /fonts 实际产出:")
with urllib.request.urlopen(f"http://localhost:5174/api/dwg/{DOC_ID}/fonts") as r:
    backend_fonts = json.loads(r.read().decode()).get("fonts", [])
for f in backend_fonts:
    print(f"  key={f.get('key')!r:<12} usage={f.get('usage_count')}")

print(f"\n修复缺失的 key: {set(aggregated) - {f.get('key') for f in backend_fonts}}")
