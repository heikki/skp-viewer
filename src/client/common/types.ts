export interface SkpMesh {
  positions: number[];
  normals: number[];
  indices: number[];
  uvs: number[];
  color: [number, number, number, number];
  texture?: string;
}

export interface SkpModelData {
  meshes: SkpMesh[];
  meshCount: number;
  vertexCount: number;
  triangleCount: number;
}
