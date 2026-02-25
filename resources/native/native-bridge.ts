import { dirname, resolve } from 'node:path';
import { dlopen, FFIType, ptr, read } from 'bun:ffi';

function findDylib(): string {
  const candidates = [
    resolve(import.meta.dir, 'libskpviewer.dylib'),
    resolve(import.meta.dir, '../../resources/native/libskpviewer.dylib'),
    resolve(dirname(process.execPath), '../Resources/app/libskpviewer.dylib'),
    resolve(
      dirname(process.execPath),
      '../../../../../resources/native/libskpviewer.dylib'
    )
  ];

  for (const path of candidates) {
    if (Bun.file(path).size > 0) return path;
  }

  throw new Error(
    `libskpviewer.dylib not found. Searched:\n${candidates.join('\n')}`
  );
}

const lib = dlopen(findDylib(), {
  readSkpFile: {
    args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr],
    returns: FFIType.i32
  },
  getSkpJsonSize: {
    args: [FFIType.ptr],
    returns: FFIType.i32
  }
});

function toCString(s: string): Uint8Array {
  return new TextEncoder().encode(`${s}\0`);
}

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

export function readSkpFile(filePath: string): SkpModelData {
  const pathBuf = toCString(filePath);

  // First get required buffer size
  const size = lib.symbols.getSkpJsonSize(ptr(pathBuf));
  if (size < 0) {
    throw new Error(`Failed to read SKP file: ${filePath}`);
  }

  // Allocate buffer and read
  const outBuf = new Uint8Array(size);
  const outLenBuf = new Int32Array(1);
  const result = lib.symbols.readSkpFile(
    ptr(pathBuf),
    ptr(outBuf),
    size,
    ptr(new Uint8Array(outLenBuf.buffer))
  );

  if (result === 1) {
    throw new Error(`Failed to open SKP file: ${filePath}`);
  }
  if (result === 2) {
    throw new Error(`Buffer too small for SKP file: ${filePath}`);
  }

  const jsonStr = new TextDecoder().decode(
    outBuf.subarray(0, outBuf.indexOf(0))
  );
  return JSON.parse(jsonStr) as SkpModelData;
}
