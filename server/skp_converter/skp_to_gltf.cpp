// SKP to GLB Converter using SketchUp C API
// With Material Support - Merged by material

#include "skp_to_gltf.h"
#include <SketchUpAPI/sketchup.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <vector>
#include <string>
#include <sstream>
#include <cstring>
#include <map>

#ifdef _WIN32
#include <windows.h>
#endif

static char g_error_message[1024] = {0};
#define SET_ERROR(msg) strncpy(g_error_message, msg, sizeof(g_error_message) - 1)

struct Material {
    std::string name;
    float r, g, b, a;
    Material() : r(0.8f), g(0.8f), b(0.8f), a(1.0f), name("Default") {}
};

struct Vertex {
    float x, y, z;
    float u, v;
};

struct MeshData {
    std::vector<Material> materials;
    std::map<int, std::vector<Vertex>> matVertices;  // material index -> vertices
    std::map<int, std::vector<unsigned int>> matIndices;  // material index -> indices
};

class CSUString {
public:
    CSUString() { SUSetInvalid(su_str_); SUStringCreate(&su_str_); }
    ~CSUString() { SUStringRelease(&su_str_); }
    operator SUStringRef*() { return &su_str_; }
    std::string utf8() {
        size_t length;
        SUStringGetUTF8Length(su_str_, &length);
        std::string str(length + 1, '\0');
        size_t returned_length;
        SUStringGetUTF8(su_str_, length + 1, &str[0], &returned_length);
        str.resize(returned_length);
        return str;
    }
private:
    SUStringRef su_str_;
    CSUString(const CSUString&);
    CSUString& operator=(const CSUString&);
};

SKP_API int skp_converter_init() {
    SUInitialize();
    return 0;
}

SKP_API void skp_converter_cleanup() {
    SUTerminate();
}

static void TransformPoint(const SUTransformation& t, const SUPoint3D& in, float& x, float& y, float& z) {
    double sx = in.x * t.values[0] + in.y * t.values[4] + in.z * t.values[8] + t.values[12];
    double sy = in.x * t.values[1] + in.y * t.values[5] + in.z * t.values[9] + t.values[13];
    double sz = in.x * t.values[2] + in.y * t.values[6] + in.z * t.values[10] + t.values[14];
    double w = in.x * t.values[3] + in.y * t.values[7] + in.z * t.values[11] + t.values[15];
    if (w != 0.0 && w != 1.0) { sx /= w; sy /= w; sz /= w; }
    x = (float)sx; y = (float)sz; z = -(float)sy;
}

static int GetMaterialIndex(SUFaceRef face, MeshData& mesh) {
    SUMaterialRef mat = SU_INVALID;
    if (SUFaceGetFrontMaterial(face, &mat) != SU_ERROR_NONE || SUIsInvalid(mat)) {
        return 0;
    }
    
    CSUString name;
    SUMaterialGetName(mat, name);
    std::string matName = name.utf8();
    
    for (size_t i = 0; i < mesh.materials.size(); i++) {
        if (mesh.materials[i].name == matName) return (int)i;
    }
    
    Material m;
    m.name = matName;
    SUColor c;
    if (SUMaterialGetColor(mat, &c) == SU_ERROR_NONE) {
        m.r = c.red / 255.0f;
        m.g = c.green / 255.0f;
        m.b = c.blue / 255.0f;
        m.a = c.alpha / 255.0f;
    }
    mesh.materials.push_back(m);
    return (int)mesh.materials.size() - 1;
}

static void ProcessFace(SUFaceRef face, MeshData& mesh, const SUTransformation* transform) {
    SUMeshHelperRef helper = SU_INVALID;
    SUMeshHelperCreate(&helper, face);
    if (SUIsInvalid(helper)) return;
    
    size_t vcount = 0;
    SUMeshHelperGetNumVertices(helper, &vcount);
    if (vcount == 0) { SUMeshHelperRelease(&helper); return; }
    
    int matIdx = GetMaterialIndex(face, mesh);
    
    std::vector<SUPoint3D> positions(vcount);
    SUMeshHelperGetVertices(helper, vcount, &positions[0], &vcount);
    
    size_t uvcount = 0;
    std::vector<SUPoint3D> uvs;
    SUMeshHelperGetFrontSTQCoords(helper, vcount, nullptr, &uvcount);
    if (uvcount > 0) {
        uvs.resize(uvcount);
        SUMeshHelperGetFrontSTQCoords(helper, uvcount, &uvs[0], &uvcount);
    }
    
    size_t tcount = 0;
    SUMeshHelperGetNumTriangles(helper, &tcount);
    if (tcount == 0) { SUMeshHelperRelease(&helper); return; }
    
    std::vector<size_t> triIndices(tcount * 3);
    size_t icount = 0;
    SUMeshHelperGetVertexIndices(helper, tcount * 3, &triIndices[0], &icount);
    
    auto& verts = mesh.matVertices[matIdx];
    auto& indices = mesh.matIndices[matIdx];
    size_t baseIdx = verts.size();
    
    for (size_t i = 0; i < vcount; i++) {
        Vertex v;
        if (transform) {
            TransformPoint(*transform, positions[i], v.x, v.y, v.z);
        } else {
            v.x = (float)positions[i].x;
            v.y = (float)positions[i].z;
            v.z = -(float)positions[i].y;
        }
        v.u = (i < uvs.size()) ? (float)uvs[i].x : 0;
        v.v = (i < uvs.size()) ? (float)uvs[i].y : 0;
        verts.push_back(v);
    }
    
    for (size_t i = 0; i < icount && i < triIndices.size(); i++) {
        indices.push_back((unsigned int)(baseIdx + triIndices[i]));
    }
    
    SUMeshHelperRelease(&helper);
}

static void TraverseEntities(SUEntitiesRef entities, MeshData& mesh, const SUTransformation* parent) {
    size_t fcount = 0;
    SUEntitiesGetNumFaces(entities, &fcount);
    if (fcount > 0) {
        std::vector<SUFaceRef> faces(fcount);
        SUEntitiesGetFaces(entities, fcount, &faces[0], &fcount);
        for (size_t i = 0; i < fcount; i++) ProcessFace(faces[i], mesh, parent);
    }
    
    size_t icount = 0;
    SUEntitiesGetNumInstances(entities, &icount);
    if (icount > 0) {
        std::vector<SUComponentInstanceRef> instances(icount);
        SUEntitiesGetInstances(entities, icount, &instances[0], &icount);
        for (size_t i = 0; i < icount; i++) {
            SUTransformation t, combined;
            SUComponentInstanceGetTransform(instances[i], &t);
            if (parent) SUTransformationMultiply(parent, &t, &combined);
            else combined = t;
            
            SUComponentDefinitionRef def;
            SUComponentInstanceGetDefinition(instances[i], &def);
            SUEntitiesRef ent;
            SUComponentDefinitionGetEntities(def, &ent);
            TraverseEntities(ent, mesh, &combined);
        }
    }
    
    size_t gcount = 0;
    SUEntitiesGetNumGroups(entities, &gcount);
    if (gcount > 0) {
        std::vector<SUGroupRef> groups(gcount);
        SUEntitiesGetGroups(entities, gcount, &groups[0], &gcount);
        for (size_t i = 0; i < gcount; i++) {
            SUTransformation t, combined;
            SUGroupGetTransform(groups[i], &t);
            if (parent) SUTransformationMultiply(parent, &t, &combined);
            else combined = t;
            
            SUEntitiesRef ent;
            SUGroupGetEntities(groups[i], &ent);
            TraverseEntities(ent, mesh, &combined);
        }
    }
}

static int WriteGLB(const char* path, MeshData& mesh) {
    if (mesh.materials.empty()) {
        Material m;
        mesh.materials.push_back(m);
    }
    
    // Build buffer data
    std::vector<float> positions;
    std::vector<float> uvs;
    std::vector<unsigned int> allIndices;
    std::vector<std::pair<size_t, size_t>> matOffsets;  // (vertexOffset, indexOffset) per material
    
    for (auto& kv : mesh.matVertices) {
        int matIdx = kv.first;
        auto& verts = kv.second;
        auto& indices = mesh.matIndices[matIdx];
        
        size_t vOffset = positions.size() / 3;
        size_t iOffset = allIndices.size();
        matOffsets.push_back({vOffset, iOffset});
        
        for (auto& v : verts) {
            positions.push_back(v.x);
            positions.push_back(v.y);
            positions.push_back(v.z);
            uvs.push_back(v.u);
            uvs.push_back(v.v);
        }
        for (auto idx : indices) {
            allIndices.push_back((unsigned int)(vOffset + idx));
        }
    }
    
    size_t posLen = positions.size() * sizeof(float);
    size_t uvLen = uvs.size() * sizeof(float);
    size_t idxLen = allIndices.size() * sizeof(unsigned int);
    size_t bufSize = posLen + uvLen + idxLen;
    while (bufSize % 4) bufSize++;
    
    // Build JSON
    std::ostringstream json;
    json << "{";
    json << "\"asset\":{\"generator\":\"SKP\",\"version\":\"2.0\"},";
    // Y-up to Z-up matrix: rotate -90 deg around X axis
    // [1,0,0,0, 0,0,1,0, 0,-1,0,0, 0,0,0,1]
    json << "\"scene\":0,\"scenes\":[{\"nodes\":[0]}],\"nodes\":[{\"mesh\":0}],";
    
    // Materials
    json << "\"materials\":[";
    for (size_t i = 0; i < mesh.materials.size(); i++) {
        if (i) json << ",";
        auto& m = mesh.materials[i];
        json << "{\"name\":\"" << m.name << "\",\"doubleSided\":true,";
        json << "\"pbrMetallicRoughness\":{\"baseColorFactor\":[";
        json << m.r << "," << m.g << "," << m.b << "," << m.a << "],";
        json << "\"metallicFactor\":0,\"roughnessFactor\":0.5}}";
    }
    json << "],";
    
    // Mesh with primitives
    json << "\"meshes\":[{\"primitives\":[";
    size_t pidx = 0;
    for (auto& kv : mesh.matVertices) {
        if (pidx) json << ",";
        int matIdx = kv.first;
        json << "{\"attributes\":{\"POSITION\":0,\"TEXCOORD_0\":1},\"indices\":" << (2 + pidx);
        json << ",\"material\":" << matIdx << "}";
        pidx++;
    }
    json << "]}],";
    
    // Accessors
    json << "\"accessors\":[";
    json << "{\"bufferView\":0,\"componentType\":5126,\"count\":" << (positions.size()/3);
    json << ",\"type\":\"VEC3\",\"max\":[1000,1000,1000],\"min\":[-1000,-1000,-1000]},";
    json << "{\"bufferView\":1,\"componentType\":5126,\"count\":" << (uvs.size()/2) << ",\"type\":\"VEC2\"}";
    
    pidx = 0;
    for (auto& kv : mesh.matVertices) {
        int matIdx = kv.first;
        auto& indices = mesh.matIndices[matIdx];
        json << ",{\"bufferView\":2,\"byteOffset\":" << (matOffsets[pidx].second * sizeof(unsigned int));
        json << ",\"componentType\":5125,\"count\":" << indices.size() << ",\"type\":\"SCALAR\"}";
        pidx++;
    }
    json << "],";
    
    // Buffer views
    json << "\"bufferViews\":[";
    json << "{\"buffer\":0,\"byteOffset\":0,\"byteLength\":" << posLen << "},";  // pos
    json << "{\"buffer\":0,\"byteOffset\":" << posLen << ",\"byteLength\":" << uvLen << "},";  // uv
    json << "{\"buffer\":0,\"byteOffset\":" << (posLen + uvLen) << ",\"byteLength\":" << idxLen << "}";  // idx
    json << "],";
    
    json << "\"buffers\":[{\"byteLength\":" << bufSize << "}]";
    json << "}";
    
    std::string jsonStr = json.str();
    while (jsonStr.length() % 4) jsonStr += " ";
    
    // Write file
    FILE* fp = nullptr;
#ifdef _WIN32
    int wlen = MultiByteToWideChar(CP_UTF8, 0, path, -1, nullptr, 0);
    std::vector<wchar_t> wpath(wlen);
    MultiByteToWideChar(CP_UTF8, 0, path, -1, wpath.data(), wlen);
    fp = _wfopen(wpath.data(), L"wb");
#else
    fp = fopen(path, "wb");
#endif
    if (!fp) { SET_ERROR("Cannot create file"); return 1; }
    
    unsigned int magic = 0x46546C67, ver = 2;
    unsigned int totalLen = 12 + 8 + (unsigned int)jsonStr.length() + 8 + (unsigned int)bufSize;
    
    fwrite(&magic, 4, 1, fp);
    fwrite(&ver, 4, 1, fp);
    fwrite(&totalLen, 4, 1, fp);
    
    unsigned int jsonLen = (unsigned int)jsonStr.length();
    fwrite(&jsonLen, 4, 1, fp);
    unsigned int jsonType = 0x4E4F534A;
    fwrite(&jsonType, 4, 1, fp);
    fwrite(jsonStr.c_str(), jsonStr.length(), 1, fp);
    
    unsigned int binLen = (unsigned int)bufSize;
    fwrite(&binLen, 4, 1, fp);
    unsigned int binType = 0x004E4942;
    fwrite(&binType, 4, 1, fp);
    
    fwrite(positions.data(), posLen, 1, fp);
    fwrite(uvs.data(), uvLen, 1, fp);
    fwrite(allIndices.data(), idxLen, 1, fp);
    
    char pad[4] = {0};
    size_t padSize = bufSize - posLen - uvLen - idxLen;
    if (padSize > 0) fwrite(pad, padSize, 1, fp);
    
    fclose(fp);
    return 0;
}

SKP_API int skp_to_glb(const char* input, const char* output) {
    if (!input || !output) { SET_ERROR("Invalid args"); return 1; }
    
    SUInitialize();
    SUModelRef model = SU_INVALID;
    if (SUModelCreateFromFile(&model, input) != SU_ERROR_NONE) {
        SUTerminate();
        SET_ERROR("Failed to open SKP");
        return 1;
    }
    
    SUEntitiesRef entities;
    SUModelGetEntities(model, &entities);
    
    MeshData mesh;
    TraverseEntities(entities, mesh, nullptr);
    
    int ret = WriteGLB(output, mesh);
    
    SUModelRelease(&model);
    SUTerminate();
    return ret;
}

SKP_API const char* skp_get_error() { return g_error_message; }

SKP_API char* skp_get_stats(const char* input) {
    if (!input) return nullptr;
    SUInitialize();
    SUModelRef model = SU_INVALID;
    if (SUModelCreateFromFile(&model, input) != SU_ERROR_NONE) {
        SUTerminate();
        return nullptr;
    }
    CSUString name;
    SUModelGetName(model, name);
    SUEntitiesRef entities;
    SUModelGetEntities(model, &entities);
    size_t fcount = 0;
    SUEntitiesGetNumFaces(entities, &fcount);
    std::string json = "{\"name\":\"" + name.utf8() + "\",\"faces\":" + std::to_string(fcount) + "}";
    char* result = (char*)malloc(json.length() + 1);
    strcpy(result, json.c_str());
    SUModelRelease(&model);
    SUTerminate();
    return result;
}

SKP_API void skp_free_string(char* str) { if (str) free(str); }
// Force rebuild
