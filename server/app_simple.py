#!/usr/bin/env python3
"""
建筑图纸浏览器 - 简化版后端服务
仅提供基础文件上传和下载功能，无需 Pillow 等复杂依赖
"""

import os
import uuid
import shutil
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

app = Flask(__name__)
CORS(app, resources={
    r"/api/*": {
        "origins": "*",
        "methods": ["GET", "POST", "OPTIONS"],
        "allow_headers": ["Content-Type"]
    }
})

# 配置
BASE_DIR = Path(__file__).parent
UPLOAD_FOLDER = BASE_DIR / 'uploads'
CONVERTED_FOLDER = BASE_DIR / 'converted'
MAX_FILE_SIZE = 100 * 1024 * 1024  # 100MB

# 创建目录
UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
CONVERTED_FOLDER.mkdir(parents=True, exist_ok=True)

# 允许的文件扩展名
ALLOWED_EXTENSIONS = {'skp', 'dwg', 'dxf', 'pdf', 'png', 'jpg', 'jpeg', 
                      'gltf', 'glb', 'obj', 'fbx'}


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


@app.route('/api/health', methods=['GET'])
def health_check():
    """健康检查接口"""
    return jsonify({
        'status': 'ok',
        'service': 'CAD Converter (Simple)',
        'version': '1.0.0',
        'note': 'This is a simplified version without conversion capabilities'
    })


@app.route('/api/converters/status', methods=['GET'])
def converter_status():
    """检查转换工具状态 - 简化版返回空"""
    return jsonify({
        'tools': {},
        'message': '简化版后端 - 不支持自动转换。请手动转换 SKP/DWG 文件。',
        'manual_conversion': True
    })


@app.route('/api/upload', methods=['POST'])
def upload_file():
    """上传文件（简化版，不进行转换）"""
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
    
    # 检查是否需要转换
    needs_conversion = file_type in {'skp', 'dwg'}
    
    result = {
        'file_id': file_id,
        'original_name': filename,
        'category': category,
        'original_type': file_type,
        'needs_conversion': needs_conversion,
        'converted': False,
        'converted_type': None,
        'download_url': f'/api/download/original/{file_id}.{file_type}',
        'conversion_error': None
    }
    
    if needs_conversion:
        result['conversion_error'] = '简化版后端不支持自动转换，请手动转换后上传'
        result['manual_conversion_guide'] = {
            'skp': '请使用 SketchUp 导出为 GLB 格式',
            'dwg': '请使用 AutoCAD 导出为 DXF 或 PDF 格式'
        }
    
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


if __name__ == '__main__':
    logger.info("Starting CAD Converter Service (Simple)")
    logger.info(f"Upload folder: {UPLOAD_FOLDER}")
    logger.info(f"Max file size: {MAX_FILE_SIZE / 1024 / 1024}MB")
    
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
