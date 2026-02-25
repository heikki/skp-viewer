import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import type { SkpModelData } from '@common/types';

let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let renderer: THREE.WebGLRenderer;
let controls: OrbitControls;
let modelGroup: THREE.Group;
let wireframeMode = false;

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

  // Resize handler
  const onResize = () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  };
  window.addEventListener('resize', onResize);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

// Merge meshes by color to reduce draw calls (19k faces → ~dozens of batched meshes)
function colorKey(c: [number, number, number, number]): string {
  return `${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${Math.round(c[3] * 255)}`;
}

export function loadModel(data: SkpModelData) {
  // Clear previous model
  while (modelGroup.children.length > 0) {
    const child = modelGroup.children[0]!;
    modelGroup.remove(child);
    if (child instanceof THREE.Mesh) {
      child.geometry.dispose();
      if (child.material instanceof THREE.Material) {
        child.material.dispose();
      }
    }
  }

  // Group meshes by color for batching
  const batches = new Map<
    string,
    {
      color: [number, number, number, number];
      positions: number[];
      normals: number[];
      indices: number[];
      vertexOffset: number;
    }
  >();

  for (const meshData of data.meshes) {
    const key = colorKey(meshData.color);
    let batch = batches.get(key);
    if (!batch) {
      batch = {
        color: meshData.color,
        positions: [],
        normals: [],
        indices: [],
        vertexOffset: 0
      };
      batches.set(key, batch);
    }

    const offset = batch.vertexOffset;

    // Append positions and normals
    for (let i = 0; i < meshData.positions.length; i++) {
      batch.positions.push(meshData.positions[i]!);
    }
    for (let i = 0; i < meshData.normals.length; i++) {
      batch.normals.push(meshData.normals[i]!);
    }

    // Append indices with offset
    for (let i = 0; i < meshData.indices.length; i++) {
      batch.indices.push(meshData.indices[i]! + offset);
    }

    batch.vertexOffset += meshData.positions.length / 3;
  }

  // Create one Three.js mesh per color batch
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
    geometry.setIndex(batch.indices);

    const [r, g, b, a] = batch.color;
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(r, g, b),
      roughness: 0.7,
      metalness: 0.1,
      side: THREE.DoubleSide,
      transparent: a < 1.0,
      opacity: a,
      wireframe: wireframeMode
    });

    const mesh = new THREE.Mesh(geometry, material);
    modelGroup.add(mesh);
  }

  console.log(
    `Loaded: ${data.meshCount} faces → ${batches.size} draw calls`
  );

  fitCameraToModel();
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
