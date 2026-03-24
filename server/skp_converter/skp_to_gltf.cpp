
// SKP to GLB Converter using SketchUp C API
// Exports front/back primitives and embeds PBR textures into single-file GLB.

#include "skp_to_gltf.h"

#include <SketchUpAPI/sketchup.h>
#include <SketchUpAPI/geometry/transformation.h>
#include <SketchUpAPI/model/axes.h>
#include <SketchUpAPI/model/component_definition.h>
#include <SketchUpAPI/model/component_instance.h>
#include <SketchUpAPI/model/drawing_element.h>
#include <SketchUpAPI/model/entities.h>
#include <SketchUpAPI/model/entity.h>
#include <SketchUpAPI/model/face.h>
#include <SketchUpAPI/model/group.h>
#include <SketchUpAPI/model/image_rep.h>
#include <SketchUpAPI/model/layer.h>
#include <SketchUpAPI/model/material.h>
#include <SketchUpAPI/model/mesh_helper.h>
#include <SketchUpAPI/model/model.h>
#include <SketchUpAPI/model/texture.h>
#include <SketchUpAPI/model/texture_writer.h>

#include <algorithm>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <limits>
#include <map>
#include <sstream>
#include <string>
#include <vector>

#ifdef _WIN32
#include <windows.h>
#endif

static char g_error_message[1024] = {0};
#define SET_ERROR(msg) strncpy(g_error_message, msg, sizeof(g_error_message) - 1)

struct TextureImage {
    std::string mime_type;
    std::vector<SUByte> bytes;
};

struct Material {
    std::string name;
    float r;
    float g;
    float b;
    float a;
    float metallic_factor;
    float roughness_factor;

    int base_color_texture;
    int metallic_roughness_texture;
    int normal_texture;
    float normal_scale;
    int occlusion_texture;
    float occlusion_strength;

    Material()
        : name("Default"),
          r(0.8f),
          g(0.8f),
          b(0.8f),
          a(1.0f),
          metallic_factor(0.0f),
          roughness_factor(0.9f),
          base_color_texture(-1),
          metallic_roughness_texture(-1),
          normal_texture(-1),
          normal_scale(1.0f),
          occlusion_texture(-1),
          occlusion_strength(1.0f) {}
};

struct Vertex {
    float x;
    float y;
    float z;
    float u;
    float v;
};

struct RawImage {
    size_t width;
    size_t height;
    std::vector<SUByte> rgba;  // Canonical RGBA order
};

struct PrimitiveKey {
    int material_index;
    bool back_side;

    bool operator<(const PrimitiveKey& rhs) const {
        if (material_index != rhs.material_index) return material_index < rhs.material_index;
        return back_side < rhs.back_side;
    }
};

struct PrimitiveData {
    int material_index;
    std::vector<Vertex> vertices;
    std::vector<unsigned int> indices;
};

struct MeshData {
    std::vector<Material> materials;
    std::vector<PrimitiveData> primitives;
    double unit_scale_to_meters;

    std::map<int64_t, int> material_pid_to_index;
    std::map<PrimitiveKey, size_t> primitive_key_to_index;
    std::vector<TextureImage> images;
    std::vector<int> texture_to_image;  // glTF texture index -> image index
    std::map<std::string, int> image_key_to_index;
    std::map<int, int> image_index_to_texture_index;

    MeshData() : unit_scale_to_meters(0.0254) {
        materials.push_back(Material());
        material_pid_to_index[0] = 0;
    }
};

class CSUString {
public:
    CSUString() {
        SUSetInvalid(su_str_);
        SUStringCreate(&su_str_);
    }
    ~CSUString() { SUStringRelease(&su_str_); }

    operator SUStringRef*() { return &su_str_; }

    std::string utf8() const {
        size_t length = 0;
        SUStringGetUTF8Length(su_str_, &length);
        std::string str(length + 1, '\0');
        size_t returned_length = 0;
        SUStringGetUTF8(su_str_, length + 1, &str[0], &returned_length);
        str.resize(returned_length);
        return str;
    }

private:
    SUStringRef su_str_;
    CSUString(const CSUString&);
    CSUString& operator=(const CSUString&);
};

static std::string JsonEscape(const std::string& input) {
    std::ostringstream out;
    for (size_t i = 0; i < input.size(); ++i) {
        unsigned char c = static_cast<unsigned char>(input[i]);
        switch (c) {
            case '\\': out << "\\\\"; break;
            case '"': out << "\\\""; break;
            case '\b': out << "\\b"; break;
            case '\f': out << "\\f"; break;
            case '\n': out << "\\n"; break;
            case '\r': out << "\\r"; break;
            case '\t': out << "\\t"; break;
            default:
                if (c < 0x20) {
                    out << "\\u00";
                    const char* hex = "0123456789abcdef";
                    out << hex[(c >> 4) & 0xF] << hex[c & 0xF];
                } else {
                    out << static_cast<char>(c);
                }
        }
    }
    return out.str();
}

static float Clamp01(float v) {
    if (v < 0.0f) return 0.0f;
    if (v > 1.0f) return 1.0f;
    return v;
}

static const char* ModelUnitsToName(enum SUModelUnits units) {
    switch (units) {
        case SUModelUnits_Inches:
            return "inches";
        case SUModelUnits_Feet:
            return "feet";
        case SUModelUnits_Millimeters:
            return "millimeters";
        case SUModelUnits_Centimeters:
            return "centimeters";
        case SUModelUnits_Meters:
            return "meters";
        default:
            return "unknown";
    }
}

static bool GetModelAxesInverseTransform(SUModelRef model, SUTransformation& out_transform) {
    SUAxesRef axes = SU_INVALID;
    if (SUModelGetAxes(model, &axes) != SU_ERROR_NONE || SUIsInvalid(axes)) return false;

    SUTransformation axes_transform;
    if (SUAxesGetTransform(axes, &axes_transform) != SU_ERROR_NONE) return false;

    if (SUTransformationGetInverse(&axes_transform, &out_transform) != SU_ERROR_NONE) return false;
    return true;
}

static void TransformPoint(const SUTransformation& t, const SUPoint3D& in, float& x, float& y, float& z) {
    double sx = in.x * t.values[0] + in.y * t.values[4] + in.z * t.values[8] + t.values[12];
    double sy = in.x * t.values[1] + in.y * t.values[5] + in.z * t.values[9] + t.values[13];
    double sz = in.x * t.values[2] + in.y * t.values[6] + in.z * t.values[10] + t.values[14];
    double w = in.x * t.values[3] + in.y * t.values[7] + in.z * t.values[11] + t.values[15];
    if (w != 0.0 && w != 1.0) {
        sx /= w;
        sy /= w;
        sz /= w;
    }
    x = static_cast<float>(sx);
    y = static_cast<float>(sy);
    z = static_cast<float>(sz);
}

static std::string MakeTempFilePath(const char* suffix) {
#ifdef _WIN32
    char temp_dir[MAX_PATH] = {0};
    DWORD got_dir = GetTempPathA(MAX_PATH, temp_dir);
    if (got_dir == 0 || got_dir > MAX_PATH) return "";

    char temp_file[MAX_PATH] = {0};
    if (GetTempFileNameA(temp_dir, "skp", 0, temp_file) == 0) return "";

    // GetTempFileName creates the file. Remove it and use a controlled extension.
    DeleteFileA(temp_file);
    std::string path(temp_file);
    path += suffix;
    return path;
#else
    char name_buf[L_tmpnam] = {0};
    if (!std::tmpnam(name_buf)) return "";
    std::string path(name_buf);
    path += suffix;
    return path;
#endif
}

static bool ReadBinaryFile(const std::string& path, std::vector<SUByte>& out) {
    std::ifstream in(path.c_str(), std::ios::binary);
    if (!in) return false;
    in.seekg(0, std::ios::end);
    std::streamoff length = in.tellg();
    if (length <= 0) return false;
    in.seekg(0, std::ios::beg);
    out.resize(static_cast<size_t>(length));
    in.read(reinterpret_cast<char*>(&out[0]), length);
    return in.good();
}

static void DeleteFileIfExists(const std::string& path) {
#ifdef _WIN32
    DeleteFileA(path.c_str());
#else
    std::remove(path.c_str());
#endif
}

static bool ExtractTextureRGBA(SUTextureRef texture, RawImage& out) {
    out.width = 0;
    out.height = 0;
    out.rgba.clear();

    if (SUIsInvalid(texture)) return false;

    SUImageRepRef image = SU_INVALID;
    if (SUImageRepCreate(&image) != SU_ERROR_NONE) return false;

    enum SUResult result = SUTextureGetImageRep(texture, &image);
    if (result != SU_ERROR_NONE) {
        SUImageRepRelease(&image);
        return false;
    }

    SUImageRepConvertTo32BitsPerPixel(image);

    size_t width = 0;
    size_t height = 0;
    if (SUImageRepGetPixelDimensions(image, &width, &height) != SU_ERROR_NONE || width == 0 || height == 0) {
        SUImageRepRelease(&image);
        return false;
    }

    size_t data_size = 0;
    size_t bits_per_pixel = 0;
    if (SUImageRepGetDataSize(image, &data_size, &bits_per_pixel) != SU_ERROR_NONE || bits_per_pixel != 32 || data_size == 0) {
        SUImageRepRelease(&image);
        return false;
    }

    std::vector<SUByte> src(data_size);
    if (SUImageRepGetData(image, data_size, &src[0]) != SU_ERROR_NONE) {
        SUImageRepRelease(&image);
        return false;
    }

    size_t row_padding = 0;
    SUImageRepGetRowPadding(image, &row_padding);

    SUColorOrder order = SUGetColorOrder();
    const size_t packed_stride = width * 4;
    size_t src_stride = packed_stride + row_padding;
    if (src_stride * height > src.size()) {
        src_stride = packed_stride;
    }
    if (src_stride * height > src.size() || order.red_index < 0 || order.green_index < 0 || order.blue_index < 0 || order.alpha_index < 0 ||
        order.red_index > 3 || order.green_index > 3 || order.blue_index > 3 || order.alpha_index > 3) {
        SUImageRepRelease(&image);
        return false;
    }

    out.width = width;
    out.height = height;
    out.rgba.resize(width * height * 4, 0);

    for (size_t y = 0; y < height; ++y) {
        const SUByte* row = &src[y * src_stride];
        for (size_t x = 0; x < width; ++x) {
            const SUByte* pixel = row + x * 4;
            size_t dst = (y * width + x) * 4;
            out.rgba[dst + 0] = pixel[order.red_index];
            out.rgba[dst + 1] = pixel[order.green_index];
            out.rgba[dst + 2] = pixel[order.blue_index];
            out.rgba[dst + 3] = pixel[order.alpha_index];
        }
    }

    SUImageRepRelease(&image);
    return true;
}

static bool EncodeRGBAAsPng(const RawImage& image, std::vector<SUByte>& png_bytes) {
    png_bytes.clear();
    if (image.width == 0 || image.height == 0 || image.rgba.size() != image.width * image.height * 4) return false;

    SUColorOrder order = SUGetColorOrder();
    if (order.red_index < 0 || order.green_index < 0 || order.blue_index < 0 || order.alpha_index < 0 ||
        order.red_index > 3 || order.green_index > 3 || order.blue_index > 3 || order.alpha_index > 3) {
        return false;
    }

    std::vector<SUByte> platform_pixels(image.rgba.size(), 0);
    for (size_t i = 0; i < image.width * image.height; ++i) {
        size_t base = i * 4;
        platform_pixels[base + order.red_index] = image.rgba[base + 0];
        platform_pixels[base + order.green_index] = image.rgba[base + 1];
        platform_pixels[base + order.blue_index] = image.rgba[base + 2];
        platform_pixels[base + order.alpha_index] = image.rgba[base + 3];
    }

    SUImageRepRef su_image = SU_INVALID;
    if (SUImageRepCreate(&su_image) != SU_ERROR_NONE) return false;

    enum SUResult set_result = SUImageRepSetData(
        su_image,
        image.width,
        image.height,
        32,
        0,
        &platform_pixels[0]
    );
    if (set_result != SU_ERROR_NONE) {
        SUImageRepRelease(&su_image);
        return false;
    }

    std::string temp_png = MakeTempFilePath(".png");
    if (temp_png.empty()) {
        SUImageRepRelease(&su_image);
        return false;
    }

    bool ok = false;
    if (SUImageRepSaveToFile(su_image, temp_png.c_str()) == SU_ERROR_NONE) {
        ok = ReadBinaryFile(temp_png, png_bytes);
    }

    SUImageRepRelease(&su_image);
    DeleteFileIfExists(temp_png);
    return ok;
}

static unsigned long long HashFNV1a64(const std::vector<SUByte>& data) {
    const unsigned long long prime = 1099511628211ULL;
    unsigned long long hash = 1469598103934665603ULL;
    for (size_t i = 0; i < data.size(); ++i) {
        hash ^= static_cast<unsigned long long>(data[i]);
        hash *= prime;
    }
    return hash;
}

static int AddImageAndTexture(MeshData& mesh, const std::vector<SUByte>& png_bytes) {
    if (png_bytes.empty()) return -1;

    unsigned long long hash = HashFNV1a64(png_bytes);
    std::ostringstream key_builder;
    key_builder << "image/png#" << png_bytes.size() << "#" << hash;
    std::string key = key_builder.str();

    int image_index = -1;
    std::map<std::string, int>::const_iterator image_it = mesh.image_key_to_index.find(key);
    if (image_it != mesh.image_key_to_index.end()) {
        image_index = image_it->second;
    } else {
        TextureImage image;
        image.mime_type = "image/png";
        image.bytes = png_bytes;
        image_index = static_cast<int>(mesh.images.size());
        mesh.images.push_back(image);
        mesh.image_key_to_index[key] = image_index;
    }

    std::map<int, int>::const_iterator tex_it = mesh.image_index_to_texture_index.find(image_index);
    if (tex_it != mesh.image_index_to_texture_index.end()) {
        return tex_it->second;
    }

    int texture_index = static_cast<int>(mesh.texture_to_image.size());
    mesh.texture_to_image.push_back(image_index);
    mesh.image_index_to_texture_index[image_index] = texture_index;
    return texture_index;
}

static int AddTextureFromRawImage(MeshData& mesh, const RawImage& image) {
    std::vector<SUByte> png_bytes;
    if (!EncodeRGBAAsPng(image, png_bytes)) return -1;
    return AddImageAndTexture(mesh, png_bytes);
}

static bool GetMaterialTexture(SUMaterialRef material, int slot, SUTextureRef* texture) {
    if (!texture) return false;
    *texture = SU_INVALID;
    if (SUIsInvalid(material)) return false;

    enum SUResult result = SU_ERROR_NONE;
    switch (slot) {
        case 0: result = SUMaterialGetTexture(material, texture); break;
        case 1: result = SUMaterialGetNormalTexture(material, texture); break;
        case 2: result = SUMaterialGetMetallicTexture(material, texture); break;
        case 3: result = SUMaterialGetRoughnessTexture(material, texture); break;
        case 4: result = SUMaterialGetAOTexture(material, texture); break;
        default: return false;
    }
    return result == SU_ERROR_NONE && SUIsValid(*texture);
}

static SUByte SampleGrayNearest(const RawImage& image, size_t x, size_t y, SUByte fallback) {
    if (image.width == 0 || image.height == 0 || image.rgba.size() < image.width * image.height * 4) return fallback;
    if (x >= image.width || y >= image.height) return fallback;
    size_t idx = (y * image.width + x) * 4;
    return image.rgba[idx];
}

static RawImage BuildMetallicRoughnessImage(
    const RawImage* metallic_image,
    const RawImage* roughness_image,
    float metallic_factor,
    float roughness_factor
) {
    RawImage combined;
    combined.width = 0;
    combined.height = 0;

    const bool has_metallic = metallic_image && metallic_image->width > 0 && metallic_image->height > 0;
    const bool has_roughness = roughness_image && roughness_image->width > 0 && roughness_image->height > 0;

    if (!has_metallic && !has_roughness) return combined;

    if (has_metallic && has_roughness) {
        combined.width = std::max(metallic_image->width, roughness_image->width);
        combined.height = std::max(metallic_image->height, roughness_image->height);
    } else if (has_metallic) {
        combined.width = metallic_image->width;
        combined.height = metallic_image->height;
    } else {
        combined.width = roughness_image->width;
        combined.height = roughness_image->height;
    }

    combined.rgba.resize(combined.width * combined.height * 4, 0);

    const SUByte default_m = static_cast<SUByte>(Clamp01(metallic_factor) * 255.0f + 0.5f);
    const SUByte default_r = static_cast<SUByte>(Clamp01(roughness_factor) * 255.0f + 0.5f);

    for (size_t y = 0; y < combined.height; ++y) {
        for (size_t x = 0; x < combined.width; ++x) {
            SUByte m = default_m;
            SUByte r = default_r;

            if (has_metallic) {
                size_t mx = (x * metallic_image->width) / combined.width;
                size_t my = (y * metallic_image->height) / combined.height;
                m = SampleGrayNearest(*metallic_image, mx, my, default_m);
            }

            if (has_roughness) {
                size_t rx = (x * roughness_image->width) / combined.width;
                size_t ry = (y * roughness_image->height) / combined.height;
                r = SampleGrayNearest(*roughness_image, rx, ry, default_r);
            }

            size_t idx = (y * combined.width + x) * 4;
            combined.rgba[idx + 0] = 255;  // R unused by glTF metallicRoughness
            combined.rgba[idx + 1] = r;    // G = roughness
            combined.rgba[idx + 2] = m;    // B = metallic
            combined.rgba[idx + 3] = 255;
        }
    }

    return combined;
}

static int EnsureMaterial(SUMaterialRef su_material, MeshData& mesh) {
    if (SUIsInvalid(su_material)) return 0;

    int64_t material_pid = 0;
    SUEntityRef material_entity = SUMaterialToEntity(su_material);
    if (SUIsValid(material_entity)) {
        SUEntityGetPersistentID(material_entity, &material_pid);
    }

    if (material_pid != 0) {
        std::map<int64_t, int>::const_iterator found = mesh.material_pid_to_index.find(material_pid);
        if (found != mesh.material_pid_to_index.end()) return found->second;
    }

    Material material;

    CSUString name;
    if (SUMaterialGetName(su_material, name) == SU_ERROR_NONE) {
        std::string raw_name = name.utf8();
        if (!raw_name.empty()) material.name = raw_name;
    }

    SUColor color;
    if (SUMaterialGetColor(su_material, &color) == SU_ERROR_NONE) {
        material.r = static_cast<float>(color.red) / 255.0f;
        material.g = static_cast<float>(color.green) / 255.0f;
        material.b = static_cast<float>(color.blue) / 255.0f;
        material.a = static_cast<float>(color.alpha) / 255.0f;
    }

    bool use_opacity = false;
    if (SUMaterialGetUseOpacity(su_material, &use_opacity) == SU_ERROR_NONE && use_opacity) {
        double opacity = 1.0;
        if (SUMaterialGetOpacity(su_material, &opacity) == SU_ERROR_NONE) {
            material.a = Clamp01(static_cast<float>(opacity));
        }
    }

    double metallic_factor = 0.0;
    if (SUMaterialGetMetallicFactor(su_material, &metallic_factor) == SU_ERROR_NONE) {
        material.metallic_factor = Clamp01(static_cast<float>(metallic_factor));
    }

    double roughness_factor = 0.9;
    if (SUMaterialGetRoughnessFactor(su_material, &roughness_factor) == SU_ERROR_NONE) {
        material.roughness_factor = Clamp01(static_cast<float>(roughness_factor));
    }

    double normal_scale = 1.0;
    if (SUMaterialGetNormalScale(su_material, &normal_scale) == SU_ERROR_NONE) {
        material.normal_scale = static_cast<float>(normal_scale);
        if (material.normal_scale < 0.0f) material.normal_scale = 0.0f;
    }

    double ao_strength = 1.0;
    if (SUMaterialGetAOStrength(su_material, &ao_strength) == SU_ERROR_NONE) {
        material.occlusion_strength = Clamp01(static_cast<float>(ao_strength));
    }

    SUTextureRef tex = SU_INVALID;
    RawImage base_color_image;
    if (GetMaterialTexture(su_material, 0, &tex) && ExtractTextureRGBA(tex, base_color_image)) {
        material.base_color_texture = AddTextureFromRawImage(mesh, base_color_image);
    }

    RawImage normal_image;
    if (GetMaterialTexture(su_material, 1, &tex) && ExtractTextureRGBA(tex, normal_image)) {
        material.normal_texture = AddTextureFromRawImage(mesh, normal_image);
    }

    RawImage metallic_image;
    RawImage roughness_image;
    bool has_metallic_image = false;
    bool has_roughness_image = false;

    if (GetMaterialTexture(su_material, 2, &tex)) {
        has_metallic_image = ExtractTextureRGBA(tex, metallic_image);
    }
    if (GetMaterialTexture(su_material, 3, &tex)) {
        has_roughness_image = ExtractTextureRGBA(tex, roughness_image);
    }
    if (has_metallic_image || has_roughness_image) {
        RawImage mr_image = BuildMetallicRoughnessImage(
            has_metallic_image ? &metallic_image : NULL,
            has_roughness_image ? &roughness_image : NULL,
            material.metallic_factor,
            material.roughness_factor
        );
        material.metallic_roughness_texture = AddTextureFromRawImage(mesh, mr_image);
    }

    RawImage ao_image;
    if (GetMaterialTexture(su_material, 4, &tex) && ExtractTextureRGBA(tex, ao_image)) {
        material.occlusion_texture = AddTextureFromRawImage(mesh, ao_image);
    }

    int material_index = static_cast<int>(mesh.materials.size());
    if (material.name.empty()) {
        std::ostringstream auto_name;
        auto_name << "Material_" << material_index;
        material.name = auto_name.str();
    }

    mesh.materials.push_back(material);
    if (material_pid != 0) {
        mesh.material_pid_to_index[material_pid] = material_index;
    }
    return material_index;
}

static PrimitiveData& GetOrCreatePrimitive(MeshData& mesh, int material_index, bool back_side) {
    PrimitiveKey key;
    key.material_index = material_index;
    key.back_side = back_side;

    std::map<PrimitiveKey, size_t>::const_iterator found = mesh.primitive_key_to_index.find(key);
    if (found != mesh.primitive_key_to_index.end()) {
        return mesh.primitives[found->second];
    }

    PrimitiveData primitive;
    primitive.material_index = material_index;
    mesh.primitives.push_back(primitive);
    size_t primitive_index = mesh.primitives.size() - 1;
    mesh.primitive_key_to_index[key] = primitive_index;
    return mesh.primitives[primitive_index];
}

static void AddFaceSideGeometry(
    MeshData& mesh,
    int material_index,
    const std::vector<SUPoint3D>& positions,
    const std::vector<SUPoint3D>& stq_coords,
    const std::vector<size_t>& tri_indices,
    bool back_side,
    const SUTransformation* transform
) {
    if (positions.empty() || tri_indices.empty()) return;

    PrimitiveData& primitive = GetOrCreatePrimitive(mesh, material_index, back_side);
    size_t base_vertex = primitive.vertices.size();

    for (size_t i = 0; i < positions.size(); ++i) {
        Vertex vertex;
        float x = 0.0f;
        float y = 0.0f;
        float z = 0.0f;
        if (transform) {
            TransformPoint(*transform, positions[i], x, y, z);
        } else {
            x = static_cast<float>(positions[i].x);
            y = static_cast<float>(positions[i].y);
            z = static_cast<float>(positions[i].z);
        }
        vertex.x = static_cast<float>(x * mesh.unit_scale_to_meters);
        vertex.y = static_cast<float>(y * mesh.unit_scale_to_meters);
        vertex.z = static_cast<float>(z * mesh.unit_scale_to_meters);

        double s = 0.0;
        double t = 0.0;
        double q = 1.0;
        if (i < stq_coords.size()) {
            s = stq_coords[i].x;
            t = stq_coords[i].y;
            q = stq_coords[i].z;
            if (std::fabs(q) > 1e-8) {
                s /= q;
                t /= q;
            }
        }

        vertex.u = static_cast<float>(s);
        vertex.v = static_cast<float>(t);
        primitive.vertices.push_back(vertex);
    }

    const size_t tri_count = tri_indices.size() / 3;
    for (size_t tri = 0; tri < tri_count; ++tri) {
        size_t i0 = tri_indices[tri * 3 + 0];
        size_t i1 = tri_indices[tri * 3 + 1];
        size_t i2 = tri_indices[tri * 3 + 2];

        if (i0 >= positions.size() || i1 >= positions.size() || i2 >= positions.size()) continue;
        if (back_side) std::swap(i1, i2);

        primitive.indices.push_back(static_cast<unsigned int>(base_vertex + i0));
        primitive.indices.push_back(static_cast<unsigned int>(base_vertex + i1));
        primitive.indices.push_back(static_cast<unsigned int>(base_vertex + i2));
    }
}

static SUMaterialRef GetLayerMaterialForDrawingElement(SUDrawingElementRef drawing_element) {
    if (SUIsInvalid(drawing_element)) return SU_INVALID;
    SULayerRef layer = SU_INVALID;
    if (SUDrawingElementGetLayer(drawing_element, &layer) != SU_ERROR_NONE || SUIsInvalid(layer)) return SU_INVALID;

    SUMaterialRef layer_material = SU_INVALID;
    if (SULayerGetMaterial(layer, &layer_material) != SU_ERROR_NONE) return SU_INVALID;
    return layer_material;
}

static SUMaterialRef GetDirectOrLayerMaterial(SUDrawingElementRef drawing_element) {
    if (SUIsInvalid(drawing_element)) return SU_INVALID;

    SUMaterialRef material = SU_INVALID;
    SUDrawingElementGetMaterial(drawing_element, &material);
    if (SUIsValid(material)) return material;

    return GetLayerMaterialForDrawingElement(drawing_element);
}

static SUMaterialRef ResolveMaterialOrFallback(SUMaterialRef face_material, SUMaterialRef inherited_material) {
    return SUIsValid(face_material) ? face_material : inherited_material;
}

static void ProcessFace(
    SUFaceRef face,
    MeshData& mesh,
    const SUTransformation* transform,
    SUMaterialRef inherited_front_material,
    SUMaterialRef inherited_back_material,
    SUTextureWriterRef texture_writer
) {
    SUMeshHelperRef helper = SU_INVALID;
    enum SUResult mesh_result = SU_ERROR_NO_DATA;
    if (SUIsValid(texture_writer)) {
        mesh_result = SUMeshHelperCreateWithTextureWriter(&helper, face, texture_writer);
    }
    if (mesh_result != SU_ERROR_NONE || SUIsInvalid(helper)) {
        if (SUMeshHelperCreate(&helper, face) != SU_ERROR_NONE || SUIsInvalid(helper)) return;
    }

    size_t vertex_count = 0;
    if (SUMeshHelperGetNumVertices(helper, &vertex_count) != SU_ERROR_NONE || vertex_count == 0) {
        SUMeshHelperRelease(&helper);
        return;
    }

    std::vector<SUPoint3D> positions(vertex_count);
    size_t positions_count = vertex_count;
    if (SUMeshHelperGetVertices(helper, vertex_count, &positions[0], &positions_count) != SU_ERROR_NONE || positions_count == 0) {
        SUMeshHelperRelease(&helper);
        return;
    }
    positions.resize(positions_count);

    std::vector<SUPoint3D> front_stq(vertex_count);
    size_t front_count = vertex_count;
    if (SUMeshHelperGetFrontSTQCoords(helper, vertex_count, &front_stq[0], &front_count) == SU_ERROR_NONE) {
        front_stq.resize(front_count);
    } else {
        front_stq.clear();
    }

    std::vector<SUPoint3D> back_stq(vertex_count);
    size_t back_count = vertex_count;
    if (SUMeshHelperGetBackSTQCoords(helper, vertex_count, &back_stq[0], &back_count) == SU_ERROR_NONE) {
        back_stq.resize(back_count);
    } else {
        back_stq.clear();
    }

    size_t triangle_count = 0;
    if (SUMeshHelperGetNumTriangles(helper, &triangle_count) != SU_ERROR_NONE || triangle_count == 0) {
        SUMeshHelperRelease(&helper);
        return;
    }

    std::vector<size_t> tri_indices(triangle_count * 3);
    size_t index_count = triangle_count * 3;
    if (SUMeshHelperGetVertexIndices(helper, triangle_count * 3, &tri_indices[0], &index_count) != SU_ERROR_NONE || index_count < 3) {
        SUMeshHelperRelease(&helper);
        return;
    }
    index_count -= (index_count % 3);
    tri_indices.resize(index_count);

    SUMaterialRef front_material = SU_INVALID;
    SUMaterialRef back_material = SU_INVALID;
    SUFaceGetFrontMaterial(face, &front_material);
    SUFaceGetBackMaterial(face, &back_material);
    SUMaterialRef face_layer_material = GetLayerMaterialForDrawingElement(SUFaceToDrawingElement(face));

    front_material = ResolveMaterialOrFallback(front_material, inherited_front_material);
    if (!SUIsValid(front_material)) front_material = face_layer_material;
    back_material = ResolveMaterialOrFallback(back_material, inherited_back_material);
    if (!SUIsValid(back_material)) back_material = face_layer_material;
    if (!SUIsValid(back_material)) back_material = front_material;

    const int front_material_index = EnsureMaterial(front_material, mesh);
    const int back_material_index = EnsureMaterial(back_material, mesh);

    AddFaceSideGeometry(mesh, front_material_index, positions, front_stq, tri_indices, false, transform);
    AddFaceSideGeometry(
        mesh,
        back_material_index,
        positions,
        back_stq.empty() ? front_stq : back_stq,
        tri_indices,
        true,
        transform
    );

    SUMeshHelperRelease(&helper);
}

static void TraverseEntities(
    SUEntitiesRef entities,
    MeshData& mesh,
    const SUTransformation* parent_transform,
    SUMaterialRef inherited_front_material,
    SUMaterialRef inherited_back_material,
    SUTextureWriterRef texture_writer
) {
    size_t face_count = 0;
    SUEntitiesGetNumFaces(entities, &face_count);
    if (face_count > 0) {
        std::vector<SUFaceRef> faces(face_count);
        SUEntitiesGetFaces(entities, face_count, &faces[0], &face_count);
        for (size_t i = 0; i < face_count; ++i) {
            ProcessFace(
                faces[i],
                mesh,
                parent_transform,
                inherited_front_material,
                inherited_back_material,
                texture_writer
            );
        }
    }

    size_t instance_count = 0;
    SUEntitiesGetNumInstances(entities, &instance_count);
    if (instance_count > 0) {
        std::vector<SUComponentInstanceRef> instances(instance_count);
        SUEntitiesGetInstances(entities, instance_count, &instances[0], &instance_count);
        for (size_t i = 0; i < instance_count; ++i) {
            SUTransformation local;
            SUTransformation combined;
            SUComponentInstanceGetTransform(instances[i], &local);
            if (parent_transform) {
                SUTransformationMultiply(parent_transform, &local, &combined);
            } else {
                combined = local;
            }

            SUComponentDefinitionRef definition = SU_INVALID;
            SUComponentInstanceGetDefinition(instances[i], &definition);
            if (SUIsInvalid(definition)) continue;

            SUEntitiesRef child_entities = SU_INVALID;
            SUComponentDefinitionGetEntities(definition, &child_entities);
            if (SUIsInvalid(child_entities)) continue;

            SUMaterialRef instance_material = GetDirectOrLayerMaterial(SUComponentInstanceToDrawingElement(instances[i]));
            SUMaterialRef definition_material = GetDirectOrLayerMaterial(SUComponentDefinitionToDrawingElement(definition));
            SUMaterialRef container_material = SUIsValid(instance_material) ? instance_material : definition_material;
            SUMaterialRef child_front_material =
                SUIsValid(container_material) ? container_material : inherited_front_material;
            SUMaterialRef child_back_material =
                SUIsValid(container_material) ? container_material : inherited_back_material;

            TraverseEntities(
                child_entities,
                mesh,
                &combined,
                child_front_material,
                child_back_material,
                texture_writer
            );
        }
    }

    size_t group_count = 0;
    SUEntitiesGetNumGroups(entities, &group_count);
    if (group_count > 0) {
        std::vector<SUGroupRef> groups(group_count);
        SUEntitiesGetGroups(entities, group_count, &groups[0], &group_count);
        for (size_t i = 0; i < group_count; ++i) {
            SUTransformation local;
            SUTransformation combined;
            SUGroupGetTransform(groups[i], &local);
            if (parent_transform) {
                SUTransformationMultiply(parent_transform, &local, &combined);
            } else {
                combined = local;
            }

            SUEntitiesRef child_entities = SU_INVALID;
            SUGroupGetEntities(groups[i], &child_entities);
            if (SUIsInvalid(child_entities)) continue;

            SUMaterialRef group_material = GetDirectOrLayerMaterial(SUGroupToDrawingElement(groups[i]));
            SUMaterialRef child_front_material =
                SUIsValid(group_material) ? group_material : inherited_front_material;
            SUMaterialRef child_back_material =
                SUIsValid(group_material) ? group_material : inherited_back_material;

            TraverseEntities(
                child_entities,
                mesh,
                &combined,
                child_front_material,
                child_back_material,
                texture_writer
            );
        }
    }
}

static void LoadTextureWriterEntities(SUTextureWriterRef writer, SUEntitiesRef entities) {
    if (SUIsInvalid(writer) || SUIsInvalid(entities)) return;

    size_t face_count = 0;
    SUEntitiesGetNumFaces(entities, &face_count);
    if (face_count > 0) {
        std::vector<SUFaceRef> faces(face_count);
        SUEntitiesGetFaces(entities, face_count, &faces[0], &face_count);
        for (size_t i = 0; i < face_count; ++i) {
            long front_texture_id = 0;
            long back_texture_id = 0;
            SUTextureWriterLoadFace(writer, faces[i], &front_texture_id, &back_texture_id);
        }
    }

    size_t instance_count = 0;
    SUEntitiesGetNumInstances(entities, &instance_count);
    if (instance_count > 0) {
        std::vector<SUComponentInstanceRef> instances(instance_count);
        SUEntitiesGetInstances(entities, instance_count, &instances[0], &instance_count);
        for (size_t i = 0; i < instance_count; ++i) {
            long texture_id = 0;
            SUTextureWriterLoadEntity(writer, SUComponentInstanceToEntity(instances[i]), &texture_id);

            SUComponentDefinitionRef definition = SU_INVALID;
            SUComponentInstanceGetDefinition(instances[i], &definition);
            if (SUIsInvalid(definition)) continue;
            SUEntitiesRef child_entities = SU_INVALID;
            SUComponentDefinitionGetEntities(definition, &child_entities);
            if (SUIsInvalid(child_entities)) continue;
            LoadTextureWriterEntities(writer, child_entities);
        }
    }

    size_t group_count = 0;
    SUEntitiesGetNumGroups(entities, &group_count);
    if (group_count > 0) {
        std::vector<SUGroupRef> groups(group_count);
        SUEntitiesGetGroups(entities, group_count, &groups[0], &group_count);
        for (size_t i = 0; i < group_count; ++i) {
            long texture_id = 0;
            SUTextureWriterLoadEntity(writer, SUGroupToEntity(groups[i]), &texture_id);

            SUEntitiesRef child_entities = SU_INVALID;
            SUGroupGetEntities(groups[i], &child_entities);
            if (SUIsInvalid(child_entities)) continue;
            LoadTextureWriterEntities(writer, child_entities);
        }
    }
}

struct BufferViewDef {
    size_t byte_offset;
    size_t byte_length;
    int target;
};

struct AccessorDef {
    int buffer_view;
    size_t byte_offset;
    int component_type;
    size_t count;
    std::string type;
    bool has_min_max;
    float min_v[3];
    float max_v[3];
};

struct PrimitiveDef {
    int position_accessor;
    int uv_accessor;
    int index_accessor;
    int material_index;
};

static void Align4(std::vector<SUByte>& bin) {
    while ((bin.size() % 4) != 0) bin.push_back(0);
}

static size_t AppendBytes(std::vector<SUByte>& bin, const void* data, size_t len, size_t alignment) {
    if (alignment > 1) {
        while ((bin.size() % alignment) != 0) bin.push_back(0);
    }
    size_t offset = bin.size();
    const SUByte* bytes = reinterpret_cast<const SUByte*>(data);
    bin.insert(bin.end(), bytes, bytes + len);
    return offset;
}

static int WriteGLB(const char* output_path, const MeshData& mesh) {
    if (mesh.primitives.empty()) {
        SET_ERROR("No geometry found in SKP");
        return 1;
    }

    std::vector<BufferViewDef> buffer_views;
    std::vector<AccessorDef> accessors;
    std::vector<PrimitiveDef> primitive_defs;
    std::vector<int> image_buffer_views(mesh.images.size(), -1);
    std::vector<SUByte> bin;

    for (size_t p = 0; p < mesh.primitives.size(); ++p) {
        const PrimitiveData& primitive = mesh.primitives[p];
        if (primitive.vertices.empty() || primitive.indices.empty()) continue;

        std::vector<float> pos_data;
        std::vector<float> uv_data;
        pos_data.reserve(primitive.vertices.size() * 3);
        uv_data.reserve(primitive.vertices.size() * 2);

        float min_x = std::numeric_limits<float>::max();
        float min_y = std::numeric_limits<float>::max();
        float min_z = std::numeric_limits<float>::max();
        float max_x = -std::numeric_limits<float>::max();
        float max_y = -std::numeric_limits<float>::max();
        float max_z = -std::numeric_limits<float>::max();

        for (size_t i = 0; i < primitive.vertices.size(); ++i) {
            const Vertex& v = primitive.vertices[i];
            pos_data.push_back(v.x);
            pos_data.push_back(v.y);
            pos_data.push_back(v.z);
            uv_data.push_back(v.u);
            uv_data.push_back(v.v);

            min_x = std::min(min_x, v.x);
            min_y = std::min(min_y, v.y);
            min_z = std::min(min_z, v.z);
            max_x = std::max(max_x, v.x);
            max_y = std::max(max_y, v.y);
            max_z = std::max(max_z, v.z);
        }

        size_t pos_offset = AppendBytes(bin, &pos_data[0], pos_data.size() * sizeof(float), 4);
        size_t uv_offset = AppendBytes(bin, &uv_data[0], uv_data.size() * sizeof(float), 4);
        size_t idx_offset = AppendBytes(bin, &primitive.indices[0], primitive.indices.size() * sizeof(unsigned int), 4);

        int pos_bv = static_cast<int>(buffer_views.size());
        buffer_views.push_back(BufferViewDef{pos_offset, pos_data.size() * sizeof(float), 34962});
        int uv_bv = static_cast<int>(buffer_views.size());
        buffer_views.push_back(BufferViewDef{uv_offset, uv_data.size() * sizeof(float), 34962});
        int idx_bv = static_cast<int>(buffer_views.size());
        buffer_views.push_back(BufferViewDef{idx_offset, primitive.indices.size() * sizeof(unsigned int), 34963});

        int pos_acc = static_cast<int>(accessors.size());
        AccessorDef pos_accessor;
        pos_accessor.buffer_view = pos_bv;
        pos_accessor.byte_offset = 0;
        pos_accessor.component_type = 5126;
        pos_accessor.count = primitive.vertices.size();
        pos_accessor.type = "VEC3";
        pos_accessor.has_min_max = true;
        pos_accessor.min_v[0] = min_x;
        pos_accessor.min_v[1] = min_y;
        pos_accessor.min_v[2] = min_z;
        pos_accessor.max_v[0] = max_x;
        pos_accessor.max_v[1] = max_y;
        pos_accessor.max_v[2] = max_z;
        accessors.push_back(pos_accessor);

        int uv_acc = static_cast<int>(accessors.size());
        AccessorDef uv_accessor;
        uv_accessor.buffer_view = uv_bv;
        uv_accessor.byte_offset = 0;
        uv_accessor.component_type = 5126;
        uv_accessor.count = primitive.vertices.size();
        uv_accessor.type = "VEC2";
        uv_accessor.has_min_max = false;
        accessors.push_back(uv_accessor);

        int idx_acc = static_cast<int>(accessors.size());
        AccessorDef index_accessor;
        index_accessor.buffer_view = idx_bv;
        index_accessor.byte_offset = 0;
        index_accessor.component_type = 5125;
        index_accessor.count = primitive.indices.size();
        index_accessor.type = "SCALAR";
        index_accessor.has_min_max = false;
        accessors.push_back(index_accessor);

        PrimitiveDef primitive_def;
        primitive_def.position_accessor = pos_acc;
        primitive_def.uv_accessor = uv_acc;
        primitive_def.index_accessor = idx_acc;
        primitive_def.material_index = primitive.material_index;
        primitive_defs.push_back(primitive_def);
    }

    if (primitive_defs.empty()) {
        SET_ERROR("No triangle primitives generated");
        return 1;
    }

    for (size_t i = 0; i < mesh.images.size(); ++i) {
        const TextureImage& image = mesh.images[i];
        size_t image_offset = AppendBytes(bin, &image.bytes[0], image.bytes.size(), 4);
        int image_bv = static_cast<int>(buffer_views.size());
        buffer_views.push_back(BufferViewDef{image_offset, image.bytes.size(), 0});
        image_buffer_views[i] = image_bv;
    }

    Align4(bin);

    std::ostringstream json;
    json.precision(7);
    json << "{";
    json << "\"asset\":{\"generator\":\"SKP Converter\",\"version\":\"2.0\"},";
    json << "\"scene\":0,";
    json << "\"scenes\":[{\"nodes\":[0]}],";
    json << "\"nodes\":[{\"mesh\":0}],";

    if (!mesh.images.empty()) {
        json << "\"images\":[";
        for (size_t i = 0; i < mesh.images.size(); ++i) {
            if (i) json << ",";
            json << "{\"bufferView\":" << image_buffer_views[i] << ",\"mimeType\":\"" << mesh.images[i].mime_type << "\"}";
        }
        json << "],";
    }

    if (!mesh.texture_to_image.empty()) {
        json << "\"samplers\":[{\"magFilter\":9729,\"minFilter\":9987,\"wrapS\":10497,\"wrapT\":10497}],";
        json << "\"textures\":[";
        for (size_t i = 0; i < mesh.texture_to_image.size(); ++i) {
            if (i) json << ",";
            json << "{\"sampler\":0,\"source\":" << mesh.texture_to_image[i] << "}";
        }
        json << "],";
    }

    json << "\"materials\":[";
    for (size_t i = 0; i < mesh.materials.size(); ++i) {
        if (i) json << ",";
        const Material& m = mesh.materials[i];
        json << "{";
        json << "\"name\":\"" << JsonEscape(m.name) << "\",";
        json << "\"doubleSided\":false";
        if (m.a < 0.999f) {
            json << ",\"alphaMode\":\"BLEND\"";
        }
        json << ",\"pbrMetallicRoughness\":{";
        json << "\"baseColorFactor\":[" << m.r << "," << m.g << "," << m.b << "," << m.a << "]";
        json << ",\"metallicFactor\":" << Clamp01(m.metallic_factor);
        json << ",\"roughnessFactor\":" << Clamp01(m.roughness_factor);
        if (m.base_color_texture >= 0) {
            json << ",\"baseColorTexture\":{\"index\":" << m.base_color_texture << "}";
        }
        if (m.metallic_roughness_texture >= 0) {
            json << ",\"metallicRoughnessTexture\":{\"index\":" << m.metallic_roughness_texture << "}";
        }
        json << "}";
        if (m.normal_texture >= 0) {
            json << ",\"normalTexture\":{\"index\":" << m.normal_texture;
            if (std::fabs(m.normal_scale - 1.0f) > 1e-4f) {
                json << ",\"scale\":" << m.normal_scale;
            }
            json << "}";
        }
        if (m.occlusion_texture >= 0) {
            json << ",\"occlusionTexture\":{\"index\":" << m.occlusion_texture;
            if (std::fabs(m.occlusion_strength - 1.0f) > 1e-4f) {
                json << ",\"strength\":" << Clamp01(m.occlusion_strength);
            }
            json << "}";
        }
        json << "}";
    }
    json << "],";

    json << "\"meshes\":[{\"primitives\":[";
    for (size_t i = 0; i < primitive_defs.size(); ++i) {
        if (i) json << ",";
        const PrimitiveDef& p = primitive_defs[i];
        json << "{\"attributes\":{\"POSITION\":" << p.position_accessor << ",\"TEXCOORD_0\":" << p.uv_accessor
             << "},\"indices\":" << p.index_accessor << ",\"material\":" << p.material_index << "}";
    }
    json << "]}],";

    json << "\"accessors\":[";
    for (size_t i = 0; i < accessors.size(); ++i) {
        if (i) json << ",";
        const AccessorDef& a = accessors[i];
        json << "{\"bufferView\":" << a.buffer_view
             << ",\"byteOffset\":" << a.byte_offset
             << ",\"componentType\":" << a.component_type
             << ",\"count\":" << a.count
             << ",\"type\":\"" << a.type << "\"";
        if (a.has_min_max) {
            json << ",\"min\":[" << a.min_v[0] << "," << a.min_v[1] << "," << a.min_v[2] << "]";
            json << ",\"max\":[" << a.max_v[0] << "," << a.max_v[1] << "," << a.max_v[2] << "]";
        }
        json << "}";
    }
    json << "],";

    json << "\"bufferViews\":[";
    for (size_t i = 0; i < buffer_views.size(); ++i) {
        if (i) json << ",";
        const BufferViewDef& b = buffer_views[i];
        json << "{\"buffer\":0,\"byteOffset\":" << b.byte_offset << ",\"byteLength\":" << b.byte_length;
        if (b.target != 0) json << ",\"target\":" << b.target;
        json << "}";
    }
    json << "],";

    json << "\"buffers\":[{\"byteLength\":" << bin.size() << "}]";
    json << "}";

    std::string json_str = json.str();
    while ((json_str.size() % 4) != 0) json_str.push_back(' ');

    FILE* fp = NULL;
#ifdef _WIN32
    int wlen = MultiByteToWideChar(CP_UTF8, 0, output_path, -1, NULL, 0);
    std::vector<wchar_t> wpath(static_cast<size_t>(wlen), 0);
    MultiByteToWideChar(CP_UTF8, 0, output_path, -1, &wpath[0], wlen);
    fp = _wfopen(&wpath[0], L"wb");
#else
    fp = std::fopen(output_path, "wb");
#endif
    if (!fp) {
        SET_ERROR("Cannot create output GLB file");
        return 1;
    }

    const unsigned int magic = 0x46546C67;
    const unsigned int version = 2;
    const unsigned int total_length = static_cast<unsigned int>(12 + 8 + json_str.size() + 8 + bin.size());
    const unsigned int json_length = static_cast<unsigned int>(json_str.size());
    const unsigned int json_type = 0x4E4F534A;
    const unsigned int bin_length = static_cast<unsigned int>(bin.size());
    const unsigned int bin_type = 0x004E4942;

    std::fwrite(&magic, 4, 1, fp);
    std::fwrite(&version, 4, 1, fp);
    std::fwrite(&total_length, 4, 1, fp);

    std::fwrite(&json_length, 4, 1, fp);
    std::fwrite(&json_type, 4, 1, fp);
    std::fwrite(json_str.c_str(), 1, json_str.size(), fp);

    std::fwrite(&bin_length, 4, 1, fp);
    std::fwrite(&bin_type, 4, 1, fp);
    if (!bin.empty()) {
        std::fwrite(&bin[0], 1, bin.size(), fp);
    }

    std::fclose(fp);
    return 0;
}

SKP_API int skp_converter_init() {
    SUInitialize();
    return 0;
}

SKP_API void skp_converter_cleanup() {
    SUTerminate();
}

SKP_API int skp_to_glb(const char* input_path, const char* output_path) {
    if (!input_path || !output_path) {
        SET_ERROR("Invalid input arguments");
        return 1;
    }

    SUInitialize();

    SUModelRef model = SU_INVALID;
    if (SUModelCreateFromFile(&model, input_path) != SU_ERROR_NONE || SUIsInvalid(model)) {
        SUTerminate();
        SET_ERROR("Failed to open SKP model");
        return 1;
    }

    SUEntitiesRef entities = SU_INVALID;
    if (SUModelGetEntities(model, &entities) != SU_ERROR_NONE || SUIsInvalid(entities)) {
        SUModelRelease(&model);
        SUTerminate();
        SET_ERROR("Failed to get model entities");
        return 1;
    }

    // SketchUp API geometry coordinates are always inches. Export to meters for glTF.
    MeshData mesh;
    mesh.unit_scale_to_meters = 0.0254;

    SUTransformation export_root_transform;
    const SUTransformation* root_transform_ptr = NULL;
    if (GetModelAxesInverseTransform(model, export_root_transform)) {
        bool is_identity = false;
        if (SUTransformationIsIdentity(&export_root_transform, &is_identity) != SU_ERROR_NONE || !is_identity) {
            root_transform_ptr = &export_root_transform;
        }
    }

    SUTextureWriterRef texture_writer = SU_INVALID;
    if (SUTextureWriterCreate(&texture_writer) == SU_ERROR_NONE && SUIsValid(texture_writer)) {
        LoadTextureWriterEntities(texture_writer, entities);
    }

    TraverseEntities(entities, mesh, root_transform_ptr, SU_INVALID, SU_INVALID, texture_writer);

    int result = WriteGLB(output_path, mesh);

    if (SUIsValid(texture_writer)) {
        SUTextureWriterRelease(&texture_writer);
    }

    SUModelRelease(&model);
    SUTerminate();
    return result;
}

SKP_API const char* skp_get_error() {
    return g_error_message;
}

SKP_API char* skp_get_stats(const char* input_path) {
    if (!input_path) return NULL;

    SUInitialize();

    SUModelRef model = SU_INVALID;
    if (SUModelCreateFromFile(&model, input_path) != SU_ERROR_NONE) {
        SUTerminate();
        return NULL;
    }

    CSUString model_name;
    SUModelGetName(model, model_name);

    SUEntitiesRef entities = SU_INVALID;
    SUModelGetEntities(model, &entities);

    size_t face_count = 0;
    SUEntitiesGetNumFaces(entities, &face_count);

    enum SUModelUnits model_units = SUModelUnits_Inches;
    bool got_units = (SUModelGetUnits(model, &model_units) == SU_ERROR_NONE);

    std::ostringstream json;
    json << "{\"name\":\"" << JsonEscape(model_name.utf8()) << "\"";
    json << ",\"faces\":" << face_count;
    if (got_units) {
        json << ",\"units_enum\":" << static_cast<int>(model_units);
        json << ",\"units_preference\":\"" << ModelUnitsToName(model_units) << "\"";
    } else {
        json << ",\"units_enum\":-1";
        json << ",\"units_preference\":\"unknown\"";
    }
    json << ",\"geometry_native_unit\":\"inch\"";
    json << ",\"applied_scale_to_meter\":0.0254";
    json << "}";

    std::string json_str = json.str();
    char* result = static_cast<char*>(std::malloc(json_str.size() + 1));
    if (result) std::strcpy(result, json_str.c_str());

    SUModelRelease(&model);
    SUTerminate();
    return result;
}

SKP_API void skp_free_string(char* str) {
    if (str) std::free(str);
}

