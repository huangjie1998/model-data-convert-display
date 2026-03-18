# CMake project for SKP to GLB Converter
# Requires: CMake 3.10+, Visual Studio 2019+ or MinGW-w64

cmake_minimum_required(VERSION 3.10)
project(skp_converter VERSION 1.0.0 LANGUAGES CXX)

# C++ Standard
set(CMAKE_CXX_STANDARD 11)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Set build type if not specified
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Detect platform
if(WIN32)
    set(SKP_PLATFORM "windows")
    set(SKP_ARCH "x64")
else()
    message(FATAL_ERROR "This project currently only supports Windows")
endif()

# ============================================================================
# SketchUp SDK Configuration
# ============================================================================

# SDK paths (relative to this CMakeLists.txt)
set(SKP_SDK_DIR "${CMAKE_CURRENT_SOURCE_DIR}/SDK_WIN_x64_2026-1-103")
set(SKP_SDK_HEADERS "${SKP_SDK_DIR}/headers")
set(SKP_SDK_BINARIES "${SKP_SDK_DIR}/binaries/sketchup/${SKP_ARCH}")

# Verify SDK exists
if(NOT EXISTS "${SKP_SDK_HEADERS}/SketchUpAPI/sketchup.h")
    message(FATAL_ERROR "SketchUp SDK not found at ${SKP_SDK_HEADERS}")
endif()

if(NOT EXISTS "${SKP_SDK_BINARIES}/SketchUpAPI.lib")
    message(FATAL_ERROR "SketchUp SDK library not found at ${SKP_SDK_BINARIES}")
endif()

message(STATUS "SketchUp SDK found: ${SKP_SDK_DIR}")

# ============================================================================
# Source Files
# ============================================================================

set(SOURCES
    skp_to_gltf.cpp
)

set(HEADERS
    skp_to_gltf.h
)

# ============================================================================
# DLL Target
# ============================================================================

add_library(${PROJECT_NAME} SHARED ${SOURCES} ${HEADERS})

# Define export macro
target_compile_definitions(${PROJECT_NAME} PRIVATE 
    SKP_TO_GLTF_EXPORTS
    _CRT_SECURE_NO_WARNINGS
    NOMINMAX
)

# Include directories
target_include_directories(${PROJECT_NAME} PRIVATE
    ${SKP_SDK_HEADERS}
    ${CMAKE_CURRENT_SOURCE_DIR}
)

# Link directories
link_directories(${SKP_SDK_BINARIES})

# Link libraries
target_link_libraries(${PROJECT_NAME} PRIVATE
    "${SKP_SDK_BINARIES}/SketchUpAPI.lib"
)

# Set output name
set_target_properties(${PROJECT_NAME} PROPERTIES
    PREFIX ""  # No 'lib' prefix on Windows
    RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
    LIBRARY_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib
    ARCHIVE_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/lib
)

# ============================================================================
# Copy Runtime DLLs
# ============================================================================

# Copy SketchUpAPI.dll to output directory
add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E copy_if_different
        "${SKP_SDK_BINARIES}/SketchUpAPI.dll"
        $<TARGET_FILE_DIR:${PROJECT_NAME}>
    COMMENT "Copying SketchUpAPI.dll to output directory"
)

# Copy additional required DLLs if they exist
set(SKP_ADDITIONAL_DLLS
    "${SKP_SDK_BINARIES}/SketchUpCommonPreferences.dll"
)

foreach(dll_path ${SKP_ADDITIONAL_DLLS})
    if(EXISTS ${dll_path})
        add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD
            COMMAND ${CMAKE_COMMAND} -E copy_if_different
                ${dll_path}
                $<TARGET_FILE_DIR:${PROJECT_NAME}>
            COMMENT "Copying ${dll_path} to output directory"
        )
    endif()
endforeach()

# ============================================================================
# Installation
# ============================================================================

# Install the DLL and dependencies
install(TARGETS ${PROJECT_NAME}
    RUNTIME DESTINATION bin
    LIBRARY DESTINATION lib
    ARCHIVE DESTINATION lib
)

install(FILES
    "${SKP_SDK_BINARIES}/SketchUpAPI.dll"
    DESTINATION bin
)

# Install headers for development
install(FILES ${HEADERS} DESTINATION include)

# ============================================================================
# Test Executable (Optional)
# ============================================================================

option(BUILD_TESTS "Build test executable" ON)

if(BUILD_TESTS)
    add_executable(test_converter test_converter.cpp)
    
    target_include_directories(test_converter PRIVATE
        ${SKP_SDK_HEADERS}
        ${CMAKE_CURRENT_SOURCE_DIR}
    )
    
    target_link_libraries(test_converter PRIVATE
        ${PROJECT_NAME}
    )
    
    set_target_properties(test_converter PROPERTIES
        RUNTIME_OUTPUT_DIRECTORY ${CMAKE_BINARY_DIR}/bin
    )
    
    # Copy test script
    configure_file(
        ${CMAKE_CURRENT_SOURCE_DIR}/test_dll.py
        ${CMAKE_BINARY_DIR}/bin/test_dll.py
        COPYONLY
    )
endif()

# ============================================================================
# Compiler-specific Options
# ============================================================================

if(MSVC)
    # Visual Studio specific settings
    target_compile_options(${PROJECT_NAME} PRIVATE
        /W3        # Warning level 3
        /MP        # Multi-processor compilation
        /EHsc      # Exception handling
        /bigobj    # Large object files
    )
    
    # Release optimizations
    target_compile_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/O2 /Ob2 /Oi /Ot /GL>
    )
    
    target_link_options(${PROJECT_NAME} PRIVATE
        $<$<CONFIG:Release>:/LTCG>
    )
    
    # Disable specific warnings
    target_compile_options(${PROJECT_NAME} PRIVATE
        /wd4996  # Disable deprecation warnings
        /wd4267  # Disable size_t conversion warnings
        /wd4244  # Disable type conversion warnings
    )
else()
    # MinGW or other compilers
    target_compile_options(${PROJECT_NAME} PRIVATE
        -Wall
        -Wextra
        $<$<CONFIG:Release>:-O3>
    )
endif()

# ============================================================================
# Print Configuration
# ============================================================================

message(STATUS "")
message(STATUS "=== SKP Converter Configuration ===")
message(STATUS "Project: ${PROJECT_NAME} v${PROJECT_VERSION}")
message(STATUS "Build Type: ${CMAKE_BUILD_TYPE}")
message(STATUS "C++ Standard: ${CMAKE_CXX_STANDARD}")
message(STATUS "Generator: ${CMAKE_GENERATOR}")
message(STATUS "")
message(STATUS "SketchUp SDK:")
message(STATUS "  Headers: ${SKP_SDK_HEADERS}")
message(STATUS "  Binaries: ${SKP_SDK_BINARIES}")
message(STATUS "")
message(STATUS "Output Directory: ${CMAKE_BINARY_DIR}/bin")
message(STATUS "Build Tests: ${BUILD_TESTS}")
message(STATUS "===================================")
message(STATUS "")
