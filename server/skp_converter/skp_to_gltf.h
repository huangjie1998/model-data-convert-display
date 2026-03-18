// SKP to GLB Converter DLL Interface
// Uses SketchUp C API to read SKP files and export to GLB format

#ifndef SKP_TO_GLTF_H
#define SKP_TO_GLTF_H

#ifdef _WIN32
    #ifdef SKP_TO_GLTF_EXPORTS
        #define SKP_API __declspec(dllexport)
    #else
        #define SKP_API __declspec(dllimport)
    #endif
#else
    #define SKP_API __attribute__((visibility("default")))
#endif

#ifdef __cplusplus
extern "C" {
#endif

// Initialize the converter
SKP_API int skp_converter_init();

// Release resources
SKP_API void skp_converter_cleanup();

// Convert SKP to GLB
// input_path: Path to input .skp file
// output_path: Path to output .glb file
// Returns: 0 on success, non-zero on error
SKP_API int skp_to_glb(const char* input_path, const char* output_path);

// Get error message from last operation
SKP_API const char* skp_get_error();

// Get model statistics
// Returns JSON string with: vertex_count, face_count, material_count
// Caller must free the returned string with skp_free_string
SKP_API char* skp_get_stats(const char* input_path);

// Free a string returned by the API
SKP_API void skp_free_string(char* str);

#ifdef __cplusplus
}
#endif

#endif // SKP_TO_GLTF_H
