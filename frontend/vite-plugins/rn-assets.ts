import type { Plugin } from 'vite';

const ASSET_REQUIRE =
  /require\(\s*(['"])([^'"]+\.(?:png|jpe?g|gif|webp|svg|bmp|ttf|otf))\1\s*\)/g;

/**
 * React Native resolves static images with `require('./foo.png')`, which has no
 * meaning in an ESM browser bundle. This rewrites each such call into a hoisted
 * ESM import of the same path, letting Vite fingerprint and serve the file.
 *
 * Doing it at bundle time means `src/` and `App.tsx` stay byte-identical for the
 * Metro/Android build — no `Platform.OS` branches in component code.
 */
export function reactNativeAssets(): Plugin {
  return {
    name: 'zora:react-native-assets',
    enforce: 'pre',

    transform(code, id) {
      if (!/\.[jt]sx?$/.test(id) || id.includes('node_modules')) return null;
      if (!code.includes('require(')) return null;

      const imports: string[] = [];
      const seen = new Map<string, string>();

      const output = code.replace(ASSET_REQUIRE, (_match, _quote, assetPath: string) => {
        let identifier = seen.get(assetPath);
        if (!identifier) {
          identifier = `__rnAsset${seen.size}__`;
          seen.set(assetPath, identifier);
          imports.push(`import ${identifier} from ${JSON.stringify(assetPath)};`);
        }
        return identifier;
      });

      if (!imports.length) return null;

      return {
        code: `${imports.join('\n')}\n${output}`,
        map: null,
      };
    },
  };
}
