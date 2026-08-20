/**
 * Web stand-in for `react-native-reanimated`.
 *
 * ZORA uses exactly four Reanimated APIs (one animated toggle in
 * IdentityScreen), so this maps them onto RN's own Animated driver rather
 * than pulling the Reanimated worklet toolchain into the web bundle.
 */
import React, { useEffect, useMemo, useRef } from 'react';
import { Animated as RNAnimated, Easing } from 'react-native';

export interface SharedValue<T> {
  value: T;
}

/** Backs a shared value with an Animated.Value so styles can interpolate it. */
export function useSharedValue<T extends number>(initial: T): SharedValue<T> {
  const animated = useRef(new RNAnimated.Value(initial)).current;
  const current = useRef<T>(initial);
  const version = useRef(0);
  const [, force] = React.useReducer((n: number) => n + 1, 0);

  return useMemo(
    () => ({
      get value() {
        return current.current;
      },
      set value(next: T) {
        const target = typeof next === 'object' ? (next as any).__target : next;
        const config = typeof next === 'object' ? (next as any).__config : null;
        current.current = target as T;
        version.current += 1;

        if (config?.type === 'spring') {
          RNAnimated.spring(animated, {
            toValue: target as number,
            damping: config.damping ?? 15,
            stiffness: config.stiffness ?? 120,
            mass: config.mass ?? 1,
            useNativeDriver: false,
          }).start();
        } else if (config?.type === 'timing') {
          RNAnimated.timing(animated, {
            toValue: target as number,
            duration: config.duration ?? 300,
            easing: config.easing ?? Easing.inOut(Easing.ease),
            useNativeDriver: false,
          }).start();
        } else {
          animated.setValue(target as number);
        }
        force();
      },
      // Internal handle the style hook reads.
      __animated: animated,
    }),
    [animated],
  ) as SharedValue<T>;
}

/** Marker objects consumed by the `value` setter above. */
export const withSpring = (toValue: number, config?: Record<string, number>) =>
  ({ __target: toValue, __config: { type: 'spring', ...config } }) as unknown as number;

export const withTiming = (toValue: number, config?: Record<string, unknown>) =>
  ({ __target: toValue, __config: { type: 'timing', ...config } }) as unknown as number;

export const withDelay = (_ms: number, animation: number) => animation;

/**
 * Runs the style factory eagerly. Because the factory reads `.value`
 * (the settled target) the resulting styles are correct; the visual
 * tween comes from the Animated.Value driving interpolations below.
 */
export function useAnimatedStyle<T extends object>(factory: () => T, deps: unknown[] = []): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(factory, deps.length ? deps : [factory()]);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.min(Math.max(v, lo), hi);
}

function parseColor(input: string): [number, number, number, number] {
  const value = input.trim();
  const hex = /^#([0-9a-f]{3,8})$/i.exec(value);
  if (hex) {
    let h = hex[1];
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 6) h += 'ff';
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
      parseInt(h.slice(6, 8), 16) / 255,
    ];
  }
  const rgb = /rgba?\(([^)]+)\)/i.exec(value);
  if (rgb) {
    const parts = rgb[1].split(',').map((p) => parseFloat(p.trim()));
    return [parts[0] || 0, parts[1] || 0, parts[2] || 0, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

/** Linear RGBA interpolation across an arbitrary colour stop list. */
export function interpolateColor(
  value: number,
  inputRange: readonly number[],
  outputRange: readonly string[],
): string {
  if (outputRange.length === 0) return 'transparent';
  if (outputRange.length === 1) return outputRange[0];

  let i = 0;
  while (i < inputRange.length - 2 && value > inputRange[i + 1]) i += 1;

  const lo = inputRange[i];
  const hi = inputRange[i + 1];
  const t = hi === lo ? 0 : clamp((value - lo) / (hi - lo), 0, 1);

  const a = parseColor(outputRange[i]);
  const b = parseColor(outputRange[i + 1]);
  const mix = (x: number, y: number) => Math.round(x + (y - x) * t);

  return `rgba(${mix(a[0], b[0])}, ${mix(a[1], b[1])}, ${mix(a[2], b[2])}, ${(
    a[3] + (b[3] - a[3]) * t
  ).toFixed(3)})`;
}

export function interpolate(
  value: number,
  inputRange: readonly number[],
  outputRange: readonly number[],
): number {
  let i = 0;
  while (i < inputRange.length - 2 && value > inputRange[i + 1]) i += 1;
  const lo = inputRange[i];
  const hi = inputRange[i + 1];
  const t = hi === lo ? 0 : clamp((value - lo) / (hi - lo), 0, 1);
  return outputRange[i] + (outputRange[i + 1] - outputRange[i]) * t;
}

export const runOnJS =
  <T extends (...args: any[]) => any>(fn: T) =>
  (...args: Parameters<T>) =>
    fn(...args);

export const runOnUI =
  <T extends (...args: any[]) => any>(fn: T) =>
  (...args: Parameters<T>) =>
    fn(...args);

/**
 * `Animated.View` on web is RN's own Animated.View, with a CSS transition so
 * that style changes produced by `useAnimatedStyle` tween instead of jumping.
 */
const AnimatedView = React.forwardRef<any, any>(({ style, ...props }, ref) => (
  <RNAnimated.View
    ref={ref}
    {...props}
    style={[{ transitionProperty: 'all', transitionDuration: '260ms', transitionTimingFunction: 'cubic-bezier(0.2, 0.9, 0.3, 1)' } as any, style]}
  />
));
AnimatedView.displayName = 'Animated.View';

const AnimatedText = React.forwardRef<any, any>(({ style, ...props }, ref) => (
  <RNAnimated.Text
    ref={ref}
    {...props}
    style={[{ transitionProperty: 'all', transitionDuration: '260ms' } as any, style]}
  />
));
AnimatedText.displayName = 'Animated.Text';

const Animated = {
  View: AnimatedView,
  Text: AnimatedText,
  ScrollView: RNAnimated.ScrollView,
  Image: RNAnimated.Image,
  createAnimatedComponent: RNAnimated.createAnimatedComponent,
};

export { Easing, useEffect };
export default Animated;
