/**
 * react-native-web ships no type declarations. The shared app source is
 * written against the `react-native` types, and `src/shims/react-native.web.ts`
 * only re-exports RNW's runtime, so an untyped module declaration is enough.
 */
declare module 'react-native-web' {
  export * from 'react-native';
}
