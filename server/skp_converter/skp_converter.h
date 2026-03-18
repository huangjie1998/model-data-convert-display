#ifndef SKP_CONVERTER_H
#define SKP_CONVERTER_H

#ifdef _WIN32
    #define SKP_API __declspec(dllexport)
#else
    #define SKP_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

// 初始化 SketchUp API
SKP_API int skp_initialize();

// 释放 SketchUp API
SKP_API void skp_terminate();

// 转换 SKP 到 GLB
// input_path: 输入 SKP 文件路径
// output_path: 输出 GLB 文件路径
// return: 0 成功，非0 失败
SKP_API int skp_to_glb(const char* input_path, const char* output_path);

// 获取错误信息
SKP_API const char* skp_get_last_error();

// 获取模型信息
// 返回 JSON 字符串，包含：name, entities, materials 等
SKP_API char* skp_get_model_info(const char* input_path);

// 释放字符串内存（由调用者调用）
SKP_API void skp_free_string(char* str);

#ifdef __cplusplus
}
#endif

#endif // SKP_CONVERTER_H
