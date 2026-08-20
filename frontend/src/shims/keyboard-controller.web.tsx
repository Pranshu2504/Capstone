/**
 * Web stand-in for `react-native-keyboard-controller`.
 * Browsers reflow around the on-screen keyboard themselves, so the provider
 * is a passthrough and the aware scroll view is a plain ScrollView.
 */
import React from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

export type KeyboardAwareScrollViewProps = ScrollViewProps & {
  bottomOffset?: number;
  extraKeyboardSpace?: number;
  disableScrollOnKeyboardHide?: boolean;
};

export const KeyboardProvider = ({ children }: { children: React.ReactNode }) => <>{children}</>;

export const KeyboardAwareScrollView = React.forwardRef<ScrollView, KeyboardAwareScrollViewProps>(
  ({ bottomOffset: _b, extraKeyboardSpace: _e, disableScrollOnKeyboardHide: _d, ...props }, ref) => (
    <ScrollView ref={ref} {...props} />
  ),
);
KeyboardAwareScrollView.displayName = 'KeyboardAwareScrollView';

export const KeyboardStickyView = ({ children }: { children: React.ReactNode }) => <>{children}</>;
export const KeyboardAvoidingView = ScrollView;
export const useKeyboardHandler = () => {};
export const useReanimatedKeyboardAnimation = () => ({ height: { value: 0 }, progress: { value: 0 } });
export const KeyboardEvents = { addListener: () => ({ remove() {} }) };
export const KeyboardController = {
  dismiss: () => (document.activeElement as HTMLElement | null)?.blur(),
  setInputMode: () => {},
  setDefaultMode: () => {},
};
