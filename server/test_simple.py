print('Starting test...')
from pathlib import Path
import os
import ctypes

dll_dir = Path('C:/development/模型数据转换显示/skp_converter_deploy')
print(f'DLL dir: {dll_dir}')
print(f'DLL exists: {(dll_dir / "skp_converter.dll").exists()}')

os.environ['PATH'] = str(dll_dir) + os.pathsep + os.environ['PATH']
print('Loading DLL...')
dll = ctypes.CDLL(str(dll_dir / 'skp_converter.dll'))
print('DLL loaded!')

print('Testing init...')
dll.skp_converter_init.argtypes = []
dll.skp_converter_init.restype = ctypes.c_int
result = dll.skp_converter_init()
print(f'Init result: {result}')
