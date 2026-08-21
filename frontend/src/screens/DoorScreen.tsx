import React, { useRef, useState } from "react";
import {
  View,
  StyleSheet,
  PanResponder,
  Animated,
  TouchableOpacity,
  Text,
  TextInput,
  ImageBackground,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useColors } from "@/hooks/useColors";
import { useAuth } from "@/context/AuthContext";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { SCREEN_WIDTH } from '@/constants/layout';

const width = SCREEN_WIDTH;

type Mode = "login" | "register";

export default function DoorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const { session, isLoaded, signUp, signIn } = useAuth();

  const [doorOpen, setDoorOpen] = useState(false);
  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loginAnim = useRef(new Animated.Value(0)).current;
  const swipeAnim = useRef(new Animated.Value(0)).current;

  // A returning user with a persisted session skips the door entirely.
  const hasCheckedSession = useRef(false);
  React.useEffect(() => {
    if (!isLoaded || hasCheckedSession.current) return;
    hasCheckedSession.current = true;
    if (session) {
      navigation.reset({ index: 0, routes: [{ name: "Main" }] });
    }
  }, [isLoaded, session, navigation]);

  const openDoor = useRef(() => {
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
      }).start();
    });
  }).current;

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
          openDoor();
        } else {
          // A tap (no meaningful travel) counts as "open" with a mouse, where
          // dragging is an unnatural affordance.
          if (Platform.OS === "web" && Math.abs(gestureState.dx) < 5) {
            openDoor();
            return;
          }
          Animated.spring(swipeAnim, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const switchMode = (next: Mode) => {
    ReactNativeHapticFeedback.trigger("impactLight");
    setMode(next);
    setError(null);
  };

  /**
   * Straight in, no account. Requests without a token resolve to the shared
   * demo wardrobe server-side, so a guest gets a populated app to look
   * around — and nothing they do is attributed to them.
   */
  const continueAsGuest = () => {
    ReactNativeHapticFeedback.trigger("impactLight");
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  const handleSubmit = async () => {
    setError(null);

    const trimmedEmail = email.trim();
    if (mode === "register") {
      if (!name.trim()) return setError("enter your name");
      if (!trimmedEmail) return setError("enter your email");
      if (password.length < 6) return setError("password must be at least 6 characters");
      if (password !== confirmPassword) return setError("passwords don't match");
    } else {
      if (!trimmedEmail || !password) return setError("enter your email and password");
    }

    setSubmitting(true);
    try {
      ReactNativeHapticFeedback.trigger("impactLight");
      if (mode === "register") {
        await signUp(name.trim(), trimmedEmail, password);
        navigation.reset({ index: 0, routes: [{ name: "Interview" }] });
      } else {
        await signIn(trimmedEmail, password);
        navigation.reset({ index: 0, routes: [{ name: "Main" }] });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

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
              top: topPad + 60,
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
          <Text style={[styles.panelSubtitle, { color: colors.mutedForeground }]}>
            {mode === "login" ? "welcome back" : "create your account"}
          </Text>

          <View style={styles.inputGroup}>
            {mode === "register" && (
              <TextInput
                style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
                placeholder="full name"
                placeholderTextColor={colors.mutedForeground}
                value={name}
                onChangeText={setName}
                autoCapitalize="words"
              />
            )}
            <TextInput
              style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
              placeholder="email"
              placeholderTextColor={colors.mutedForeground}
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TextInput
              style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
              placeholder="password"
              placeholderTextColor={colors.mutedForeground}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
            {mode === "register" && (
              <TextInput
                style={[styles.hairlineInput, { color: colors.warmWhite, borderBottomColor: colors.border }]}
                placeholder="confirm password"
                placeholderTextColor={colors.mutedForeground}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry
              />
            )}
          </View>

          {error && (
            <Text style={[styles.feedbackText, { color: colors.destructive }]}>{error}</Text>
          )}

          <TouchableOpacity
            style={[styles.enterButton, { backgroundColor: colors.brass, opacity: submitting ? 0.6 : 1 }]}
            onPress={handleSubmit}
            activeOpacity={0.8}
            disabled={submitting}
          >
            <Text style={[styles.enterButtonText, { color: colors.charcoal }]}>
              {submitting ? "please wait…" : mode === "login" ? "sign in" : "create account"}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => switchMode(mode === "login" ? "register" : "login")}>
            <Text style={[styles.ghostLink, { color: colors.mutedForeground }]}>
              {mode === "login"
                ? "first time? let's build your wardrobe"
                : "already have an account? sign in"}
            </Text>
          </TouchableOpacity>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <TouchableOpacity onPress={continueAsGuest} activeOpacity={0.8} style={styles.guestButton}>
            <Text style={[styles.guestText, { color: colors.brass }]}>continue as guest</Text>
            <Text style={[styles.guestHint, { color: colors.mutedForeground }]}>
              explore with a sample wardrobe · nothing is saved to you
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
          {Platform.OS === "web" ? "click or drag to enter" : "drag to enter"}
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
    maxWidth: 360,
    backgroundColor: "rgba(20,15,10,0.92)",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.35)",
    padding: 32,
    gap: 18,
    alignItems: "center",
  },
  zoraLogotype: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    letterSpacing: 8,
  },
  panelSubtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: -10,
  },
  inputGroup: {
    width: "100%",
    gap: 18,
  },
  hairlineInput: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    width: "100%",
  },
  feedbackText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 17,
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
  divider: {
    height: StyleSheet.hairlineWidth,
    width: "100%",
    marginVertical: 2,
  },
  guestButton: {
    alignItems: "center",
    gap: 4,
  },
  guestText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  guestHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 0.2,
    textAlign: "center",
  },
  ghostLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    textAlign: "center",
    lineHeight: 18,
  },
});
