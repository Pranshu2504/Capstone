import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  PanResponder,
  Animated,
  TouchableOpacity,
  Text,
  TextInput,
  Image,
  ImageBackground,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useColors } from "@/hooks/useColors";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const { width, height } = Dimensions.get("window");

export default function DoorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const [doorOpen, setDoorOpen] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const doorAnim = useRef(new Animated.Value(0)).current;
  const loginAnim = useRef(new Animated.Value(0)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          swipeAnim.setValue(Math.min(gestureState.dx, width * 0.6));
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx > 80) {
          ReactNativeHapticFeedback.trigger("impactHeavy");
          Animated.timing(swipeAnim, {
            toValue: width,
            duration: 400,
            useNativeDriver: true,
          }).start(() => {
            setDoorOpen(true);
            Animated.timing(loginAnim, {
              toValue: 1,
              duration: 500,
              useNativeDriver: true,
            }).start(() => setShowLogin(true));
          });
        } else {
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  if (doorOpen) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ImageBackground
          source={require("../../assets/images/wardrobe_interior.png")}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
        >
          <View style={[StyleSheet.absoluteFillObject, styles.interiorOverlay]} />
        </ImageBackground>

        <Animated.View
          style={[
            styles.loginPanel,
            {
              top: topPad + 80,
              opacity: loginAnim,
              transform: [
                {
                  translateY: loginAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [40, 0],
                  }),
                },
              ],
            },
          ]}
        >
          <Text style={[styles.zoraLogotype, { color: colors.brass }]}>ZORA</Text>

          <View style={styles.inputGroup}>
            <TextInput
              style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
              placeholder="email"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            <TextInput
              style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
              placeholder="password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.enterButton, { backgroundColor: colors.brass }]}
            onPress={() => {
              ReactNativeHapticFeedback.trigger("impactLight");
              navigation.reset({ index: 0, routes: [{ name: "Main" }] });
            }}
            activeOpacity={0.8}
          >
            <Text style={[styles.enterButtonText, { color: colors.charcoal }]}>enter</Text>
          </TouchableOpacity>

          <View style={styles.socialRow}>
            <TouchableOpacity
              style={[styles.socialButton, { borderColor: colors.border }]}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: "Main" }] })}
            >
              <Text style={{ color: colors.warmWhite, fontFamily: "Inter_500Medium", fontSize: 13 }}>G</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.socialButton, { borderColor: colors.border }]}
              onPress={() => navigation.reset({ index: 0, routes: [{ name: "Main" }] })}
            >
              <Text style={{ color: colors.warmWhite, fontFamily: "Inter_500Medium", fontSize: 13 }}>A</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={() => navigation.navigate("Interview")}>
            <Text style={[styles.ghostLink, { color: colors.mutedForeground }]}>
              first time? let's build your wardrobe
            </Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ImageBackground
        source={require("../../assets/images/wardrobe_door.png")}
        style={StyleSheet.absoluteFillObject}
        resizeMode="cover"
      >
        <View style={[StyleSheet.absoluteFillObject, styles.doorOverlay]} />
      </ImageBackground>

      <View style={[styles.doorContent, { paddingTop: topPad + 40 }]}>
        <Text style={styles.zoraEmbossed}>ZORA</Text>
      </View>

      <View style={styles.handleArea} {...panResponder.panHandlers}>
        <Animated.View
          style={[
            styles.handleContainer,
            {
              transform: [{ translateX: swipeAnim }],
            },
          ]}
        >
          <View style={[styles.brassHandle, { backgroundColor: colors.brass }]} />
        </Animated.View>

        <Text style={[styles.dragHint, { color: colors.mutedForeground }]}>
          drag to enter
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  doorOverlay: {
    backgroundColor: "rgba(13,11,8,0.3)",
  },
  interiorOverlay: {
    backgroundColor: "rgba(13,11,8,0.6)",
  },
  doorContent: {
    flex: 1,
    alignItems: "center",
  },
  zoraEmbossed: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    letterSpacing: 12,
    color: "rgba(201,168,76,0.25)",
  },
  handleArea: {
    position: "absolute",
    right: 48,
    top: "40%",
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  handleContainer: {
    alignItems: "center",
  },
  brassHandle: {
    width: 8,
    height: 80,
    borderRadius: 4,
    shadowColor: "#C9A84C",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
  },
  dragHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  loginPanel: {
    position: "absolute",
    alignSelf: "center",
    width: width * 0.82,
    backgroundColor: "rgba(20,15,10,0.88)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.35)",
    padding: 32,
    gap: 20,
    alignItems: "center",
  },
  zoraLogotype: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    letterSpacing: 8,
  },
  inputGroup: {
    width: "100%",
    gap: 20,
  },
  hairlineInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    width: "100%",
  },
  enterButton: {
    paddingVertical: 14,
    paddingHorizontal: 60,
    borderRadius: 24,
    width: "100%",
    alignItems: "center",
  },
  enterButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 3,
    textTransform: "uppercase",
  },
  socialRow: {
    flexDirection: "row",
    gap: 16,
  },
  socialButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  ghostLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
