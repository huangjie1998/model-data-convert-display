#!/usr/bin/env python3
"""离线验证 _attach_text_font_meta + _collect_session_fonts 是否补全了 bigfont。

不依赖正在运行的后端：直接打开测试 DWG 走完整管线，dump 关键字段。
"""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from server.dwg_service_core import DwgServiceCore  # noqa: E402

DWG = ROOT / "docs" / "test" / "文字尺度测试.dwg"
print(f"opening {DWG} ...")

svc = DwgServiceCore(ROOT / "uploads")
res = svc.open_document(DWG, DWG.name)
doc_id = res.get("doc_id")
print(f"doc_id={doc_id}")

session = svc.get_session(doc_id)
print(f"text_styles ({len(session.text_styles)}):")
for name, rec in session.text_styles.items():
    print(f"  {name!r:<14} font_name={rec.get('font_name')!r:<14} bigfont_name={rec.get('bigfont_name')!r}")

print("\n样本 entity 的 geom 关键字段:")
for ents in session.entities_by_space.values():
    for ent in ents:
        if str(ent.get("type", "")).upper() != "TEXT":
            continue
        g = ent.get("geom") or {}
        if g.get("font_key") == "1":
            print(f"  id={ent['id']} font_key={g.get('font_key')!r} font_name={g.get('font_name')!r} "
                  f"bigfont_key={g.get('bigfont_key')!r} bigfont_name={g.get('bigfont_name')!r}")
            prims = g.get("primitives") or []
            for p in prims:
                if isinstance(p, dict) and p.get("kind") == "text":
                    print(f"    prim: font_key={p.get('font_key')!r} bigfont_key={p.get('bigfont_key')!r} bigfont_name={p.get('bigfont_name')!r}")
            break
    else:
        continue
    break

print("\n_collect_session_fonts 输出:")
fonts = svc._collect_session_fonts(session)
for f in fonts:
    print(f"  key={f.get('key')!r:<14} kind={f.get('kind'):<6} usage={f.get('usage_count')} "
          f"is_bigfont={f.get('is_bigfont')} available={f.get('available')} name={f.get('name')!r}")

acci = next((f for f in fonts if "acci" in str(f.get("name", "")).lower() or "acci" in str(f.get("key", "")).lower()), None)
print(f"\nACCI-KT 字体注册: {acci}")
