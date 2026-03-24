"""
SketchUp C API DLL 调用模块

使用方法：
1. 编译 skp_converter.dll
2. 将 slapi.dll 和 skp_converter.dll 放在同一目录或系统 PATH
3. 在 backend 中调用
"""

import ctypes
import os
import json
from pathlib import Path

class SKPConverter:
    """SketchUp C API 转换器封装"""
    
    def __init__(self, dll_path=None):
        """
        初始化转换器
        
        Args:
            dll_path: DLL 文件路径，默认在当前目录查找
        """
        self.dll = None
        self.initialized = False
        
        if dll_path is None:
            # 默认在当前目录查找
            base_dir = Path(__file__).parent
            dll_path = base_dir / "skp_converter" / "skp_converter.dll"
        
        if not os.path.exists(dll_path):
            raise FileNotFoundError(f"DLL not found: {dll_path}")
        
        # 加载 DLL
        try:
            # 先预加载 SketchUpAPI.dll（依赖项），否则 Windows 可能找不到
            su_api_dll = Path(dll_path).parent / "SketchUpAPI.dll"
            if su_api_dll.exists():
                ctypes.CDLL(str(su_api_dll))
            self.dll = ctypes.CDLL(str(dll_path))
            self._setup_functions()
        except Exception as e:
            raise RuntimeError(f"Failed to load DLL: {e}")
    
    def _setup_functions(self):
        """设置函数签名"""
        # skp_converter_init
        self.dll.skp_converter_init.argtypes = []
        self.dll.skp_converter_init.restype = ctypes.c_int
        
        # skp_converter_cleanup
        self.dll.skp_converter_cleanup.argtypes = []
        self.dll.skp_converter_cleanup.restype = None
        
        # skp_to_glb
        self.dll.skp_to_glb.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
        self.dll.skp_to_glb.restype = ctypes.c_int
        
        # skp_get_error
        self.dll.skp_get_error.argtypes = []
        self.dll.skp_get_error.restype = ctypes.c_char_p
        
        # skp_get_stats
        self.dll.skp_get_stats.argtypes = [ctypes.c_char_p]
        self.dll.skp_get_stats.restype = ctypes.c_void_p
        
        # skp_free_string
        self.dll.skp_free_string.argtypes = [ctypes.c_void_p]
        self.dll.skp_free_string.restype = None
    
    def initialize(self) -> bool:
        """初始化 SketchUp API"""
        result = self.dll.skp_converter_init()
        if result == 0:
            self.initialized = True
            return True
        return False
    
    def terminate(self):
        """释放 SketchUp API"""
        if self.initialized:
            self.dll.skp_converter_cleanup()
            self.initialized = False
    
    def convert_to_glb(self, input_path: str, output_path: str) -> bool:
        """
        转换 SKP 到 GLB
        
        Args:
            input_path: 输入 SKP 文件路径
            output_path: 输出 GLB 文件路径
            
        Returns:
            True 成功，False 失败
        """
        if not self.initialized:
            raise RuntimeError("Converter not initialized. Call initialize() first.")
        
        input_bytes = input_path.encode('utf-8')
        output_bytes = output_path.encode('utf-8')
        
        result = self.dll.skp_to_glb(input_bytes, output_bytes)
        return result == 0
    
    def get_last_error(self) -> str:
        """获取最后一次错误信息"""
        error_ptr = self.dll.skp_get_error()
        if error_ptr:
            return error_ptr.decode('utf-8')
        return "Unknown error"
    
    def get_model_info(self, input_path: str) -> dict:
        """
        获取模型信息
        
        Args:
            input_path: SKP 文件路径
            
        Returns:
            模型信息的字典
        """
        input_bytes = input_path.encode('utf-8')
        info_ptr = self.dll.skp_get_stats(input_bytes)
        
        if info_ptr:
            info_json = ctypes.string_at(info_ptr).decode('utf-8')
            self.dll.skp_free_string(info_ptr)
            return json.loads(info_json)
        
        return {}
    
    def __enter__(self):
        """上下文管理器入口"""
        self.initialize()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """上下文管理器出口"""
        self.terminate()


# 便捷函数
def convert_skp_to_glb(input_path: str, output_path: str, dll_path: str = None) -> bool:
    """
    一键转换 SKP 到 GLB
    
    Args:
        input_path: 输入 SKP 文件路径
        output_path: 输出 GLB 文件路径
        dll_path: DLL 文件路径（可选）
        
    Returns:
        True 成功，False 失败
    """
    try:
        with SKPConverter(dll_path) as converter:
            return converter.convert_to_glb(input_path, output_path)
    except Exception as e:
        print(f"Conversion failed: {e}")
        return False


# 测试代码
if __name__ == "__main__":
    # 测试 DLL 加载
    try:
        converter = SKPConverter()
        print("DLL loaded successfully")
        
        # 测试初始化
        if converter.initialize():
            print("SketchUp API initialized")
            
            # 这里可以添加测试转换代码
            # converter.convert_to_glb("test.skp", "test.glb")
            
            converter.terminate()
            print("SketchUp API terminated")
        else:
            print(f"Failed to initialize: {converter.get_last_error()}")
            
    except Exception as e:
        print(f"Error: {e}")
