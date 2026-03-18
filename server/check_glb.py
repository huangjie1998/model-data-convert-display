import json
import struct
import sys

# 读取GLB文件
with open('converted/test_merged.glb', 'rb') as f:
    data = f.read()

# 解析GLB header
magic = data[0:4].decode('ascii')
version = struct.unpack('<I', data[4:8])[0]
length = struct.unpack('<I', data[8:12])[0]
print(f'GLB: magic={magic}, version={version}, length={length}')

# 解析chunks
offset = 12
json_chunk = None
while offset < length:
    chunk_length = struct.unpack('<I', data[offset:offset+4])[0]
    chunk_type = struct.unpack('<I', data[offset+4:offset+8])[0]
    chunk_data = data[offset+8:offset+8+chunk_length]
    
    if chunk_type == 0x4E4F534A:  # JSON
        json_chunk = json.loads(chunk_data.decode('utf-8'))
        break
    offset += 8 + chunk_length

if json_chunk:
    # 输出材质信息
    if 'materials' in json_chunk:
        print(f'\nFound {len(json_chunk["materials"])} materials:')
        for i, mat in enumerate(json_chunk['materials']):
            name = mat.get('name', f'Material_{i}')
            pbr = mat.get('pbrMetallicRoughness', {})
            color = pbr.get('baseColorFactor', [1,1,1,1])
            print(f'  {i}: {name} - color: {[round(c,3) for c in color]}')
    else:
        print('\nNo materials found in GLB')
        
    # 检查meshes使用的material索引
    if 'meshes' in json_chunk:
        print(f'\nFound {len(json_chunk["meshes"])} meshes')
        for mesh in json_chunk['meshes']:
            for prim in mesh.get('primitives', []):
                mat_idx = prim.get('material', 'none')
                print(f'  Primitive uses material index: {mat_idx}')
    
    # 保存JSON部分用于检查
    with open('converted/test_merged_gltf.json', 'w') as f:
        json.dump(json_chunk, f, indent=2)
    print('\nSaved JSON to test_merged_gltf.json')
else:
    print('No JSON chunk found')
