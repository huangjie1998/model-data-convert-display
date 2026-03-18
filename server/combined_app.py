#!/usr/bin/env python3
"""
建筑图纸模型浏览器 - 组合应用
同时提供前端静态文件和后端 API 服务
"""

import os
import uuid
import shutil
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify, send_file, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# 获取项目根目录
BASE_DIR = Path(__file__).parent.parent
SERVER_DIR = Path(__file__).parent
DIST_DIR = BASE_DIR / 'dist'
UPLOAD_FOLDER = SERVER_DIR / 'uploads'
CONVERTED_FOLDER = SERVER_DIR / 'converted'
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# 创建目录
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
CONVERTED_FOLDER.mkdir(parents=True, exist_ok=True)

app = Flask(__name__, static_folder=str(DIST_DIR), static_url_path='')
CORS(app)

# 允许的文件扩展名
ALLOWED_3D_EXTENSIONS = {'skp', 'gltf', 'glb', 'obj', 'fbx'}
ALLOWED_2D_EXTENSIONS = {'dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg'}
ALLOWED_EXTENSIONS = ALLOWED_3D_EXTENSIONS | ALLOWED_2D_EXTENSIONS


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
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


def get_target_format(original_type):
    conversion_map = {
        'skp': 'glb',
        'dwg': 'pdf',
        'dxf': None,
    }
    return conversion_map.get(original_type)


def check_conversion_tools():
    """检查可用的转换工具"""
    tools = {
        'ODAFileConverter': shutil.which('ODAFileConverter') is not None,
        'librecad': shutil.which('librecad') is not None,
        'librecad2pdf': shutil.which('librecad2pdf') is not None,
        'assimp': shutil.which('assimp') is not None,
        'blender': shutil.which('blender') is not None,
        'inkscape': shutil.which('inkscape') is not None,
        'convert': shutil.which('convert') is not None,
        'teigha': shutil.which('teighafileconverter') is not None,
    }
    return tools


def convert_dwg_to_pdf(input_path: Path, output_path: Path) -> bool:
    """将 DWG 转换为 PDF"""
    try:
        logger.info(f"Converting DWG to PDF: {input_path} -> {output_path}")
        
        # 方法1: 使用 ODA File Converter
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
            logger.info(f"ODAFileConverter result: {result.returncode}")
            if result.returncode == 0:
                expected = output_path.parent / (input_path.stem + '.pdf')
                if expected.exists():
                    shutil.move(str(expected), str(output_path))
                    logger.info(f"ODA conversion successful: {output_path}")
                    return True
            else:
                logger.warning(f"ODA conversion failed: {result.stderr}")
        
        # 方法2: 使用 Teigha File Converter
        if shutil.which('teighafileconverter'):
            cmd = [
                'teighafileconverter',
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
        
        # 方法3: 使用 DWG 到 DXF 再到 PDF
        dxf_path = input_path.parent / f"{input_path.stem}.dxf"
        if convert_dwg_to_dxf(input_path, dxf_path):
            if shutil.which('inkscape'):
                cmd = ['inkscape', str(dxf_path), '--export-filename', str(output_path), '--export-type=pdf']
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)
                dxf_path.unlink(missing_ok=True)
                if result.returncode == 0 and output_path.exists():
                    return True
        
        return False
    except Exception as e:
        logger.error(f"DWG to PDF conversion error: {e}")
        return False


def convert_dwg_to_dxf(input_path: Path, output_path: Path) -> bool:
    """将 DWG 转换为 DXF"""
    try:
        if shutil.which('ODAFileConverter'):
            cmd = [
                'ODAFileConverter',
                str(input_path.parent),
                str(output_path.parent),
                'ACAD2018',
                'DXF',
                '0',
                '1',
                input_path.name
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                expected = output_path.parent / (input_path.stem + '.dxf')
                if expected.exists():
                    shutil.move(str(expected), str(output_path))
                    return True
        
        if shutil.which('teighafileconverter'):
            cmd = [
                'teighafileconverter',
                str(input_path.parent),
                str(output_path.parent),
                'ACAD2018',
                'DXF',
                '0',
                '1',
                input_path.name
            ]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0:
                expected = output_path.parent / (input_path.stem + '.dxf')
                if expected.exists():
                    shutil.move(str(expected), str(output_path))
                    return True
        
        return False
    except Exception as e:
        logger.error(f"DWG to DXF conversion error: {e}")
        return False


def convert_skp_to_glb(input_path: Path, output_path: Path) -> bool:
    """将 SKP 转换为 GLB"""
    try:
        logger.info(f"Converting SKP to GLB: {input_path} -> {output_path}")
        
        if shutil.which('assimp'):
            cmd = ['assimp', 'export', str(input_path), str(output_path), '-f', 'glb2']
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            if result.returncode == 0 and output_path.exists():
                return True
        
        if shutil.which('blender'):
            script = f"""
import bpy
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
try:
    bpy.ops.import_scene.skp(filepath="{input_path}")
    bpy.ops.export_scene.gltf(filepath="{output_path}", export_format='GLB')
except Exception as e:
    print(f"Blender error: {{e}}")
"""
            script_path = input_path.parent / 'convert.py'
            with open(script_path, 'w') as f:
                f.write(script)
            
            cmd = ['blender', '--background', '--python', str(script_path)]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
            script_path.unlink(missing_ok=True)
            
            if result.returncode == 0 and output_path.exists():
                return True
        
        return False
    except Exception as e:
        logger.error(f"SKP to GLB conversion error: {e}")
        return False


def convert_file(input_path: Path, target_format: str) -> Path:
    """根据输入文件类型和目标格式进行转换"""
    input_ext = input_path.suffix.lower()
    output_path = CONVERTED_FOLDER / f"{input_path.stem}.{target_format}"
    
    logger.info(f"Converting {input_ext} to {target_format}")
    
    if input_ext == '.dwg':
        if target_format == 'pdf':
            if convert_dwg_to_pdf(input_path, output_path):
                return output_path
        elif target_format == 'dxf':
            if convert_dwg_to_dxf(input_path, output_path):
                return output_path
    
    elif input_ext == '.skp':
        if target_format == 'glb':
            if convert_skp_to_glb(input_path, output_path):
                return output_path
    
    return None


# ============ API 路由 ============

@app.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({
        'status': 'ok',
        'service': 'CAD Converter',
        'version': '1.0.0'
    })


@app.route('/api/converters/status', methods=['GET'])
def converter_status():
    """检查转换工具的安装状态"""
    tools = check_conversion_tools()
    has_dwg_converter = tools['ODAFileConverter'] or tools['teigha'] or tools['librecad']
    has_skp_converter = tools['assimp'] or tools['blender']
    
    return jsonify({
        'tools': tools,
        'has_dwg_converter': has_dwg_converter,
        'has_skp_converter': has_skp_converter,
        'message': '转换工具状态检查完成'
    })


@app.route('/api/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({'error': '没有文件'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': '文件名为空'}), 400
    
    if not allowed_file(file.filename):
        return jsonify({
            'error': '不支持的文件格式',
            'supported_formats': list(ALLOWED_EXTENSIONS)
        }), 400
    
    file_id = str(uuid.uuid4())
    filename = secure_filename(file.filename)
    input_path = UPLOAD_FOLDER / f"{file_id}_{filename}"
    
    try:
        file.save(str(input_path))
        logger.info(f"File saved: {input_path}, size: {input_path.stat().st_size} bytes")
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        return jsonify({'error': '文件保存失败'}), 500
    
    category, file_type = get_file_type(filename)
    
    if not category:
        input_path.unlink(missing_ok=True)
        return jsonify({'error': '无法识别文件类型'}), 400
    
    target_format = get_target_format(file_type)
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
        'conversion_error': None
    }
    
    if needs_conversion:
        logger.info(f"Converting {file_type} to {target_format}")
        
        # 检查是否有转换工具
        tools = check_conversion_tools()
        has_converter = False
        if file_type == 'dwg':
            has_converter = tools['ODAFileConverter'] or tools['teigha'] or tools['librecad']
        elif file_type == 'skp':
            has_converter = tools['assimp'] or tools['blender']
        
        if not has_converter:
            result['conversion_error'] = '服务器未安装转换工具，请手动转换后上传'
            result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
            logger.warning(f"No converter available for {file_type}")
        else:
            # 尝试转换
            converted_path = convert_file(input_path, target_format)
            
            if converted_path and converted_path.exists():
                final_output = CONVERTED_FOLDER / f"{file_id}.{target_format}"
                shutil.move(str(converted_path), str(final_output))
                
                result['converted'] = True
                result['converted_type'] = target_format
                result['download_url'] = f'/api/download/{file_id}.{target_format}'
                result['converted_size'] = final_output.stat().st_size
                
                logger.info(f"Conversion successful: {final_output}")
            else:
                result['conversion_error'] = '自动转换失败，请手动转换后上传'
                result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
                logger.warning(f"Conversion failed for {input_path}")
    else:
        result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
    
    return jsonify(result)


@app.route('/api/download/<path:filename>', methods=['GET'])
def download_file(filename):
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
    try:
        import time
        current_time = time.time()
        max_age = 3600
        
        cleaned = 0
        for folder in [UPLOAD_FOLDER, CONVERTED_FOLDER]:
            for file_path in folder.iterdir():
                if file_path.is_file():
                    file_age = current_time - file_path.stat().st_mtime
                    if file_age > max_age:
                        file_path.unlink()
                        cleaned += 1
        
        return jsonify({'message': '清理完成', 'cleaned': cleaned})
    except Exception as e:
        logger.error(f"Cleanup error: {e}")
        return jsonify({'error': str(e)}), 500


# ============ 前端静态文件路由 ============

@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve(path):
    """服务前端静态文件"""
    if path.startswith('api/'):
        return jsonify({'error': 'Not found'}), 404
    
    file_path = DIST_DIR / path
    if file_path.exists() and file_path.is_file():
        return send_from_directory(DIST_DIR, path)
    
    # 返回 index.html 用于前端路由
    return send_from_directory(DIST_DIR, 'index.html')


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': f'文件过大，最大支持 {MAX_FILE_SIZE / 1024 / 1024}MB'}), 413


@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return jsonify({'error': '服务器内部错误'}), 500


if __name__ == '__main__':
    logger.info("=" * 50)
    logger.info("Starting CAD Converter Service")
    logger.info(f"BASE_DIR: {BASE_DIR}")
    logger.info(f"DIST_DIR: {DIST_DIR}")
    logger.info(f"UPLOAD_FOLDER: {UPLOAD_FOLDER}")
    logger.info(f"CONVERTED_FOLDER: {CONVERTED_FOLDER}")
    logger.info(f"Available tools: {check_conversion_tools()}")
    logger.info("=" * 50)
    
    if not DIST_DIR.exists():
        logger.error(f"ERROR: DIST_DIR does not exist: {DIST_DIR}")
    
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False, threaded=True)
