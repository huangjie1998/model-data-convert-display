#!/usr/bin/env python3
"""
字体管线诊断脚本：直接查询 viewer 后端，显示每个 fontKey 的字体文件解析结果。
用法：python3 scripts/diagnose-font-pipeline.py <doc_id>
"""

import sys, json, urllib.request, urllib.error

BASE = "http://localhost:5174/api/dwg"

def fetch_json(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": f"HTTP {e.code}"}
    except Exception as e:
        return {"error": str(e)}

def main():
    if len(sys.argv) < 2:
        print("Usage: diagnose-font-pipeline.py <doc_id>")
        sys.exit(1)
    doc_id = sys.argv[1]

    # 1. 获取 session 信息（查看 text_styles）
    print("=" * 60)
    print(f"Session: {doc_id}")
    print("=" * 60)

    # 2. 获取字体列表
    fonts_url = f"{BASE}/{doc_id}/fonts"
    fonts_data = fetch_json(fonts_url)
    if "error" in fonts_data:
        print(f"ERROR fetching fonts: {fonts_data['error']}")
        sys.exit(1)

    fonts = fonts_data.get("fonts", [])
    print(f"\n总共 {fonts_data.get('count', len(fonts))} 个字体记录:")
    print("-" * 60)

    for f in fonts:
        key = f.get("key", "?")
        name = f.get("name", "?")
        style = f.get("style_name", "?")
        kind = f.get("kind", "?")
        source = f.get("source", "?")
        available = f.get("available", False)
        file_url = f.get("file_url", "?")
        usage = f.get("usage_count", 0)
        fallback = f.get("fallback_shx_hit", False)

        print(f"  key={key}")
        print(f"    style={style}  name={name}")
        print(f"    kind={kind}  source={source}  usage={usage}")
        print(f"    available={available}  fallback_hit={fallback}")
        print(f"    url={file_url}")

        if available and file_url:
            file_info = fetch_json(f"http://localhost:5174{file_url}")
            if "error" in file_info:
                print(f"    FETCH ERROR: {file_info['error']}")
            else:
                print(f"    file_path={file_info.get('path', '?')}")

    # 3. 检查 shx_fallback 信息
    print(f"\nshx_fallback_file: {fonts_data.get('shx_fallback_file', '?')}")
    print(f"shx_fallback_exists: {fonts_data.get('shx_fallback_exists', '?')}")
    print(f"shx_fallback_hit_count: {fonts_data.get('shx_fallback_hit_count', 0)}")

    # 4. 检查 shx_font_urls (main/bigfont)
    print(f"\nSHX font URLs (from session init):")
    print(f"  (check viewer inspector panel for shxFontPath/shxBigFontPath)")

    print("\n所有 font keys:", [f.get("key") for f in fonts])

if __name__ == "__main__":
    main()