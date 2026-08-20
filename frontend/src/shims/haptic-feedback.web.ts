/**
 * Web stand-in for `react-native-haptic-feedback`.
 * Maps ZORA's trigger names onto the Vibration API where the browser
 * supports it (Android Chrome), and is a silent no-op everywhere else.
 */

type HapticType = string;

const PATTERNS: Record<string, number | number[]> = {
  selection: 8,
  impactLight: 10,
  impactMedium: 20,
  impactHeavy: 32,
  rigid: 14,
  soft: 12,
  notificationSuccess: [12, 40, 12],
  notificationWarning: [16, 50, 16],
  notificationError: [24, 60, 24, 60, 24],
  clockTick: 6,
  keyboardTap: 6,
};

function trigger(type: HapticType = 'selection', _options?: unknown): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  const pattern = PATTERNS[type] ?? 10;
  try {
    navigator.vibrate(pattern);
  } catch {
    // Vibration is best-effort; never let it break an interaction.
  }
}

export const HapticFeedbackTypes = Object.fromEntries(
  Object.keys(PATTERNS).map((k) => [k, k]),
) as Record<string, string>;

const ReactNativeHapticFeedback = { trigger };

export { trigger };
export default ReactNativeHapticFeedback;
