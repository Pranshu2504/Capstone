/**
 * Web stand-in for `react-native-gesture-handler`.
 * ZORA only mounts GestureHandlerRootView and uses RN's own touchables
 * everywhere else, so plain RN primitives cover the whole surface.
 */
import React from 'react';
import {
  ScrollView,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TextInput,
  FlatList,
  View,
  type ViewProps,
} from 'react-native';

export const GestureHandlerRootView = ({ style, ...props }: ViewProps) => (
  <View style={[{ flex: 1 }, style]} {...props} />
);

export {
  ScrollView,
  TouchableOpacity,
  TouchableHighlight,
  TouchableWithoutFeedback,
  TextInput,
  FlatList,
};

export const RectButton = TouchableOpacity;
export const BorderlessButton = TouchableOpacity;
export const BaseButton = TouchableOpacity;
export const Swipeable = View;
export const Directions = { RIGHT: 1, LEFT: 2, UP: 4, DOWN: 8 };
export const State = {
  UNDETERMINED: 0, FAILED: 1, BEGAN: 2, CANCELLED: 3, ACTIVE: 4, END: 5,
};
export const gestureHandlerRootHOC = <P extends object>(C: React.ComponentType<P>) => C;
export default { install: () => {} };
