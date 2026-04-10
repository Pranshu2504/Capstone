import React, { useState } from "react";
import {
  View,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Platform,
} from "react-native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface NavItem {
  key: string;
  icon: string;
  label: string;
}

const NAV_ITEMS: NavItem[] = [
  { key: "mirror", icon: "sun", label: "Mirror" },
  { key: "wardrobe", icon: "grid", label: "Wardrobe" },
  { key: "lens", icon: "camera", label: "Lens" },
  { key: "calendar", icon: "calendar", label: "Calendar" },
  { key: "pulse", icon: "activity", label: "Pulse" },
];

interface OrbitalNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function OrbitalNav({ activeTab, onTabChange }: OrbitalNavProps) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const animValue = React.useRef(new Animated.Value(0)).current;

  const toggleExpand = () => {
    ReactNativeHapticFeedback.trigger("impactMedium");
    const toValue = expanded ? 0 : 1;
    Animated.spring(animValue, {
      toValue,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
    setExpanded(!expanded);
  };

  const handleSelect = (key: string) => {
    ReactNativeHapticFeedback.trigger("impactLight");
    onTabChange(key);
    Animated.spring(animValue, {
      toValue: 0,
      useNativeDriver: true,
      damping: 15,
      stiffness: 200,
    }).start();
    setExpanded(false);
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const radius = 90;
  const angles = [-150, -100, -60, -20, 20];

  return (
    <View
      style={[
        styles.container,
        { bottom: bottomPad + 24, right: 24 },
      ]}
      pointerEvents="box-none"
    >
      {NAV_ITEMS.map((item, i) => {
        const angle = (angles[i] * Math.PI) / 180;
        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const translateX = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, x],
        });
        const translateY = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0, y],
        });
        const opacity = animValue.interpolate({
          inputRange: [0, 0.5, 1],
          outputRange: [0, 0, 1],
        });
        const scale = animValue.interpolate({
          inputRange: [0, 1],
          outputRange: [0.5, 1],
        });

        const isActive = activeTab === item.key;

        return (
          <Animated.View
            key={item.key}
            style={[
              styles.radialItem,
              {
                transform: [{ translateX }, { translateY }, { scale }],
                opacity,
              },
            ]}
          >
            <TouchableOpacity
              onPress={() => handleSelect(item.key)}
              style={[
                styles.radialButton,
                {
                  backgroundColor: isActive ? colors.brass : colors.surface,
                  borderColor: isActive ? colors.brass : colors.border,
                },
              ]}
            >
              <Feather
                name={item.icon as any}
                size={16}
                color={isActive ? colors.charcoal : colors.mutedForeground}
              />
            </TouchableOpacity>
          </Animated.View>
        );
      })}

      <TouchableOpacity
        onPress={toggleExpand}
        onLongPress={toggleExpand}
        style={[styles.mainButton, { backgroundColor: colors.brass }]}
        activeOpacity={0.85}
      >
        <Animated.View
          style={{
            transform: [
              {
                rotate: animValue.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0deg", "45deg"],
                }),
              },
            ],
          }}
        >
          <Feather name="circle" size={20} color={colors.charcoal} />
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 999,
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#C9A84C",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  radialItem: {
    position: "absolute",
  },
  radialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
});
