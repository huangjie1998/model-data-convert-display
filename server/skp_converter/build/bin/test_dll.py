#!/usr/bin/env python3
"""
Test script for SKP to GLB Converter DLL
"""

import ctypes
import os
import sys
import json

class SKPConverter:
    """Python wrapper for SKP Converter DLL"""
    
    def __init__(self, dll_path=None):
        if dll_path is None:
            # Default to same directory as this script
            base_dir = os.path.dirname(os.path.abspath(__file__))
            dll_path = os.path.join(base_dir, "skp_converter.dll")
        
        if not os.path.exists(dll_path):
            raise FileNotFoundError(f"DLL not found: {dll_path}")
        
        # Load DLL
        try:
            self.dll = ctypes.CDLL(dll_path)
            self._setup_functions()
        except Exception as e:
            raise RuntimeError(f"Failed to load DLL: {e}")
    
    def _setup_functions(self):
        """Setup function signatures"""
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
        self.dll.skp_get_stats.restype = ctypes.c_char_p
        
        # skp_free_string
        self.dll.skp_free_string.argtypes = [ctypes.c_char_p]
        self.dll.skp_free_string.restype = None
    
    def initialize(self):
        """Initialize SketchUp API"""
        result = self.dll.skp_converter_init()
        return result == 0
    
    def cleanup(self):
        """Cleanup resources"""
        self.dll.skp_converter_cleanup()
    
    def convert(self, input_path, output_path):
        """
        Convert SKP to GLB
        
        Args:
            input_path: Path to input .skp file
            output_path: Path to output .glb file
            
        Returns:
            True if successful, False otherwise
        """
        input_bytes = input_path.encode('utf-8')
        output_bytes = output_path.encode('utf-8')
        result = self.dll.skp_to_glb(input_bytes, output_bytes)
        return result == 0
    
    def get_error(self):
        """Get last error message"""
        error_ptr = self.dll.skp_get_error()
        if error_ptr:
            return error_ptr.decode('utf-8')
        return "Unknown error"
    
    def get_stats(self, skp_path):
        """
        Get model statistics
        
        Args:
            skp_path: Path to SKP file
            
        Returns:
            Dictionary with model stats or None
        """
        path_bytes = skp_path.encode('utf-8')
        stats_ptr = self.dll.skp_get_stats(path_bytes)
        
        if stats_ptr:
            stats_json = stats_ptr.decode('utf-8')
            self.dll.skp_free_string(stats_ptr)
            return json.loads(stats_json)
        
        return None
    
    def __enter__(self):
        """Context manager entry"""
        if not self.initialize():
            raise RuntimeError(f"Failed to initialize: {self.get_error()}")
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.cleanup()


def test_basic():
    """Test basic DLL loading"""
    print("=" * 60)
    print("Test 1: Basic DLL Loading")
    print("=" * 60)
    
    try:
        converter = SKPConverter()
        print("✓ DLL loaded successfully")
        
        if converter.initialize():
            print("✓ SketchUp API initialized")
            converter.cleanup()
            print("✓ Cleanup successful")
            return True
        else:
            print(f"✗ Failed to initialize: {converter.get_error()}")
            return False
            
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def test_stats(skp_file):
    """Test getting model statistics"""
    print("\n" + "=" * 60)
    print("Test 2: Get Model Statistics")
    print("=" * 60)
    
    if not os.path.exists(skp_file):
        print(f"✗ SKP file not found: {skp_file}")
        return False
    
    try:
        with SKPConverter() as converter:
            stats = converter.get_stats(skp_file)
            if stats:
                print(f"✓ Got model stats:")
                print(f"  Name: {stats.get('name', 'N/A')}")
                print(f"  Faces: {stats.get('faces', 0)}")
                print(f"  Vertices: {stats.get('vertices', 0)}")
                return True
            else:
                print("✗ Failed to get stats")
                return False
    except Exception as e:
        print(f"✗ Error: {e}")
        return False


def test_convert(skp_file, output_file):
    """Test converting SKP to GLB"""
    print("\n" + "=" * 60)
    print("Test 3: Convert SKP to GLB")
    print("=" * 60)
    
    if not os.path.exists(skp_file):
        print(f"✗ SKP file not found: {skp_file}")
        return False
    
    try:
        with SKPConverter() as converter:
            print(f"Converting: {skp_file}")
            print(f"Output: {output_file}")
            
            if converter.convert(skp_file, output_file):
                if os.path.exists(output_file):
                    size = os.path.getsize(output_file)
                    print(f"✓ Conversion successful!")
                    print(f"  Output size: {size:,} bytes")
                    return True
                else:
                    print("✗ Output file not created")
                    return False
            else:
                print(f"✗ Conversion failed: {converter.get_error()}")
                return False
                
    except Exception as e:
        print(f"✗ Error: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Main test function"""
    print("SKP to GLB Converter - DLL Test")
    print("=" * 60)
    
    # Test 1: Basic loading
    if not test_basic():
        print("\n✗ Basic test failed, stopping")
        return 1
    
    # Get test file from command line or use default
    skp_file = sys.argv[1] if len(sys.argv) > 1 else None
    
    if skp_file:
        # Test 2: Stats
        test_stats(skp_file)
        
        # Test 3: Conversion
        output_file = sys.argv[2] if len(sys.argv) > 2 else "output.glb"
        test_convert(skp_file, output_file)
    else:
        print("\nNote: No SKP file provided. Skipping conversion tests.")
        print("Usage: python test_dll.py <input.skp> [output.glb]")
    
    print("\n" + "=" * 60)
    print("Tests completed")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())
