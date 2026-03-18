// Simple C++ test for the SKP Converter DLL
#include <iostream>
#include <cstdio>
#include "skp_to_gltf.h"

int main(int argc, char* argv[]) {
    std::cout << "SKP Converter Test" << std::endl;
    std::cout << "==================" << std::endl;
    
    // Initialize
    std::cout << "Initializing... ";
    if (skp_converter_init() != 0) {
        std::cerr << "Failed!" << std::endl;
        std::cerr << "Error: " << skp_get_error() << std::endl;
        return 1;
    }
    std::cout << "OK" << std::endl;
    
    // Check arguments
    if (argc < 2) {
        std::cout << "Usage: " << argv[0] << " <input.skp> [output.glb]" << std::endl;
        skp_converter_cleanup();
        return 0;
    }
    
    const char* input_path = argv[1];
    const char* output_path = (argc > 2) ? argv[2] : "output.glb";
    
    // Get stats
    std::cout << "Getting model stats... ";
    char* stats = skp_get_stats(input_path);
    if (stats) {
        std::cout << "OK" << std::endl;
        std::cout << "Stats: " << stats << std::endl;
        skp_free_string(stats);
    } else {
        std::cout << "Failed!" << std::endl;
        std::cerr << "Error: " << skp_get_error() << std::endl;
    }
    
    // Convert
    std::cout << "Converting " << input_path << " to " << output_path << "... ";
    if (skp_to_glb(input_path, output_path) == 0) {
        std::cout << "OK" << std::endl;
        std::cout << "Conversion successful!" << std::endl;
    } else {
        std::cout << "Failed!" << std::endl;
        std::cerr << "Error: " << skp_get_error() << std::endl;
    }
    
    // Cleanup
    skp_converter_cleanup();
    
    return 0;
}
