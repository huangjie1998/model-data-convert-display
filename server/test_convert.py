from pathlib import Path
import os
import ctypes

dll_dir = Path('C:/development/模型数据转换显示/skp_converter_deploy')
os.environ['PATH'] = str(dll_dir) + os.pathsep + os.environ['PATH']

print('Loading DLL...')
dll = ctypes.CDLL(str(dll_dir / 'skp_converter.dll'))

print('Initializing...')
dll.skp_converter_init.argtypes = []
dll.skp_converter_init.restype = ctypes.c_int
dll.skp_converter_init()

input_file = Path('uploads/3e1537d7-bd13-4c6a-91fb-5bb6f0af452f_06-20100130-1M.skp').resolve()
output_file = Path('converted/test_output.glb').resolve()

print(f'Input: {input_file}')
print(f'Input exists: {input_file.exists()}')
print(f'Output: {output_file}')
print(f'Output dir exists: {output_file.parent.exists()}')

print('Testing conversion...')
dll.skp_to_glb.argtypes = [ctypes.c_char_p, ctypes.c_char_p]
dll.skp_to_glb.restype = ctypes.c_int

result = dll.skp_to_glb(str(input_file).encode('utf-8'), str(output_file).encode('utf-8'))
print(f'Result: {result}')

if result != 0:
    dll.skp_get_error.argtypes = []
    dll.skp_get_error.restype = ctypes.c_char_p
    error = dll.skp_get_error()
    if error:
        error_str = ctypes.cast(error, ctypes.c_char_p).value.decode('utf-8')
        print(f'Error: {error_str}')
else:
    print('SUCCESS!')
    if output_file.exists():
        print(f'File size: {output_file.stat().st_size} bytes')

print('Cleanup...')
dll.skp_converter_cleanup.argtypes = []
dll.skp_converter_cleanup.restype = None
dll.skp_converter_cleanup()
