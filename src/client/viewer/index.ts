import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { SkpModelData } from '@common/types';

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let modelGroup: THREE.Group;
let wireframeMode = false;

// Group toggle: each top-level group gets its own THREE.Group
const groupObjects = new Map<string, THREE.Group>();

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map<string, THREE.Texture>();

export function initViewer(container: HTMLElement) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  camera = new THREE.PerspectiveCamera(
    60,
    container.clientWidth / container.clientHeight,
    0.1,
    1000
  );
  camera.position.set(10, 10, 10);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = true;

  // Lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 10);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight2.position.set(-10, 10, -10);
  scene.add(dirLight2);

  // Ground grid
  const grid = new THREE.GridHelper(50, 50, 0x444466, 0x333355);
  scene.add(grid);

  modelGroup = new THREE.Group();
  scene.add(modelGroup);

  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

function colorKey(c: [number, number, number, number]): string {
  return `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.round(c[3] * 255)}`;
}

// Batch key includes texture for textured meshes
function batchKey(
  c: [number, number, number, number],
  texture?: string
): string {
  const ck = colorKey(c);
  return texture ? `${ck}|${texture}` : ck;
}

interface BatchData {
  color: [number, number, number, number];
  texture?: string;
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  vertexOffset: number;
}

export function loadModel(data: SkpModelData, hiddenGroups?: Set<string>) {
  // Clear previous model
  while (modelGroup.children.length > 0) {
    const child = modelGroup.children[0]!;
    modelGroup.remove(child);
    if (child instanceof THREE.Group) {
      child.traverse((c) => {
        if (c instanceof THREE.Mesh) {
          c.geometry.dispose();
          if (c.material instanceof THREE.Material) c.material.dispose();
        }
      });
    }
  }
  groupObjects.clear();

  // Clear texture cache
  for (const tex of textureCache.values()) {
    tex.dispose();
  }
  textureCache.clear();

  // Preload textures
  const textureNames = new Set<string>();
  for (const meshData of data.meshes) {
    if (meshData.texture) textureNames.add(meshData.texture);
  }

  for (const texName of textureNames) {
    const tex = textureLoader.load(`/api/textures/${encodeURIComponent(texName)}`);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    textureCache.set(texName, tex);
  }

  // Batch meshes by group, then by color+texture
  const groupBatches = new Map<string, Map<string, BatchData>>();

  for (const meshData of data.meshes) {
    const group = meshData.group;
    let batches = groupBatches.get(group);
    if (!batches) {
      batches = new Map();
      groupBatches.set(group, batches);
    }

    const key = batchKey(meshData.color, meshData.texture);
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        color: meshData.color,
        texture: meshData.texture,
        positions: [],
        normals: [],
        uvs: [],
        indices: [],
        vertexOffset: 0
      };
      batches.set(key, batch);
    }

    const offset = batch.vertexOffset;
    for (let i = 0; i < meshData.positions.length; i++) {
      batch.positions.push(meshData.positions[i]!);
    }
    for (let i = 0; i < meshData.normals.length; i++) {
      batch.normals.push(meshData.normals[i]!);
    }
    for (let i = 0; i < meshData.uvs.length; i++) {
      batch.uvs.push(meshData.uvs[i]!);
    }
    for (let i = 0; i < meshData.indices.length; i++) {
      batch.indices.push(meshData.indices[i]! + offset);
    }
    batch.vertexOffset += meshData.positions.length / 3;
  }

  // Create Three.js objects per group
  for (const [groupName, batches] of groupBatches) {
    const groupObj = new THREE.Group();
    groupObj.name = groupName;

    for (const batch of batches.values()) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        'position',
        new THREE.Float32BufferAttribute(batch.positions, 3)
      );
      geometry.setAttribute(
        'normal',
        new THREE.Float32BufferAttribute(batch.normals, 3)
      );
      if (batch.uvs.length > 0) {
        geometry.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(batch.uvs, 2)
        );
      }
      geometry.setIndex(batch.indices);

      const [r, g, b, a] = batch.color;
      const matOptions: THREE.MeshStandardMaterialParameters = {
        color: new THREE.Color(r, g, b),
        roughness: 0.7,
        metalness: 0.1,
        side: THREE.DoubleSide,
        transparent: a < 1.0,
        opacity: a,
        wireframe: wireframeMode
      };

      if (batch.texture) {
        const tex = textureCache.get(batch.texture);
        if (tex) {
          matOptions.map = tex;
          // When textured, use white base color so texture shows correctly
          matOptions.color = new THREE.Color(1, 1, 1);
        }
      }

      const material = new THREE.MeshStandardMaterial(matOptions);
      groupObj.add(new THREE.Mesh(geometry, material));
    }

    if (hiddenGroups?.has(groupName)) {
      groupObj.visible = false;
    }

    groupObjects.set(groupName, groupObj);
    modelGroup.add(groupObj);
  }

  console.log(
    `Loaded: ${data.meshCount} faces, ${groupBatches.size} groups, ${textureNames.size} textures`
  );

  fitCameraToModel();
}

export function setGroupVisibility(groupName: string, visible: boolean) {
  const group = groupObjects.get(groupName);
  if (group) {
    group.visible = visible;
  }
}

export function fitCameraToModel() {
  if (modelGroup.children.length === 0) return;

  const box = new THREE.Box3().setFromObject(modelGroup);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.5;

  camera.position.set(
    center.x + distance * 0.7,
    center.y + distance * 0.5,
    center.z + distance * 0.7
  );
  controls.target.copy(center);
  controls.update();
}

export function toggleWireframe() {
  wireframeMode = !wireframeMode;
  modelGroup.traverse((child) => {
    if (
      child instanceof THREE.Mesh &&
      child.material instanceof THREE.MeshStandardMaterial
    ) {
      child.material.wireframe = wireframeMode;
    }
  });
  return wireframeMode;
}

export function resetCamera() {
  fitCameraToModel();
}
