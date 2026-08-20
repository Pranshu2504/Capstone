/// <reference types="vite/client" />

// Static assets imported by the web bundle resolve to their served URL.
declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.jpeg' {
  const src: string;
  export default src;
}
declare module '*.webp' {
  const src: string;
  export default src;
}
declare module '*.gif' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}
declare module '*.ttf' {
  const src: string;
  export default src;
}

declare module 'react-native-vector-icons/glyphmaps/Feather.json' {
  const glyphMap: Record<string, number>;
  export default glyphMap;
}

declare const __DEV__: boolean;
