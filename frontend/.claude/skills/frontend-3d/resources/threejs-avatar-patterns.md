# Three.js Avatar Patterns for ZORA

Reference patterns for building the 3D avatar viewer inside the React Native WebView.

---

## Scene Setup (Complete Boilerplate)

```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

function createScene(canvas) {
  // Renderer
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));  // cap at 2x for mobile
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  // Camera
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    50
  );
  camera.position.set(0, 1.0, 2.8);

  // Scene
  const scene = new THREE.Scene();

  // Controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0.9, 0);    // target body centre
  controls.minPolarAngle = Math.PI / 6;   // can't look from below
  controls.maxPolarAngle = Math.PI - Math.PI / 6;
  controls.minDistance = 0.8;
  controls.maxDistance = 4.5;
  controls.enablePan = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.update();

  return { renderer, camera, scene, controls };
}
```

---

## Lighting for Skin and Fabric

```javascript
function addZoraLighting(scene) {
  // Soft ambient — prevents totally black shadows
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  // Key light — warm directional (slightly off-axis)
  const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.4);
  keyLight.position.set(1.5, 2.5, 2.0);
  keyLight.castShadow = false;  // shadows expensive on mobile
  scene.add(keyLight);

  // Fill light — brass-tinted from the side (ZORA brand colour)
  const fillLight = new THREE.DirectionalLight(0xc9a84c, 0.25);
  fillLight.position.set(-2.0, 0.5, -1.0);
  scene.add(fillLight);

  // Rim light — separates avatar from dark background
  const rimLight = new THREE.DirectionalLight(0xaaccff, 0.4);
  rimLight.position.set(0, 1.0, -3.0);
  scene.add(rimLight);
}
```

---

## GLB Loader with Draco

```javascript
function createGLTFLoader() {
  const dracoLoader = new DRACOLoader();
  // Use local draco decoder (bundle in android assets)
  dracoLoader.setDecoderPath('/android_asset/draco/');
  // Or use CDN during development:
  // dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/libs/draco/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

async function loadAvatarMesh(loader, url, scene) {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const mesh = gltf.scene;

        // Centre the mesh at world origin
        const box = new THREE.Box3().setFromObject(mesh);
        const centre = box.getCenter(new THREE.Vector3());
        mesh.position.sub(centre);
        mesh.position.y += (box.max.y - box.min.y) / 2;  // stand on ground

        // Apply PBR materials if needed
        mesh.traverse((obj) => {
          if (obj.isMesh) {
            obj.material.envMapIntensity = 0.5;
          }
        });

        scene.add(mesh);
        resolve(mesh);
      },
      undefined,
      reject
    );
  });
}
```

---

## Orbit Controls with Touch Gestures

```javascript
// OrbitControls handles touch natively — one finger rotate, two fingers zoom.
// These settings are tuned for portrait-mode avatar viewing:

controls.rotateSpeed = 0.6;
controls.zoomSpeed = 0.8;

// Restrict vertical rotation to avoid seeing under the floor
controls.minPolarAngle = 0.2;
controls.maxPolarAngle = Math.PI * 0.85;

// Enable auto-rotation for idle state
controls.autoRotate = false;
controls.autoRotateSpeed = 0.5;

// Call in animate loop:
function onIdleTimeout() {
  controls.autoRotate = true;
}
function onUserInteraction() {
  controls.autoRotate = false;
}
renderer.domElement.addEventListener('touchstart', onUserInteraction);
```

---

## Garment Texture Application

```javascript
const textureLoader = new THREE.TextureLoader();

function applyGarmentTexture(mesh, textureUrl) {
  textureLoader.load(textureUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;  // GLB UVs don't flip Y

    mesh.traverse((obj) => {
      if (obj.isMesh && obj.name.toLowerCase().includes('garment')) {
        const mat = new THREE.MeshStandardMaterial({
          map: texture,
          roughness: 0.8,
          metalness: 0.0,
        });
        obj.material = mat;
      }
    });
  });
}

// Swap garments by replacing texture
function swapGarment(mesh, newTextureUrl) {
  mesh.traverse((obj) => {
    if (obj.isMesh && obj.material.map) {
      obj.material.map.dispose();
    }
  });
  applyGarmentTexture(mesh, newTextureUrl);
}
```

---

## Animation Loop

```javascript
function startRenderLoop(renderer, scene, camera, controls) {
  let animFrameId;

  function animate() {
    animFrameId = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }

  animate();

  // Return cleanup function — call on WebView unmount
  return function cleanup() {
    cancelAnimationFrame(animFrameId);
    renderer.dispose();
    controls.dispose();
  };
}
```

---

## Window Resize Handler

```javascript
function onResize(renderer, camera) {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

window.addEventListener('resize', () => onResize(renderer, camera));
```

---

## Messaging Bridge with React Native

```javascript
// From Three.js → React Native
function sendToRN(type, payload = {}) {
  window.ReactNativeWebView?.postMessage(JSON.stringify({ type, ...payload }));
}

// Usage examples:
sendToRN('loaded', { meshVertexCount: 10475 });
sendToRN('error', { message: 'GLB load failed' });
sendToRN('interact', { action: 'rotate_start' });

// From React Native → Three.js (in window.message listener)
window.addEventListener('message', (e) => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case 'loadGLB':      loadAvatarMesh(loader, msg.url, scene); break;
    case 'loadTexture':  applyGarmentTexture(avatarMesh, msg.url); break;
    case 'resetCamera':  camera.position.set(0, 1.0, 2.8); controls.target.set(0, 0.9, 0); break;
  }
});
```

---

## Memory Management Checklist

Before removing a mesh from the scene:
```javascript
function disposeMesh(mesh) {
  mesh.traverse((obj) => {
    if (obj.isMesh) {
      obj.geometry.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach(mat => {
          mat.map?.dispose();
          mat.dispose();
        });
      } else {
        obj.material.map?.dispose();
        obj.material.dispose();
      }
    }
  });
  scene.remove(mesh);
}
```
