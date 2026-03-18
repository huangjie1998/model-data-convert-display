#include "skp_converter.h"
#include "sketchup.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
#include <string>

// 错误信息缓冲区
static char last_error[1024] = {0};

// 设置错误信息
void set_error(const char* msg) {
    strncpy(last_error, msg, sizeof(last_error) - 1);
    last_error[sizeof(last_error) - 1] = '\0';
}

SKP_API int skp_initialize() {
    SUResult result = SUInitialize();
    if (result != SU_ERROR_NONE) {
        set_error("Failed to initialize SketchUp API");
        return 1;
    }
    return 0;
}

SKP_API void skp_terminate() {
    SUTerminate();
}

// 导出几何体为 GLTF/GLB 格式
// 这里使用简化的 GLB 导出，实际项目中建议使用 tinygltf 库
int export_to_glb(SUModelRef model, const char* output_path) {
    // TODO: 使用 tinygltf 或其他 GLTF 库实现
    // 这里只是示例框架
    
    // 1. 获取模型实体
    SUEntitiesRef entities;
    SUModelGetEntities(model, &entities);
    
    // 2. 遍历所有面
    size_t face_count = 0;
    SUEntitiesGetNumFaces(entities, &face_count);
    
    if (face_count == 0) {
        set_error("No faces found in model");
        return 1;
    }
    
    SUFaceRef* faces = new SUFaceRef[face_count];
    SUEntitiesGetFaces(entities, face_count, faces, &face_count);
    
    // 3. 提取顶点数据
    std::vector<float> vertices;
    std::vector<float> normals;
    std::vector<unsigned int> indices;
    
    for (size_t i = 0; i < face_count; i++) {
        // 获取面的顶点
        size_t vertex_count = 0;
        SUFaceGetNumOuterLoopVertices(faces[i], &vertex_count);
        
        if (vertex_count > 0) {
            SUVertexRef* vertices_ref = new SUVertexRef[vertex_count];
            SUFaceGetOuterLoopVertices(faces[i], vertex_count, vertices_ref, &vertex_count);
            
            for (size_t j = 0; j < vertex_count; j++) {
                SUPoint3D position;
                SUVertexGetPosition(vertices_ref[j], &position);
                
                vertices.push_back((float)position.x);
                vertices.push_back((float)position.y);
                vertices.push_back((float)position.z);
            }
            
            delete[] vertices_ref;
        }
    }
    
    delete[] faces;
    
    // 4. 写入 GLB 文件
    // 这里需要实现 GLB 格式的二进制写入
    // 建议使用 tinygltf 库
    
    // 简化：先输出为 OBJ 格式作为测试
    FILE* fp = fopen(output_path, "w");
    if (!fp) {
        set_error("Failed to create output file");
        return 1;
    }
    
    fprintf(fp, "# Converted from SKP using SketchUp C API\n");
    fprintf(fp, "# %zu vertices\n", vertices.size() / 3);
    
    for (size_t i = 0; i < vertices.size(); i += 3) {
        fprintf(fp, "v %f %f %f\n", vertices[i], vertices[i+1], vertices[i+2]);
    }
    
    fclose(fp);
    
    return 0;
}

SKP_API int skp_to_glb(const char* input_path, const char* output_path) {
    if (!input_path || !output_path) {
        set_error("Invalid arguments");
        return 1;
    }
    
    // 打开模型
    SUModelRef model = SU_INVALID;
    SUResult result = SUModelCreateFromFile(&model, input_path);
    
    if (result != SU_ERROR_NONE) {
        set_error("Failed to open SKP file");
        return 1;
    }
    
    // 转换为 GLB
    int ret = export_to_glb(model, output_path);
    
    // 释放模型
    SUModelRelease(&model);
    
    return ret;
}

SKP_API const char* skp_get_last_error() {
    return last_error;
}

SKP_API char* skp_get_model_info(const char* input_path) {
    if (!input_path) {
        return NULL;
    }
    
    SUModelRef model = SU_INVALID;
    SUResult result = SUModelCreateFromFile(&model, input_path);
    
    if (result != SU_ERROR_NONE) {
        return NULL;
    }
    
    // 获取模型名称
    SUStringRef name;
    SUStringCreate(&name);
    SUModelGetName(model, &name);
    
    size_t name_length;
    SUStringGetUTF8Length(name, &name_length);
    char* name_utf8 = new char[name_length + 1];
    SUStringGetUTF8(name, name_length + 1, name_utf8, &name_length);
    
    // 获取实体数量
    SUEntitiesRef entities;
    SUModelGetEntities(model, &entities);
    
    size_t face_count = 0;
    SUEntitiesGetNumFaces(entities, &face_count);
    
    // 构建 JSON 字符串
    std::string json = "{";
    json += "\"name\":\"" + std::string(name_utf8) + "\",";
    json += "\"faces\":" + std::to_string(face_count);
    json += "}";
    
    char* result_str = new char[json.length() + 1];
    strcpy(result_str, json.c_str());
    
    // 清理
    delete[] name_utf8;
    SUStringRelease(&name);
    SUModelRelease(&model);
    
    return result_str;
}

SKP_API void skp_free_string(char* str) {
    if (str) {
        delete[] str;
    }
}
