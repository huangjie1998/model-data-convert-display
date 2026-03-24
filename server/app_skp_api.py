#!/usr/bin/env python3
"""
瀵よ櫣鐡氶崶鍓х剨濞村繗顫嶉崳?- 閸氬海顏張宥呭閿涘牆鎯?SketchUp C API 閺€顖涘瘮閿?
"""

import os
import sys
import uuid
import shutil
import subprocess
import json
import struct
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import logging

# 闁板秶鐤嗛弮銉ョ箶
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# SketchUp C API 濡€虫健閸旂姾娴?
# ============================================================================

# 閺屻儲澹楧LL鐠侯垰绶?
BASE_DIR = Path(__file__).parent
DLL_PATHS = [
    BASE_DIR / 'skp_converter' / 'build' / 'bin' / 'Release' / 'skp_converter.dll',  # local build output
    BASE_DIR / 'skp_converter' / 'build_verify' / 'bin' / 'Release' / 'skp_converter.dll',  # verify build output
    BASE_DIR / 'skp_converter' / 'skp_converter.dll',  # dev path
    BASE_DIR / '..' / 'skp_converter_deploy' / 'skp_converter.dll',  # deploy path
    Path('C:/development/妯″瀷鏁版嵁杞崲鏄剧ず/skp_converter_deploy/skp_converter.dll'),  # absolute fallback
]

def resolve_skp_dll_path():
    """Resolve the converter DLL path deterministically.

    Priority:
    1) SKP_DLL_PATH env override
    2) Newest existing file among DLL_PATHS
    """
    env_path = os.environ.get('SKP_DLL_PATH', '').strip()
    if env_path:
        p = Path(env_path)
        if p.exists():
            resolved = str(p.resolve())
            logger.info(f"Using SKP DLL from env SKP_DLL_PATH: {resolved}")
            return resolved
        logger.warning(f"SKP_DLL_PATH is set but not found: {env_path}")

    existing = [p for p in DLL_PATHS if p.exists()]
    if not existing:
        return None

    newest = max(existing, key=lambda p: p.stat().st_mtime)
    resolved = str(newest.resolve())
    logger.info(f"Using newest SKP converter DLL: {resolved}")
    return resolved

SKP_DLL_PATH = resolve_skp_dll_path()

# 鐏忔繆鐦€电厧鍙?SketchUp C API 濡€虫健
try:
    if SKP_DLL_PATH:
        # 娑撳瓨妞傚ǎ璇插DLL閻╊喖缍嶉崚鐧橝TH閿涘湹indows闂団偓鐟曚緤绱?
        dll_dir = str(Path(SKP_DLL_PATH).parent)
        if dll_dir not in os.environ['PATH']:
            os.environ['PATH'] = dll_dir + os.pathsep + os.environ['PATH']
        
        from skp_converter import SKPConverter, convert_skp_to_glb as skp_c_convert
        SKP_API_AVAILABLE = True
        logger.info("SketchUp C API module loaded successfully")
    else:
        raise FileNotFoundError("skp_converter.dll not found")
except Exception as e:
    SKP_API_AVAILABLE = False
    SKP_DLL_PATH = None
    logger.warning(f"SketchUp C API not available: {e}")

# ============================================================================
# Flask 鎼存梻鏁ら柊宥囩枂
# ============================================================================

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# 閺傚洣娆㈤柊宥囩枂
UPLOAD_FOLDER = BASE_DIR / 'uploads'
CONVERTED_FOLDER = BASE_DIR / 'converted'
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# 閸掓稑缂撻惄顔肩秿
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
CONVERTED_FOLDER.mkdir(parents=True, exist_ok=True)

# 閸忎浇顔忛惃鍕瀮娴犺埖澧跨仦鏇炴倳
ALLOWED_3D_EXTENSIONS = {'skp', 'gltf', 'glb', 'obj', 'fbx'}
ALLOWED_2D_EXTENSIONS = {'dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg'}
ALLOWED_EXTENSIONS = ALLOWED_3D_EXTENSIONS | ALLOWED_2D_EXTENSIONS

# ============================================================================
# 瀹搞儱鍙块崙鑺ユ殶
# ============================================================================

def allowed_file(filename):
    """Check whether the file extension is allowed."""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
    """Return the high-level file category and extension type."""
    ext = filename.rsplit('.', 1)[1].lower() if '.' in filename else ''
    if ext in {'skp'}:
        return '3d', 'skp'
    elif ext in {'dwg', 'dxf'}:
        return '2d', ext
    elif ext in {'gltf', 'glb', 'obj', 'fbx'}:
        return '3d', ext
    elif ext in {'pdf', 'png', 'jpg', 'jpeg'}:
        return '2d', ext
    return None, None


def check_conversion_tools():
    """Return converter tool availability."""
    tools = {
        'skp_api': SKP_API_AVAILABLE,
        'skp_dll_path': SKP_DLL_PATH,
        'librecad': shutil.which('librecad') is not None,
        'librecad_cli': shutil.which('librecad2pdf') is not None,
        'oda_converter': shutil.which('ODAFileConverter') is not None,
        'assimp': shutil.which('assimp') is not None,
        'blender': shutil.which('blender') is not None,
    }
    return tools


# ============================================================================
# SKP 鏉烆剚宕查崙鑺ユ殶
# ============================================================================


def parse_glb_bbox_m(glb_path: Path):
    """Extract bbox from GLB POSITION accessors (units: meters)."""
    try:
        data = glb_path.read_bytes()
        if len(data) < 20 or data[0:4] != b'glTF':
            return None

        offset = 12
        gltf_json = None
        while offset + 8 <= len(data):
            chunk_len, chunk_type = struct.unpack_from('<II', data, offset)
            offset += 8
            chunk = data[offset: offset + chunk_len]
            offset += chunk_len
            if chunk_type == 0x4E4F534A:  # JSON
                gltf_json = json.loads(chunk.decode('utf-8'))
                break

        if not gltf_json:
            return None

        accessors = gltf_json.get('accessors', [])
        mins = [float('inf'), float('inf'), float('inf')]
        maxs = [float('-inf'), float('-inf'), float('-inf')]
        found = False

        for mesh in gltf_json.get('meshes', []):
            for prim in mesh.get('primitives', []):
                pos_idx = prim.get('attributes', {}).get('POSITION')
                if pos_idx is None or pos_idx < 0 or pos_idx >= len(accessors):
                    continue
                acc = accessors[pos_idx]
                amin = acc.get('min')
                amax = acc.get('max')
                if not isinstance(amin, list) or not isinstance(amax, list) or len(amin) < 3 or len(amax) < 3:
                    continue
                found = True
                for i in range(3):
                    mins[i] = min(mins[i], float(amin[i]))
                    maxs[i] = max(maxs[i], float(amax[i]))

        if not found:
            return None

        size = [maxs[i] - mins[i] for i in range(3)]
        center = [(maxs[i] + mins[i]) * 0.5 for i in range(3)]
        diagonal = (size[0] ** 2 + size[1] ** 2 + size[2] ** 2) ** 0.5
        return {
            'min': mins,
            'max': maxs,
            'size': size,
            'center': center,
            'diagonal': diagonal,
        }
    except Exception as e:
        logger.warning(f"Failed to parse GLB bbox: {e}")
        return None


def build_skp_conversion_debug(source_units_preference=None, source_units_enum=None, output_bbox_m=None, converter_error=None):
    debug = {
        'source_units_preference': source_units_preference or 'unknown',
        'source_units_enum': source_units_enum if source_units_enum is not None else -1,
        'geometry_native_unit': 'inch',
        'applied_scale_to_meter': 0.0254,
        'output_bbox_m': output_bbox_m,
    }
    if converter_error:
        debug['converter_error'] = converter_error
    return debug
def convert_skp_using_api(input_path: Path, output_path: Path) -> tuple:
    """Convert SKP using SketchUp C API and return (success, debug)."""
    if not SKP_API_AVAILABLE or not SKP_DLL_PATH:
        logger.error("SKP C API not available")
        return False, build_skp_conversion_debug(converter_error='skp_api_unavailable')
    
    import tempfile
    
    try:
        logger.info(f"Converting SKP using C API: {input_path} -> {output_path}")
        
        # 娴ｈ法鏁ゆ稉瀛樻閻╊喖缍嶉柆鍨帳娑擃厽鏋冪捄顖氱窞闂傤噣顣?
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_input = Path(temp_dir) / input_path.name
            temp_output = Path(temp_dir) / 'output.glb'
            
            # 婢跺秴鍩楁潏鎾冲弳閺傚洣娆㈤崚棰佸閺冨墎娲拌ぐ?
            shutil.copy2(str(input_path), str(temp_input))
            logger.info(f"Copied input to temp: {temp_input}")
            
            with SKPConverter(SKP_DLL_PATH) as converter:
                model_info = {}
                try:
                    model_info = converter.get_model_info(str(temp_input))
                except Exception as info_err:
                    logger.warning(f"Failed to read SKP model info: {info_err}")

                result = converter.convert_to_glb(str(temp_input), str(temp_output))
                if result:
                    # 婢跺秴鍩楁潏鎾冲毉閺傚洣娆㈤崚鎵窗閺嶅洣缍呯純?
                    shutil.copy2(str(temp_output), str(output_path))
                    output_bbox_m = parse_glb_bbox_m(output_path)
                    debug = build_skp_conversion_debug(
                        source_units_preference=model_info.get('units_preference'),
                        source_units_enum=model_info.get('units_enum'),
                        output_bbox_m=output_bbox_m,
                    )
                    logger.info("SKP C API conversion successful")
                    logger.info(
                        f"SKP conversion debug: units_pref={debug['source_units_preference']} "
                        f"scale={debug['applied_scale_to_meter']} bbox={debug['output_bbox_m']}"
                    )
                    return True, debug
                else:
                    converter_error = converter.get_last_error()
                    logger.error(f"SKP C API conversion failed: {converter_error}")
                    debug = build_skp_conversion_debug(
                        source_units_preference=model_info.get('units_preference'),
                        source_units_enum=model_info.get('units_enum'),
                        converter_error=converter_error,
                    )
                    return False, debug
            
    except Exception as e:
        logger.error(f"SKP C API conversion error: {e}")
        import traceback
        traceback.print_exc()
        return False, build_skp_conversion_debug(converter_error=str(e))


def convert_skp_using_blender(input_path: Path, output_path: Path) -> bool:
    """Fallback conversion via Blender."""
    try:
        logger.info(f"Converting SKP using Blender: {input_path} -> {output_path}")
        
        if shutil.which('blender'):
            script = f"""
import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
try:
    bpy.ops.import_scene.skp(filepath="{input_path}")
except:
    pass
bpy.ops.export_scene.gltf(filepath="{output_path}", export_format='GLB')
"""
            script_path = input_path.parent / 'convert.py'
            with open(script_path, 'w') as f:
                f.write(script)
            
            cmd = ['blender', '--background', '--python', str(script_path)]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            script_path.unlink(missing_ok=True)
            
            return result.returncode == 0 and output_path.exists()
        
        return False
    except Exception as e:
        logger.error(f"Blender conversion error: {e}")
        return False


def convert_skp_to_glb(input_path: Path, output_path: Path) -> tuple:
    """Convert SKP to GLB and return (success, method, debug)."""
    if SKP_API_AVAILABLE:
        success, debug = convert_skp_using_api(input_path, output_path)
        if success:
            return True, 'sketchup_c_api', debug
        logger.warning("SKP conversion failed with SketchUp C API")
        return False, '', debug

    logger.warning("SKP conversion skipped: SketchUp C API unavailable")
    return False, '', build_skp_conversion_debug(converter_error='skp_api_unavailable')


# ============================================================================
# DWG 鏉烆剚宕查崙鑺ユ殶
# ============================================================================

def convert_dwg_to_pdf(input_path: Path, output_path: Path) -> bool:
    """Convert DWG to PDF."""
    try:
        logger.info(f"Converting DWG to PDF: {input_path} -> {output_path}")
        
        if shutil.which('ODAFileConverter'):
            cmd = [
                'ODAFileConverter',
                str(input_path.parent),
                str(output_path.parent),
                'ACAD2018',
                'PDF',
                '1',
                '1',
                input_path.name
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                expected = output_path.parent / (input_path.stem + '.pdf')
                if expected.exists():
                    shutil.move(str(expected), str(output_path))
                    return True
        
        return False
    except Exception as e:
        logger.error(f"DWG to PDF conversion error: {e}")
        return False


def convert_file(input_path: Path, target_format: str) -> tuple:
    """
    閺嶈宓佹潏鎾冲弳閺傚洣娆㈢猾璇茬€烽崪宀€娲伴弽鍥ㄧ壐瀵繗绻樼悰宀冩祮閹?
    
    Returns:
        (output_path: Path or None, method: str, debug: dict or None)
    """
    input_ext = input_path.suffix.lower()
    output_path = CONVERTED_FOLDER / f"{input_path.stem}.{target_format}"
    
    logger.info(f"Converting {input_ext} to {target_format}")
    
    if input_ext == '.dwg':
        if target_format == 'pdf':
            if convert_dwg_to_pdf(input_path, output_path):
                return output_path, 'oda_converter', None
    
    elif input_ext == '.skp':
        if target_format == 'glb':
            success, method, debug = convert_skp_to_glb(input_path, output_path)
            if success:
                return output_path, method, debug
            return None, '', debug
    
    return None, '', None


# ============================================================================
# API 鐠侯垳鏁?
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health endpoint."""
    return jsonify({
        'status': 'ok',
        'service': 'CAD Converter (with SKP API)',
        'version': '1.1.0',
        'skp_api_available': SKP_API_AVAILABLE,
        'skp_dll_path': SKP_DLL_PATH
    })


@app.route('/api/converters/status', methods=['GET'])
def converter_status():
    """Converter capability endpoint."""
    return jsonify({
        'tools': check_conversion_tools(),
        'message': 'conversion tools status checked',
        'skp_api': {
            'available': SKP_API_AVAILABLE,
            'dll_path': SKP_DLL_PATH,
            'description': 'SketchUp C API for direct SKP conversion'
        }
    })


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Upload file and auto-convert if needed."""
    if 'file' not in request.files:
        return jsonify({'error': '娌℃湁鏂囦欢'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({
            'error': '娑撳秵鏁幐浣烘畱閺傚洣娆㈤弽鐓庣础',
            'supported_formats': list(ALLOWED_EXTENSIONS)
        }), 400
    
    file_id = str(uuid.uuid4())
    filename = secure_filename(file.filename)
    input_path = UPLOAD_FOLDER / f"{file_id}_{filename}"
    
    try:
        file.save(str(input_path))
        logger.info(f"File saved: {input_path}")
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        return jsonify({'error': '文件保存失败'}), 500
    
    category, file_type = get_file_type(filename)
    
    if not category:
        input_path.unlink(missing_ok=True)
        return jsonify({'error': '无法识别文件类型'}), 400
    
    # 绾喖鐣鹃惄顔界垼閺嶇厧绱?
    target_format = None
    if file_type == 'skp':
        target_format = 'glb'
    elif file_type == 'dwg':
        target_format = 'pdf'
    
    needs_conversion = target_format is not None
    
    result = {
        'file_id': file_id,
        'original_name': filename,
        'category': category,
        'original_type': file_type,
        'needs_conversion': needs_conversion,
        'converted': False,
        'converted_type': None,
        'download_url': None,
        'conversion_error': None,
        'conversion_method': None,
        'conversion_debug': None,
    }
    
    if needs_conversion:
        logger.info(f"Converting {file_type} to {target_format}")
        
        converted_path, method, conversion_debug = convert_file(input_path, target_format)
        
        if converted_path and converted_path.exists():
            final_output = CONVERTED_FOLDER / f"{file_id}.{target_format}"
            shutil.move(str(converted_path), str(final_output))
            
            result['converted'] = True
            result['converted_type'] = target_format
            result['download_url'] = f'/api/download/{file_id}.{target_format}'
            result['converted_size'] = final_output.stat().st_size
            result['conversion_method'] = method
            result['conversion_debug'] = conversion_debug
            
            logger.info(f"Conversion successful: {final_output} (method: {method})")
        else:
            result['conversion_error'] = '自动转换失败，请手动转换后上传'
            result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
            result['conversion_debug'] = conversion_debug
            result['manual_conversion_guide'] = {
                'skp': '请使用 SketchUp 导出 GLB，或检查后端 DLL 配置',
                'dwg': '请使用 AutoCAD 导出 DXF 或 PDF'
            }
            logger.warning(f"Conversion failed for {input_path}")
    else:
        result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
    
    return jsonify(result)


@app.route('/api/download/<path:filename>', methods=['GET'])
def download_file(filename):
    """娑撳娴囬弬鍥︽"""
    try:
        parts = filename.split('/')
        
        if len(parts) == 2 and parts[0] == 'original':
            file_id_ext = parts[1]
            file_id = file_id_ext.rsplit('.', 1)[0]
            
            for uploaded_file in UPLOAD_FOLDER.glob(f'{file_id}_*'):
                if uploaded_file.is_file():
                    return send_file(
                        str(uploaded_file),
                        as_attachment=False,
                        download_name=uploaded_file.name.split('_', 1)[1]
                    )
        else:
            file_path = CONVERTED_FOLDER / filename
            if file_path.exists():
                return send_file(str(file_path), as_attachment=False)
        
        return jsonify({'error': '文件未找到'}), 404
        
    except Exception as e:
        logger.error(f"Download error: {e}")
        return jsonify({'error': '下载失败'}), 500


@app.route('/api/cleanup', methods=['POST'])
def cleanup():
    """Clean temporary uploaded/converted files."""
    try:
        import time
        current_time = time.time()
        max_age = 3600  # 1鐏忓繑妞?
        
        cleaned = 0
        for folder in [UPLOAD_FOLDER, CONVERTED_FOLDER]:
            for file_path in folder.iterdir():
                if file_path.is_file():
                    file_age = current_time - file_path.stat().st_mtime
                    if file_age > max_age:
                        file_path.unlink()
                        cleaned += 1
        
        return jsonify({'message': '娓呯悊瀹屾垚', 'cleaned': cleaned})
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        return jsonify({'error': str(e)}), 500


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': f'文件过大，最大支持 {MAX_FILE_SIZE / 1024 / 1024}MB'}), 413


@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return jsonify({'error': '服务器内部错误'}), 500


# ============================================================================
# 娑撹崵鈻兼惔蹇撳弳閸?
# ============================================================================

if __name__ == '__main__':
    logger.info("=" * 60)
    logger.info("Starting CAD Converter Service (with SKP C API)")
    logger.info("=" * 60)
    logger.info(f"SKP API Available: {SKP_API_AVAILABLE}")
    logger.info(f"SKP DLL Path: {SKP_DLL_PATH}")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Converted folder: {CONVERTED_FOLDER}")
    logger.info(f"Available tools: {check_conversion_tools()}")
    logger.info("=" * 60)
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)




