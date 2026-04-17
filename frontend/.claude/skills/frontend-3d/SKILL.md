---
name: frontend-3d
description: Trigger when working on the 3D avatar viewer, GLB mesh loading, garment overlay on avatar, avatar rendering, or anything related to 3D canvas in the React Native app
---

# Frontend 3D Skill

## Status
**Planned feature** — the 3D avatar viewer is not yet implemented in the codebase. The current `LensScreen.tsx` shows a 2D try-on result image. This skill guides how to implement the 3D avatar when that work begins.

## Goal
Render a 3D SMPL-X body mesh (delivered as a `.glb` file from the backend) inside the React Native app. Allow the user to rotate/zoom the avatar and see garments overlaid via UV texture mapping.

---

## Approach Options

### Option A — WebView + Three.js (Recommended for first pass)
Serve a minimal Three.js HTML page from a local Express server or bundled asset, render in React Native `WebView`. Bidirectional `postMessage` for data exchange.

**Pros**: Full Three.js ecosystem, easiest to implement, no native code.
**Cons**: Bridge overhead, no native gestures, slight latency.

### Option B — `@react-three/fiber` via `expo-gl`
Use `expo-gl` + `@react-three/fiber` directly in React Native.

**Pros**: Native GL context, React integration, proper gesture handling.
**Cons**: Requires Expo or manual native module setup, more complex build.

### Option C — `react-native-wgpu` (WebGPU)
New React Native WebGPU bridge — future-proof but very early stage.

**Recommended path**: Start with Option A (WebView + Three.js) and migrate to Option B when ready for production.

---

## Option A Implementation

### Three.js HTML Template (bundled in assets)

```html
<!-- frontend/assets/avatar-viewer/index.html -->
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, user-scalable=no">
  <style>
    body { margin: 0; background: #090909; overflow: hidden; }
    canvas { display: block; }
  </style>
</head>
<body>
<script type="module">
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.165/build/three.module.js';
import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/controls/OrbitControls.js';

// Scene setup
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 1.0, 3.0);

// Lighting for skin + fabric
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambientLight);
const keyLight = new THREE.DirectionalLight(0xfff5e4, 1.2);
keyLight.position.set(1, 2, 2);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0xc9a84c, 0.3); // brass fill
fillLight.position.set(-2, 0, -1);
scene.add(fillLight);

// Controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.9, 0);
controls.minDistance = 1.0;
controls.maxDistance = 5.0;
controls.enablePan = false;
controls.update();

// GLB Loader with Draco
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://cdn.jsdelivr.net/npm/three@0.165/examples/jsm/libs/draco/');
const gltfLoader = new GLTFLoader();
gltfLoader.setDRACOLoader(dracoLoader);

let currentMesh = null;

function loadGLB(url) {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.traverse(obj => { if (obj.geometry) obj.geometry.dispose(); });
  }
  gltfLoader.load(url, (gltf) => {
    currentMesh = gltf.scene;
    scene.add(currentMesh);
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'loaded', url }));
  }, undefined, (err) => {
    window.ReactNativeWebView?.postMessage(JSON.stringify({ type: 'error', message: err.message }));
  });
}

// Listen for messages from React Native
window.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (msg.type === 'loadGLB') loadGLB(msg.url);
});

// Render loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});
</script>
</body>
</html>
```

### React Native Component

```tsx
// frontend/src/components/AvatarViewer.tsx
import React, { useRef, useCallback } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

interface AvatarViewerProps {
  glbUrl: string;
  onLoaded?: () => void;
  onError?: (msg: string) => void;
}

export function AvatarViewer({ glbUrl, onLoaded, onError }: AvatarViewerProps) {
  const webviewRef = useRef<WebView>(null);

  // Send GLB URL to Three.js scene when URL changes
  const onWebViewLoad = useCallback(() => {
    webviewRef.current?.postMessage(
      JSON.stringify({ type: 'loadGLB', url: glbUrl })
    );
  }, [glbUrl]);

  const onMessage = useCallback((event: WebViewMessageEvent) => {
    const msg = JSON.parse(event.nativeEvent.data);
    if (msg.type === 'loaded') onLoaded?.();
    if (msg.type === 'error') onError?.(msg.message);
  }, [onLoaded, onError]);

  return (
    <View style={styles.container}>
      <WebView
        ref={webviewRef}
        source={{ uri: 'file:///android_asset/avatar-viewer/index.html' }}
        onLoad={onWebViewLoad}
        onMessage={onMessage}
        javaScriptEnabled
        allowFileAccess
        originWhitelist={['*']}
        style={styles.webview}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#090909' },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
```

---

## Performance Tips

1. **Use Draco compression** on all GLB files exported from the backend. Reduces file size by ~70%.
2. **Lazy load the AvatarViewer** — only mount the WebView when the user navigates to the Lens tab.
3. **Destroy the WebView on unmount** — call `webviewRef.current = null` in `useEffect` cleanup.
4. **Cache GLB by URL** — if the user's body mesh hasn't changed, reuse the cached URL.
5. **Target polygon budget**: SMPL-X has 10,475 vertices — this is fine. Don't add subdivisions.

---

## Garment Texture Overlay via UV Mapping

The backend will provide a garment texture image separate from the mesh. Apply it as a texture to the garment submesh using Three.js `TextureLoader`:

```javascript
// In the Three.js HTML, add this function:
function applyGarmentTexture(textureUrl) {
  const loader = new THREE.TextureLoader();
  loader.load(textureUrl, (texture) => {
    texture.colorSpace = THREE.SRGBColorSpace;
    currentMesh.traverse((obj) => {
      if (obj.isMesh && obj.name.includes('garment')) {
        obj.material = new THREE.MeshStandardMaterial({ map: texture });
      }
    });
  });
}
```

---

## Resource References
- `resources/threejs-avatar-patterns.md` — reusable Three.js code patterns for this app
