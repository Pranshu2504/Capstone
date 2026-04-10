import React from "react";
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ViewStyle,
  TextStyle,
  ActivityIndicator,
} from "react-native";
import { useColors } from "@/hooks/useColors";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

interface BrassButtonProps {
  label: string;
  onPress: () => void;
  variant?: "solid" | "ghost" | "outline";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  style?: ViewStyle;
}

export function BrassButton({
  label,
  onPress,
  variant = "solid",
  size = "md",
  loading = false,
  style,
}: BrassButtonProps) {
  const colors = useColors();

  const handlePress = () => {
    ReactNativeHapticFeedback.trigger("impactLight");
    onPress();
  };

  const sizeStyles: Record<string, ViewStyle> = {
    sm: { paddingVertical: 8, paddingHorizontal: 18, borderRadius: 20 },
    md: { paddingVertical: 13, paddingHorizontal: 28, borderRadius: 24 },
    lg: { paddingVertical: 16, paddingHorizontal: 36, borderRadius: 28 },
  };

  const textSizes: Record<string, TextStyle> = {
    sm: { fontSize: 11, letterSpacing: 1.5 },
    md: { fontSize: 12, letterSpacing: 2 },
    lg: { fontSize: 13, letterSpacing: 2.5 },
  };

  const variantContainerStyle: ViewStyle =
    variant === "solid"
      ? { backgroundColor: colors.brass }
      : variant === "outline"
      ? { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.brass }
      : { backgroundColor: "transparent" };

  const variantTextStyle: TextStyle = {
    color: variant === "solid" ? colors.charcoal : colors.brass,
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      activeOpacity={0.75}
      style={[styles.base, sizeStyles[size], variantContainerStyle, style]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={variant === "solid" ? colors.charcoal : colors.brass} />
      ) : (
        <Text style={[styles.text, textSizes[size], variantTextStyle]}>{label.toUpperCase()}</Text>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    fontFamily: "Inter_500Medium",
    textTransform: "uppercase",
  },
});
