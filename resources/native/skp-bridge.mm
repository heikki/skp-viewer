#include <SketchUpAPI/initialize.h>
#include <SketchUpAPI/model/model.h>
#include <SketchUpAPI/model/entities.h>
#include <SketchUpAPI/model/face.h>
#include <SketchUpAPI/model/edge.h>
#include <SketchUpAPI/model/vertex.h>
#include <SketchUpAPI/model/mesh_helper.h>
#include <SketchUpAPI/model/material.h>
#include <SketchUpAPI/model/texture.h>
#include <SketchUpAPI/model/component_definition.h>
#include <SketchUpAPI/model/component_instance.h>
#include <SketchUpAPI/model/group.h>
#include <SketchUpAPI/model/drawing_element.h>
#include <SketchUpAPI/model/layer.h>
#include <SketchUpAPI/geometry.h>
#include <SketchUpAPI/transformation.h>
#include <SketchUpAPI/unicodestring.h>

#include <cstdio>
#include <cstring>
#include <string>
#include <vector>
#include <sstream>
#include <set>
#include <cmath>
#include <Foundation/Foundation.h>

// Inches to meters conversion
static const double INCHES_TO_METERS = 0.0254;

// Helper to multiply 4x4 column-major transforms
static void multiplyTransforms(const double a[16], const double b[16], double out[16]) {
    for (int col = 0; col < 4; col++) {
        for (int row = 0; row < 4; row++) {
            out[col * 4 + row] =
                a[0 * 4 + row] * b[col * 4 + 0] +
                a[1 * 4 + row] * b[col * 4 + 1] +
                a[2 * 4 + row] * b[col * 4 + 2] +
                a[3 * 4 + row] * b[col * 4 + 3];
        }
    }
}

// Transform a point by a 4x4 column-major matrix
static void transformPoint(const double m[16], double x, double y, double z,
                           double& ox, double& oy, double& oz) {
    ox = m[0] * x + m[4] * y + m[8]  * z + m[12];
    oy = m[1] * x + m[5] * y + m[9]  * z + m[13];
    oz = m[2] * x + m[6] * y + m[10] * z + m[14];
}

// Transform a normal (no translation, needs inverse transpose for non-uniform scale,
// but for typical SketchUp models uniform scale is fine)
static void transformNormal(const double m[16], double x, double y, double z,
                            double& ox, double& oy, double& oz) {
    ox = m[0] * x + m[4] * y + m[8]  * z;
    oy = m[1] * x + m[5] * y + m[9]  * z;
    oz = m[2] * x + m[6] * y + m[10] * z;
    double len = sqrt(ox * ox + oy * oy + oz * oz);
    if (len > 1e-10) { ox /= len; oy /= len; oz /= len; }
}

// JSON string escaping
static std::string jsonEscape(const std::string& s) {
    std::string out;
    for (char c : s) {
        switch (c) {
            case '"':  out += "\\\""; break;
            case '\\': out += "\\\\"; break;
            case '\n': out += "\\n"; break;
            case '\r': out += "\\r"; break;
            case '\t': out += "\\t"; break;
            default: out += c;
        }
    }
    return out;
}

// Get SU string as std::string
static std::string getString(SUStringRef ref) {
    size_t len = 0;
    SUStringGetUTF8Length(ref, &len);
    std::string str(len, '\0');
    SUStringGetUTF8(ref, len + 1, &str[0], &len);
    return str;
}

struct MeshData {
    std::vector<float> positions;
    std::vector<float> normals;
    std::vector<unsigned int> indices;
    std::vector<float> uvs;
    float color[4]; // r, g, b, a (0-1)
    bool hasColor;
    std::string textureName;
    std::string layerName;
    std::string groupName; // top-level group this mesh belongs to
};

static std::vector<MeshData> g_meshes;

// Get layer name from a drawing element
static std::string getLayerName(SUDrawingElementRef drawingElement) {
    SULayerRef layer = SU_INVALID;
    if (SUDrawingElementGetLayer(drawingElement, &layer) == SU_ERROR_NONE) {
        SUStringRef name = SU_INVALID;
        SUStringCreate(&name);
        SULayerGetName(layer, &name);
        std::string result = getString(name);
        SUStringRelease(&name);
        return result;
    }
    return "Default";
}

static std::string g_currentLayer;
static std::string g_currentGroup; // top-level group name for toggling

static void processFace(SUFaceRef face, const double transform[16]) {
    SUMeshHelperRef mesh = SU_INVALID;
    if (SUMeshHelperCreate(&mesh, face) != SU_ERROR_NONE) return;

    size_t numVertices = 0, numTriangles = 0;
    SUMeshHelperGetNumVertices(mesh, &numVertices);
    SUMeshHelperGetNumTriangles(mesh, &numTriangles);

    if (numVertices == 0 || numTriangles == 0) {
        SUMeshHelperRelease(&mesh);
        return;
    }

    std::vector<SUPoint3D> vertices(numVertices);
    std::vector<SUVector3D> normalsArr(numVertices);
    std::vector<SUPoint3D> frontStq(numVertices);
    std::vector<size_t> indicesArr(numTriangles * 3);

    size_t count = 0;
    SUMeshHelperGetVertices(mesh, numVertices, vertices.data(), &count);
    SUMeshHelperGetNormals(mesh, numVertices, normalsArr.data(), &count);
    SUMeshHelperGetFrontSTQCoords(mesh, numVertices, frontStq.data(), &count);
    SUMeshHelperGetVertexIndices(mesh, numTriangles * 3, indicesArr.data(), &count);

    MeshData md;
    md.hasColor = false;
    md.color[0] = md.color[1] = md.color[2] = 0.8f;
    md.color[3] = 1.0f;

    // Get layer — use face's own layer if non-default, else inherit from group/component
    SUDrawingElementRef faceDE = SUFaceToDrawingElement(face);
    std::string faceLayer = getLayerName(faceDE);
    if (faceLayer != "Layer0" && faceLayer != "Untagged") {
        md.layerName = faceLayer;
    } else if (!g_currentLayer.empty() && g_currentLayer != "Layer0" && g_currentLayer != "Untagged") {
        md.layerName = g_currentLayer;
    } else {
        md.layerName = faceLayer; // Keep actual name (Layer0 or Untagged)
    }

    md.groupName = g_currentGroup.empty() ? "(ungrouped)" : g_currentGroup;

    // Get front material
    SUMaterialRef material = SU_INVALID;
    if (SUFaceGetFrontMaterial(face, &material) == SU_ERROR_NONE) {
        SUColor color = {};
        if (SUMaterialGetColor(material, &color) == SU_ERROR_NONE) {
            md.color[0] = color.red / 255.0f;
            md.color[1] = color.green / 255.0f;
            md.color[2] = color.blue / 255.0f;
            md.color[3] = color.alpha / 255.0f;
            md.hasColor = true;
        }

        double opacity = 1.0;
        if (SUMaterialGetOpacity(material, &opacity) == SU_ERROR_NONE) {
            md.color[3] = (float)opacity;
        }

        SUTextureRef texture = SU_INVALID;
        if (SUMaterialGetTexture(material, &texture) == SU_ERROR_NONE) {
            SUStringRef texName = SU_INVALID;
            SUStringCreate(&texName);
            SUTextureGetFileName(texture, &texName);
            md.textureName = getString(texName);
            SUStringRelease(&texName);
        }
    }

    // Build vertex data with transform applied
    md.positions.resize(numVertices * 3);
    md.normals.resize(numVertices * 3);
    md.uvs.resize(numVertices * 2);

    for (size_t i = 0; i < numVertices; i++) {
        double ox, oy, oz;
        // Convert inches to meters and apply transform
        double px = vertices[i].x * INCHES_TO_METERS;
        double py = vertices[i].y * INCHES_TO_METERS;
        double pz = vertices[i].z * INCHES_TO_METERS;
        transformPoint(transform, px, py, pz, ox, oy, oz);
        md.positions[i * 3 + 0] = (float)ox;
        md.positions[i * 3 + 1] = (float)oz; // Y-up for Three.js (SKP is Z-up)
        md.positions[i * 3 + 2] = (float)(-oy); // Flip for right-hand coords

        double nx, ny, nz;
        transformNormal(transform, normalsArr[i].x, normalsArr[i].y, normalsArr[i].z,
                        nx, ny, nz);
        md.normals[i * 3 + 0] = (float)nx;
        md.normals[i * 3 + 1] = (float)nz;
        md.normals[i * 3 + 2] = (float)(-ny);

        // STQ to UV
        double q = frontStq[i].z;
        md.uvs[i * 2 + 0] = (q != 0.0) ? (float)(frontStq[i].x / q) : 0.0f;
        md.uvs[i * 2 + 1] = (q != 0.0) ? (float)(frontStq[i].y / q) : 0.0f;
    }

    md.indices.resize(numTriangles * 3);
    for (size_t i = 0; i < numTriangles * 3; i++) {
        md.indices[i] = (unsigned int)indicesArr[i];
    }

    g_meshes.push_back(std::move(md));
    SUMeshHelperRelease(&mesh);
}

static void processEntities(SUEntitiesRef entities, const double transform[16], bool isRoot = false);

static void processEntities(SUEntitiesRef entities, const double transform[16], bool isRoot) {
    std::string savedLayer = g_currentLayer;

    // Faces
    size_t numFaces = 0;
    SUEntitiesGetNumFaces(entities, &numFaces);
    if (numFaces > 0) {
        std::vector<SUFaceRef> faces(numFaces);
        SUEntitiesGetFaces(entities, numFaces, faces.data(), &numFaces);
        for (size_t i = 0; i < numFaces; i++) {
            processFace(faces[i], transform);
        }
    }

    // Groups
    size_t numGroups = 0;
    SUEntitiesGetNumGroups(entities, &numGroups);
    if (numGroups > 0) {
        std::vector<SUGroupRef> groups(numGroups);
        SUEntitiesGetGroups(entities, numGroups, groups.data(), &numGroups);
        for (size_t i = 0; i < numGroups; i++) {
            // Get group's layer
            SUDrawingElementRef groupDE = SUGroupToDrawingElement(groups[i]);
            std::string groupLayer = getLayerName(groupDE);
            if (groupLayer != "Layer0" && groupLayer != "Untagged") {
                g_currentLayer = groupLayer;
            }

            // Track top-level group name for toggle panel
            std::string savedGroup = g_currentGroup;
            if (isRoot) {
                SUStringRef gname = SU_INVALID;
                SUStringCreate(&gname);
                SUGroupGetName(groups[i], &gname);
                std::string name = getString(gname);
                SUStringRelease(&gname);
                if (!name.empty()) {
                    g_currentGroup = name;
                }
            }

            SUTransformation groupTransform;
            SUGroupGetTransform(groups[i], &groupTransform);

            double scaledTransform[16];
            memcpy(scaledTransform, groupTransform.values, sizeof(double) * 16);
            scaledTransform[12] *= INCHES_TO_METERS;
            scaledTransform[13] *= INCHES_TO_METERS;
            scaledTransform[14] *= INCHES_TO_METERS;

            double combined[16];
            multiplyTransforms(transform, scaledTransform, combined);

            SUEntitiesRef groupEntities = SU_INVALID;
            SUGroupGetEntities(groups[i], &groupEntities);
            processEntities(groupEntities, combined);

            g_currentLayer = savedLayer;
            g_currentGroup = savedGroup;
        }
    }

    // Component instances
    size_t numInstances = 0;
    SUEntitiesGetNumInstances(entities, &numInstances);
    if (numInstances > 0) {
        std::vector<SUComponentInstanceRef> instances(numInstances);
        SUEntitiesGetInstances(entities, numInstances, instances.data(), &numInstances);
        for (size_t i = 0; i < numInstances; i++) {
            // Get instance's layer
            SUDrawingElementRef instDE = SUComponentInstanceToDrawingElement(instances[i]);
            std::string instLayer = getLayerName(instDE);
            if (instLayer != "Layer0" && instLayer != "Untagged") {
                g_currentLayer = instLayer;
            }

            SUTransformation instTransform;
            SUComponentInstanceGetTransform(instances[i], &instTransform);

            double scaledTransform[16];
            memcpy(scaledTransform, instTransform.values, sizeof(double) * 16);
            scaledTransform[12] *= INCHES_TO_METERS;
            scaledTransform[13] *= INCHES_TO_METERS;
            scaledTransform[14] *= INCHES_TO_METERS;

            double combined[16];
            multiplyTransforms(transform, scaledTransform, combined);

            SUComponentDefinitionRef definition = SU_INVALID;
            SUComponentInstanceGetDefinition(instances[i], &definition);

            SUEntitiesRef defEntities = SU_INVALID;
            SUComponentDefinitionGetEntities(definition, &defEntities);
            processEntities(defEntities, combined);

            g_currentLayer = savedLayer;
        }
    }
}

// Build JSON output from collected meshes
static std::string buildJson() {
    std::ostringstream ss;
    ss << "{\"meshes\":[";

    for (size_t m = 0; m < g_meshes.size(); m++) {
        if (m > 0) ss << ",";
        const MeshData& md = g_meshes[m];

        ss << "{\"positions\":[";
        for (size_t i = 0; i < md.positions.size(); i++) {
            if (i > 0) ss << ",";
            ss << md.positions[i];
        }

        ss << "],\"normals\":[";
        for (size_t i = 0; i < md.normals.size(); i++) {
            if (i > 0) ss << ",";
            ss << md.normals[i];
        }

        ss << "],\"indices\":[";
        for (size_t i = 0; i < md.indices.size(); i++) {
            if (i > 0) ss << ",";
            ss << md.indices[i];
        }

        ss << "],\"uvs\":[";
        for (size_t i = 0; i < md.uvs.size(); i++) {
            if (i > 0) ss << ",";
            ss << md.uvs[i];
        }

        ss << "],\"color\":[" << md.color[0] << "," << md.color[1] << ","
           << md.color[2] << "," << md.color[3] << "]";

        if (!md.textureName.empty()) {
            ss << ",\"texture\":\"" << jsonEscape(md.textureName) << "\"";
        }

        ss << ",\"layer\":\"" << jsonEscape(md.layerName) << "\"";
        ss << ",\"group\":\"" << jsonEscape(md.groupName) << "\"";

        ss << "}";
    }

    ss << "],\"meshCount\":" << g_meshes.size();

    size_t totalVerts = 0, totalTris = 0;
    std::set<std::string> layerSet;
    std::set<std::string> groupSet;
    for (const auto& md : g_meshes) {
        totalVerts += md.positions.size() / 3;
        totalTris += md.indices.size() / 3;
        layerSet.insert(md.layerName);
        groupSet.insert(md.groupName);
    }
    ss << ",\"vertexCount\":" << totalVerts;
    ss << ",\"triangleCount\":" << totalTris;

    ss << ",\"layers\":[";
    bool firstLayer = true;
    for (const auto& name : layerSet) {
        if (!firstLayer) ss << ",";
        ss << "\"" << jsonEscape(name) << "\"";
        firstLayer = false;
    }
    ss << "]";

    ss << ",\"groups\":[";
    bool firstGroup = true;
    for (const auto& name : groupSet) {
        if (!firstGroup) ss << ",";
        ss << "\"" << jsonEscape(name) << "\"";
        firstGroup = false;
    }
    ss << "]";

    ss << "}";

    return ss.str();
}

extern "C" {

// Returns: 0 = success, 1 = file open error, 2 = buffer too small
// outLen receives actual JSON length needed (including null terminator)
int readSkpFile(const char* path, char* outBuf, int bufLen, int* outLen) {
    @autoreleasepool {
        SUInitialize();

        SUModelRef model = SU_INVALID;
        SUModelLoadStatus status;
        SUResult res = SUModelCreateFromFileWithStatus(&model, path, &status);

        if (res != SU_ERROR_NONE) {
            SUTerminate();
            return 1;
        }

        g_meshes.clear();
        g_currentLayer = "Default";
        g_currentGroup = "";

        // Identity transform (already scaled since we convert in processFace)
        double identity[16] = {0};
        identity[0] = identity[5] = identity[10] = identity[15] = 1.0;

        SUEntitiesRef entities = SU_INVALID;
        SUModelGetEntities(model, &entities);
        processEntities(entities, identity, true);

        std::string json = buildJson();
        g_meshes.clear();

        SUModelRelease(&model);
        SUTerminate();

        int needed = (int)json.size() + 1;
        if (outLen) *outLen = needed;

        if (bufLen < needed) {
            return 2; // Buffer too small
        }

        memcpy(outBuf, json.c_str(), json.size() + 1);
        return 0;
    }
}

// Returns the required buffer size for a given SKP file
int getSkpJsonSize(const char* path) {
    @autoreleasepool {
        SUInitialize();

        SUModelRef model = SU_INVALID;
        SUModelLoadStatus status;
        SUResult res = SUModelCreateFromFileWithStatus(&model, path, &status);

        if (res != SU_ERROR_NONE) {
            SUTerminate();
            return -1;
        }

        g_meshes.clear();
        g_currentLayer = "Default";
        g_currentGroup = "";

        double identity[16] = {0};
        identity[0] = identity[5] = identity[10] = identity[15] = 1.0;

        SUEntitiesRef entities = SU_INVALID;
        SUModelGetEntities(model, &entities);
        processEntities(entities, identity, true);

        std::string json = buildJson();
        int size = (int)json.size() + 1;

        g_meshes.clear();
        SUModelRelease(&model);
        SUTerminate();

        return size;
    }
}

} // extern "C"
