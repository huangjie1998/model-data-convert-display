#!/usr/bin/env python3
"""
CAD 文件转换器
支持 DWG 和 SKP 文件的转换
"""

import os
import subprocess
import tempfile
import shutil
from pathlib import Path
from typing import Optional, Tuple
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class CADConverter:
    """CAD 文件转换器"""
    
    def __init__(self):
        self.temp_dir = Path(tempfile.gettempdir()) / 'cad_converter'
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        
        # 检查可用的转换工具
        self.tools = self._check_tools()
    
    def _check_tools(self) -> dict:
        """检查可用的转换工具"""
        tools = {
            'librecad': shutil.which('librecad') is not None,
            'librecad_cli': shutil.which('librecad2pdf') is not None,
            'oda_converter': shutil.which('ODAFileConverter') is not None,
            'assimp': shutil.which('assimp') is not None,
            'blender': shutil.which('blender') is not None,
            'inkscape': shutil.which('inkscape') is not None,
            'convert': shutil.which('convert') is not None,  # ImageMagick
        }
        
        logger.info(f"Available tools: {tools}")
        return tools
    
    def convert_dwg_to_pdf(self, input_path: Path, output_path: Path) -> bool:
        """
        将 DWG 转换为 PDF
        
        尝试多种方法：
        1. ODA File Converter (最可靠)
        2. LibreCAD
        3. 其他工具
        """
        input_path = Path(input_path)
        output_path = Path(output_path)
        
        logger.info(f"Converting DWG to PDF: {input_path} -> {output_path}")
        
        # 方法1: 使用 ODA File Converter
        if self.tools['oda_converter']:
            try:
                cmd = [
                    'ODAFileConverter',
                    str(input_path.parent),
                    str(output_path.parent),
                    'ACAD2018',
                    'PDF',
                    '1',  # 递归
                    '1',  # 覆盖
                    input_path.name
                ]
                
                result = subprocess.run(
                    cmd, 
                    capture_output=True, 
                    text=True, 
                    timeout=120
                )
                
                if result.returncode == 0:
                    # ODA 会生成同名但扩展名为 .pdf 的文件
                    expected_output = output_path.parent / (input_path.stem + '.pdf')
                    if expected_output.exists():
                        shutil.move(str(expected_output), str(output_path))
                        logger.info("Conversion successful using ODA File Converter")
                        return True
                else:
                    logger.warning(f"ODA conversion failed: {result.stderr}")
                    
            except Exception as e:
                logger.warning(f"ODA conversion error: {e}")
        
        # 方法2: 使用 LibreCAD
        if self.tools['librecad'] or self.tools['librecad_cli']:
            try:
                # LibreCAD 的命令行支持有限，可能需要图形界面
                # 这里尝试使用 librecad2pdf (如果存在)
                if self.tools['librecad_cli']:
                    cmd = [
                        'librecad2pdf',
                        str(input_path),
                        str(output_path)
                    ]
                    
                    result = subprocess.run(
                        cmd,
                        capture_output=True,
                        text=True,
                        timeout=120
                    )
                    
                    if result.returncode == 0 and output_path.exists():
                        logger.info("Conversion successful using LibreCAD")
                        return True
                        
            except Exception as e:
                logger.warning(f"LibreCAD conversion error: {e}")
        
        # 方法3: 使用 DWG 到 DXF 再到 PDF 的间接转换
        try:
            # 先转换为 DXF
            dxf_path = self.temp_dir / f"{input_path.stem}.dxf"
            if self.convert_dwg_to_dxf(input_path, dxf_path):
                # 然后使用其他工具将 DXF 转换为 PDF
                if self._convert_dxf_to_pdf_alternative(dxf_path, output_path):
                    logger.info("Conversion successful using DWG->DXF->PDF pipeline")
                    return True
                    
        except Exception as e:
            logger.warning(f"Indirect conversion error: {e}")
        
        logger.error("All DWG to PDF conversion methods failed")
        return False
    
    def convert_dwg_to_dxf(self, input_path: Path, output_path: Path) -> bool:
        """
        将 DWG 转换为 DXF
        """
        input_path = Path(input_path)
        output_path = Path(output_path)
        
        logger.info(f"Converting DWG to DXF: {input_path} -> {output_path}")
        
        # 方法1: 使用 ODA File Converter
        if self.tools['oda_converter']:
            try:
                cmd = [
                    'ODAFileConverter',
                    str(input_path.parent),
                    str(output_path.parent),
                    'ACAD2018',
                    'DXF',
                    '0',  # 不递归
                    '1',  # 覆盖
                    input_path.name
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode == 0:
                    expected_output = output_path.parent / (input_path.stem + '.dxf')
                    if expected_output.exists():
                        shutil.move(str(expected_output), str(output_path))
                        logger.info("Conversion successful using ODA File Converter")
                        return True
                        
            except Exception as e:
                logger.warning(f"ODA DXF conversion error: {e}")
        
        logger.error("DWG to DXF conversion failed")
        return False
    
    def _convert_dxf_to_pdf_alternative(self, input_path: Path, output_path: Path) -> bool:
        """
        使用替代方法将 DXF 转换为 PDF
        """
        try:
            # 尝试使用 Inkscape
            if self.tools['inkscape']:
                cmd = [
                    'inkscape',
                    str(input_path),
                    '--export-filename', str(output_path),
                    '--export-type=pdf'
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )
                
                if result.returncode == 0 and output_path.exists():
                    return True
                    
        except Exception as e:
            logger.warning(f"Inkscape conversion error: {e}")
        
        return False
    
    def convert_skp_to_glb(self, input_path: Path, output_path: Path) -> bool:
        """
        将 SKP (SketchUp) 转换为 GLB
        
        注意: SKP 是专有格式，转换比较困难
        尝试多种方法：
        1. Blender + SketchUp Importer
        2. Assimp (如果支持)
        3. 其他第三方工具
        """
        input_path = Path(input_path)
        output_path = Path(output_path)
        
        logger.info(f"Converting SKP to GLB: {input_path} -> {output_path}")
        
        # 方法1: 使用 Blender
        if self.tools['blender']:
            try:
                # 创建 Blender Python 脚本
                blender_script = f"""
import bpy
import sys

# 清除场景
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)

# 尝试导入 SKP
# 注意: 需要安装 SketchUp importer 插件
try:
    bpy.ops.import_scene.skp(filepath="{input_path}")
except AttributeError:
    # 如果没有 skp 导入器，尝试其他方法
    print("SKP importer not available")
    sys.exit(1)

# 导出 GLB
bpy.ops.export_scene.gltf(
    filepath="{output_path}",
    export_format='GLB',
    export_materials='EXPORT',
    export_textures=True
)
"""
                
                script_path = self.temp_dir / f"convert_{input_path.stem}.py"
                with open(script_path, 'w') as f:
                    f.write(blender_script)
                
                cmd = [
                    'blender',
                    '--background',
                    '--python', str(script_path)
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=300
                )
                
                # 清理脚本
                script_path.unlink(missing_ok=True)
                
                if result.returncode == 0 and output_path.exists():
                    logger.info("Conversion successful using Blender")
                    return True
                else:
                    logger.warning(f"Blender conversion failed: {result.stderr}")
                    
            except Exception as e:
                logger.warning(f"Blender conversion error: {e}")
        
        # 方法2: 使用 Assimp (如果支持 SKP)
        if self.tools['assimp']:
            try:
                cmd = [
                    'assimp',
                    'export',
                    str(input_path),
                    str(output_path),
                    '-f', 'glb2'
                ]
                
                result = subprocess.run(
                    cmd,
                    capture_output=True,
                    text=True,
                    timeout=120
                )
                
                if result.returncode == 0 and output_path.exists():
                    logger.info("Conversion successful using Assimp")
                    return True
                    
            except Exception as e:
                logger.warning(f"Assimp conversion error: {e}")
        
        logger.error("All SKP to GLB conversion methods failed")
        return False
    
    def convert_file(self, input_path: Path, target_format: str) -> Optional[Path]:
        """
        根据输入文件类型和目标格式进行转换
        
        Args:
            input_path: 输入文件路径
            target_format: 目标格式 (pdf, dxf, glb, etc.)
        
        Returns:
            转换后的文件路径，如果失败则返回 None
        """
        input_path = Path(input_path)
        target_format = target_format.lower()
        input_ext = input_path.suffix.lower()
        
        output_path = self.temp_dir / f"{input_path.stem}.{target_format}"
        
        logger.info(f"Converting {input_ext} to {target_format}")
        
        # DWG 转换
        if input_ext == '.dwg':
            if target_format == 'pdf':
                if self.convert_dwg_to_pdf(input_path, output_path):
                    return output_path
            elif target_format == 'dxf':
                if self.convert_dwg_to_dxf(input_path, output_path):
                    return output_path
        
        # SKP 转换
        elif input_ext == '.skp':
            if target_format == 'glb':
                if self.convert_skp_to_glb(input_path, output_path):
                    return output_path
        
        logger.error(f"Conversion not supported: {input_ext} -> {target_format}")
        return None
    
    def cleanup(self, max_age_hours: int = 24):
        """
        清理临时文件
        
        Args:
            max_age_hours: 文件最大保留时间（小时）
        """
        import time
        
        current_time = time.time()
        max_age = max_age_hours * 3600
        
        cleaned = 0
        for file_path in self.temp_dir.iterdir():
            if file_path.is_file():
                file_age = current_time - file_path.stat().st_mtime
                if file_age > max_age:
                    file_path.unlink()
                    cleaned += 1
        
        logger.info(f"Cleaned up {cleaned} old files")
        return cleaned


# 全局转换器实例
converter = CADConverter()


if __name__ == '__main__':
    # 测试转换器
    print("CAD Converter Test")
    print(f"Available tools: {converter.tools}")
