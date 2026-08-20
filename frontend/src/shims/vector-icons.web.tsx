/**
 * Web stand-in for `react-native-vector-icons/Feather`.
 *
 * Renders the real Feather glyphs by loading the .ttf the package already
 * ships and looking codepoints up in its own glyph map, so every icon name
 * used on native resolves identically on web.
 */
import React from 'react';
import { Text, type TextStyle, type StyleProp } from 'react-native';
import glyphMap from 'react-native-vector-icons/glyphmaps/Feather.json';
import fontUrl from 'react-native-vector-icons/Fonts/Feather.ttf';

const FONT_FAMILY = 'Feather';

if (typeof document !== 'undefined' && !document.getElementById('zora-feather-font')) {
  const style = document.createElement('style');
  style.id = 'zora-feather-font';
  style.textContent = `@font-face {
  font-family: "${FONT_FAMILY}";
  src: url("${fontUrl}") format("truetype");
  font-weight: normal;
  font-style: normal;
  font-display: block;
}`;
  document.head.appendChild(style);
}

const glyphs = glyphMap as Record<string, number>;

export interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  [key: string]: unknown;
}

function Icon({ name, size = 24, color, style, ...rest }: IconProps) {
  const codepoint = glyphs[name];

  if (codepoint === undefined && __DEV__) {
    console.warn(`[vector-icons shim] Unknown Feather icon "${name}"`);
  }

  return (
    <Text
      {...rest}
      selectable={false}
      style={[
        {
          fontFamily: FONT_FAMILY,
          fontSize: size,
          lineHeight: size,
          color,
          // Keep glyphs from inheriting text decoration/spacing from parents.
          fontStyle: 'normal',
          fontWeight: 'normal',
          letterSpacing: 0,
          textAlign: 'center',
        } as TextStyle,
        style,
      ]}
    >
      {codepoint === undefined ? '' : String.fromCharCode(codepoint)}
    </Text>
  );
}

declare const __DEV__: boolean;

export default Icon;
export { Icon };
