from pathlib import Path
import os
import ctypes
import sys

# 添加 DLL 目录到 PATH
dll_dir = Path('C:/development/模型数据转换显示/skp_converter_deploy')
os.environ['PATH'] = str(dll_dir) + os.pathsep + os.environ['PATH']

# 直接加载 DLL 并测试
print(f"Loading DLL from: {dll_dir / 'skp_converter.dll'}")
dll = ctypes.CDLL(str(dll_dir / 'skp_converter.dll'))
print("DLL loaded successfully")

# 测试 skp_converter_init
dll.skp_converter_init.argtypes = []
dll.skp_converter_init.restype = ctypes.c_int
result = dll.skp_converter_init()
print(f'skp_converter_init result: {result}')

# 测试 skp_get_stats (不依赖文件写入)
dll.skp_get_stats.argtypes = [ctypes.c_char_p]
dll.skp_get_stats.restype = ctypes.c_char_p

input_file = Path('uploads/3e1537d7-bd13-4c6a-91fb-5bb6f0af452f_06-20100130-1M.skp').resolve()
print(f'Testing skp_get_stats with: {input_file}')
stats = dll.skp_get_stats(str(input_file).encode('utf-8'))
if stats:
    stats_str = ctypes.cast(stats, ctypes.c_char_p).value.decode('utf-8')
    print(f'Stats: {stats_str}')
    dll.skp_free_string(stats)
else:
    print('Failed to get stats')

# 测试转换
test_output = 'converted/test_dll_output.glb'
print(f'Testing conversion to: {test_output}')

dll.skp_to_glb.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
dll.skp_to_glb.restype = ctypes.c_int

result = dll.skp_to_glb(str(input_file).encode('utf-8'), test_output.encode('utf-8'))
print(f'skp_to_glb result: {result}')

if result != 0:
    dll.skp_get_error.argtypes = []
    dll.skp_get_error.restype = ctypes.c_char_p
    error = dll.skp_get_error()
    if error:
        error_str = ctypes.cast(error, ctypes.c_char_p).value.decode('utf-8')
        print(f'Error: {error_str}')
else:
    print("SUCCESS!")
    if os.path.exists(test_output):
        print(f"Output file size: {os.path.getsize(test_output)} bytes")
