import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

import { reactNativeAssets } from './vite-plugins/rn-assets';

const root = path.dirname(fileURLToPath(import.meta.url));
const r = (p: string) => path.resolve(root, p);

/**
 * Web target for the ZORA React Native app.
 *
 * `frontend/src` and `App.tsx` are shared verbatim with the Android build;
 * everything web-specific lives in the aliases below, so no screen needs a
 * platform branch. Native-only modules resolve to hand-written shims in
 * `src/shims/`.
 */
export default defineConfig(({ mode }) => ({
  root,
  // Serve `assets/` at the web root so index.html can reference /images/*.
  publicDir: r('assets'),

  plugins: [
    reactNativeAssets(),
    react({
      babel: {
        // The RN source relies on the `@` module alias, resolved by Vite below,
        // so only the JSX/TS transform is needed here.
        plugins: [],
      },
    }),
  ],

  resolve: {
    // `.web.*` wins over the plain extension, matching Metro's platform resolution.
    extensions: [
      '.web.tsx', '.web.ts', '.web.jsx', '.web.js',
      '.tsx', '.ts', '.jsx', '.js', '.mjs', '.cjs', '.json',
    ],
    alias: [
      { find: /^@\/(.*)$/, replacement: r('src/$1') },

      // Native-only modules → web shims.
      { find: /^react-native-vector-icons\/Feather$/, replacement: r('src/shims/vector-icons.web.tsx') },
      { find: /^react-native-haptic-feedback$/, replacement: r('src/shims/haptic-feedback.web.ts') },
      { find: /^react-native-reanimated$/, replacement: r('src/shims/reanimated.web.tsx') },
      { find: /^react-native-keyboard-controller$/, replacement: r('src/shims/keyboard-controller.web.tsx') },
      { find: /^react-native-image-picker$/, replacement: r('src/shims/image-picker.web.ts') },
      { find: /^react-native-restart$/, replacement: r('src/shims/restart.web.ts') },
      { find: /^react-native-gesture-handler$/, replacement: r('src/shims/gesture-handler.web.tsx') },

      // The core swap. Must come after the more specific `react-native-*`
      // entries above, since alias matching is order-sensitive. The wrapper
      // re-exports react-native-web and fills in Android-only APIs.
      { find: /^react-native$/, replacement: r('src/shims/react-native.web.ts') },
    ],
  },

  define: {
    global: 'window',
    __DEV__: JSON.stringify(mode !== 'production'),
    'process.env.NODE_ENV': JSON.stringify(mode),
  },

  optimizeDeps: {
    esbuildOptions: {
      // Several RN-ecosystem packages ship untransformed JSX in .js files.
      loader: { '.js': 'jsx' },
      resolveExtensions: ['.web.js', '.web.ts', '.web.tsx', '.js', '.ts', '.tsx', '.json'],
      define: { global: 'window' },
    },
    include: ['react', 'react-dom', 'react-dom/client', 'react-native-web'],
  },

  assetsInclude: ['**/*.ttf'],

  build: {
    outDir: 'dist',
    sourcemap: mode !== 'production',
    target: 'es2020',
    rollupOptions: {
      output: {
        // react + react-dom arrive via react-native-web, so they share its chunk.
        manualChunks: { 'rnw-vendor': ['react-native-web'] },
      },
    },
  },

  server: {
    port: 5173,
    strictPort: false,
    open: false,
  },

  preview: { port: 4173 },
}));
