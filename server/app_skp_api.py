#!/usr/bin/env python3
"""
建筑图纸浏览器 - 后端服务（含 SketchUp C API 支持）
"""

import os
import sys
import uuid
import shutil
import subprocess
from pathlib import Path
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
from werkzeug.utils import secure_filename
import logging

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ============================================================================
# SketchUp C API 模块加载
# ============================================================================

# 查找DLL路径
BASE_DIR = Path(__file__).parent
DLL_PATHS = [
    BASE_DIR / 'skp_converter' / 'skp_converter.dll',  # 开发路径
    BASE_DIR / '..' / 'skp_converter_deploy' / 'skp_converter.dll',  # 部署路径
    Path('C:/development/模型数据转换显示/skp_converter_deploy/skp_converter.dll'),  # 绝对路径
]

SKP_DLL_PATH = None
for path in DLL_PATHS:
    if path.exists():
        SKP_DLL_PATH = str(path.resolve())
        logger.info(f"Found SKP converter DLL: {SKP_DLL_PATH}")
        break

# 尝试导入 SketchUp C API 模块
try:
    if SKP_DLL_PATH:
        # 临时添加DLL目录到PATH（Windows需要）
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
# Flask 应用配置
# ============================================================================

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# 文件配置
UPLOAD_FOLDER = BASE_DIR / 'uploads'
CONVERTED_FOLDER = BASE_DIR / 'converted'
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# 创建目录
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
CONVERTED_FOLDER.mkdir(parents=True, exist_ok=True)

# 允许的文件扩展名
ALLOWED_3D_EXTENSIONS = {'skp', 'gltf', 'glb', 'obj', 'fbx'}
ALLOWED_2D_EXTENSIONS = {'dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg'}
ALLOWED_EXTENSIONS = ALLOWED_3D_EXTENSIONS | ALLOWED_2D_EXTENSIONS

# ============================================================================
# 工具函数
# ============================================================================

def allowed_file(filename):
    """检查文件扩展名是否允许"""
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


def get_file_type(filename):
    """获取文件类型和分类"""
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
    """检查可用的转换工具"""
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
# SKP 转换函数
# ============================================================================

def convert_skp_using_api(input_path: Path, output_path: Path) -> bool:
    """使用 SketchUp C API 转换 SKP"""
    if not SKP_API_AVAILABLE or not SKP_DLL_PATH:
        logger.error("SKP C API not available")
        return False
    
    import tempfile
    
    try:
        logger.info(f"Converting SKP using C API: {input_path} -> {output_path}")
        
        # 使用临时目录避免中文路径问题
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_input = Path(temp_dir) / input_path.name
            temp_output = Path(temp_dir) / 'output.glb'
            
            # 复制输入文件到临时目录
            shutil.copy2(str(input_path), str(temp_input))
            logger.info(f"Copied input to temp: {temp_input}")
            
            with SKPConverter(SKP_DLL_PATH) as converter:
                result = converter.convert_to_glb(str(temp_input), str(temp_output))
                if result:
                    # 复制输出文件到目标位置
                    shutil.copy2(str(temp_output), str(output_path))
                    logger.info("SKP C API conversion successful")
                    return True
                else:
                    logger.error(f"SKP C API conversion failed: {converter.get_last_error()}")
                    return False
            
    except Exception as e:
        logger.error(f"SKP C API conversion error: {e}")
        import traceback
        traceback.print_exc()
        return False


def convert_skp_using_blender(input_path: Path, output_path: Path) -> bool:
    """使用 Blender 转换 SKP（备选方案）"""
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
    """
    转换 SKP 到 GLB
    
    Returns:
        (success: bool, method: str) - 成功状态和使用的转换方法
    """
    # 优先使用 SketchUp C API
    if SKP_API_AVAILABLE:
        if convert_skp_using_api(input_path, output_path):
            return True, 'sketchup_c_api'
        logger.warning("C API conversion failed, trying Blender...")
    
    # 备选：使用 Blender
    if convert_skp_using_blender(input_path, output_path):
        return True, 'blender'
    
    return False, ''


# ============================================================================
# DWG 转换函数
# ============================================================================

def convert_dwg_to_pdf(input_path: Path, output_path: Path) -> bool:
    """将 DWG 转换为 PDF"""
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
    根据输入文件类型和目标格式进行转换
    
    Returns:
        (output_path: Path or None, method: str)
    """
    input_ext = input_path.suffix.lower()
    output_path = CONVERTED_FOLDER / f"{input_path.stem}.{target_format}"
    
    logger.info(f"Converting {input_ext} to {target_format}")
    
    if input_ext == '.dwg':
        if target_format == 'pdf':
            if convert_dwg_to_pdf(input_path, output_path):
                return output_path, 'oda_converter'
    
    elif input_ext == '.skp':
        if target_format == 'glb':
            success, method = convert_skp_to_glb(input_path, output_path)
            if success:
                return output_path, method
    
    return None, ''


# ============================================================================
# API 路由
# ============================================================================

@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'service': 'CAD Converter (with SKP API)',
        'version': '1.1.0',
        'skp_api_available': SKP_API_AVAILABLE,
        'skp_dll_path': SKP_DLL_PATH
    })


@app.route('/api/converters/status', methods=['GET'])
def converter_status():
    """检查转换工具的安装状态"""
    return jsonify({
        'tools': check_conversion_tools(),
        'message': '转换工具状态检查完成',
        'skp_api': {
            'available': SKP_API_AVAILABLE,
            'dll_path': SKP_DLL_PATH,
            'description': 'SketchUp C API for direct SKP conversion'
        }
    })


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传文件并自动转换"""
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
        logger.info(f"File saved: {input_path}")
    except Exception as e:
        logger.error(f"Failed to save file: {e}")
        return jsonify({'error': '文件保存失败'}), 500
    
    category, file_type = get_file_type(filename)
    
    if not category:
        input_path.unlink(missing_ok=True)
        return jsonify({'error': '无法识别文件类型'}), 400
    
    # 确定目标格式
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
        'conversion_method': None
    }
    
    if needs_conversion:
        logger.info(f"Converting {file_type} to {target_format}")
        
        converted_path, method = convert_file(input_path, target_format)
        
        if converted_path and converted_path.exists():
            final_output = CONVERTED_FOLDER / f"{file_id}.{target_format}"
            shutil.move(str(converted_path), str(final_output))
            
            result['converted'] = True
            result['converted_type'] = target_format
            result['download_url'] = f'/api/download/{file_id}.{target_format}'
            result['converted_size'] = final_output.stat().st_size
            result['conversion_method'] = method
            
            logger.info(f"Conversion successful: {final_output} (method: {method})")
        else:
            result['conversion_error'] = '自动转换失败，请手动转换后上传'
            result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
            result['manual_conversion_guide'] = {
                'skp': '请使用 SketchUp 导出为 GLB 格式，或确保 DLL 已正确配置',
                'dwg': '请使用 AutoCAD 导出为 DXF 或 PDF 格式'
            }
            logger.warning(f"Conversion failed for {input_path}")
    else:
        result['download_url'] = f'/api/download/original/{file_id}.{file_type}'
    
    return jsonify(result)


@app.route('/api/download/<path:filename>', methods=['GET'])
def download_file(filename):
    """下载文件"""
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
    """清理临时文件"""
    try:
        import time
        current_time = time.time()
        max_age = 3600  # 1小时
        
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


@app.errorhandler(413)
def too_large(e):
    return jsonify({'error': f'文件过大，最大支持 {MAX_FILE_SIZE / 1024 / 1024}MB'}), 413


@app.errorhandler(500)
def server_error(e):
    logger.error(f"Server error: {e}")
    return jsonify({'error': '服务器内部错误'}), 500


# ============================================================================
# 主程序入口
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
