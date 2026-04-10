import React from "react";
import { Text, TextStyle, StyleSheet } from "react-native";
import { useColors } from "@/hooks/useColors";

interface ZoraTextProps {
  children: React.ReactNode;
  variant?: "display" | "heading" | "subheading" | "body" | "caption" | "brass" | "label";
  style?: TextStyle | TextStyle[];
  numberOfLines?: number;
}

export function ZoraText({ children, variant = "body", style, numberOfLines }: ZoraTextProps) {
  const colors = useColors();

  const variantStyles: Record<string, TextStyle> = {
    display: {
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: 32,
      lineHeight: 40,
      color: colors.warmWhite,
      letterSpacing: -0.5,
    },
    heading: {
      fontFamily: "PlayfairDisplay_700Bold",
      fontSize: 24,
      lineHeight: 32,
      color: colors.warmWhite,
      letterSpacing: -0.3,
    },
    subheading: {
      fontFamily: "Inter_500Medium",
      fontSize: 13,
      lineHeight: 18,
      color: colors.warmWhite,
      letterSpacing: 1.5,
      textTransform: "uppercase",
    },
    body: {
      fontFamily: "Inter_400Regular",
      fontSize: 15,
      lineHeight: 22,
      color: colors.warmWhite,
    },
    caption: {
      fontFamily: "Inter_400Regular",
      fontSize: 11,
      lineHeight: 16,
      color: colors.mutedForeground,
      letterSpacing: 0.3,
    },
    brass: {
      fontFamily: "Inter_500Medium",
      fontSize: 11,
      lineHeight: 16,
      color: colors.brass,
      letterSpacing: 2,
      textTransform: "uppercase",
    },
    label: {
      fontFamily: "Inter_500Medium",
      fontSize: 12,
      lineHeight: 17,
      color: colors.mutedForeground,
      letterSpacing: 0.5,
    },
  };

  return (
    <Text style={[variantStyles[variant], style]} numberOfLines={numberOfLines}>
      {children}
    </Text>
  );
}
