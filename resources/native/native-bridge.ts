import { dirname, resolve } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dlopen, FFIType, ptr } from 'bun:ffi';
import type { SkpModelData } from '../../src/client/common/types';

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
    args: [FFIType.ptr, FFIType.ptr, FFIType.i32, FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32
  },
  getSkpJsonSize: {
    args: [FFIType.ptr, FFIType.ptr],
    returns: FFIType.i32
  }
});

function toCString(s: string): Uint8Array {
  return new TextEncoder().encode(`${s}\0`);
}

// Track current texture directory for serving
let currentTextureDir = '';

export function getTextureDir(): string {
  return currentTextureDir;
}

export function readSkpFile(filePath: string): SkpModelData {
  const pathBuf = toCString(filePath);

  // Create a temp directory for textures
  const texDir = mkdtempSync(join(tmpdir(), 'skp-textures-'));
  const texDirBuf = toCString(texDir);

  // First get required buffer size (this also writes textures)
  const size = lib.symbols.getSkpJsonSize(ptr(pathBuf), ptr(texDirBuf));
  if (size < 0) {
    throw new Error(`Failed to read SKP file: ${filePath}`);
  }

  // Allocate buffer and read (textures already written by getSkpJsonSize,
  // but readSkpFile will overwrite them — same result)
  const outBuf = new Uint8Array(size);
  const outLenBuf = new Int32Array(1);
  const result = lib.symbols.readSkpFile(
    ptr(pathBuf),
    ptr(outBuf),
    size,
    ptr(new Uint8Array(outLenBuf.buffer)),
    ptr(texDirBuf)
  );

  if (result === 1) {
    throw new Error(`Failed to open SKP file: ${filePath}`);
  }
  if (result === 2) {
    throw new Error(`Buffer too small for SKP file: ${filePath}`);
  }

  currentTextureDir = texDir;

  const jsonStr = new TextDecoder().decode(
    outBuf.subarray(0, outBuf.indexOf(0))
  );
  return JSON.parse(jsonStr) as SkpModelData;
}
