import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  Dimensions,
  TouchableOpacity,
  Text,
  TextInput,
  ScrollView,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import { INTERVIEW_QUESTIONS, MOCK_USER } from "@/constants/mockData";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const { width } = Dimensions.get("window");

export default function InterviewScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [brandText, setBrandText] = useState("");
  const [showEnd, setShowEnd] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const currentQ = INTERVIEW_QUESTIONS[step];

  const animateTransition = (next: () => void) => {
    Animated.sequence([
      Animated.timing(fadeAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => {
      next();
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }).start();
    });
  };

  const toggleSelection = (qId: number, value: string) => {
    ReactNativeHapticFeedback.trigger("impactLight");
    const current = selections[qId] || [];
    const exists = current.includes(value);
    setSelections({
      ...selections,
      [qId]: exists ? current.filter((v) => v !== value) : [...current, value],
    });
  };

  const goNext = () => {
    if (step < INTERVIEW_QUESTIONS.length - 1) {
      animateTransition(() => setStep(step + 1));
    } else {
      animateTransition(() => setShowEnd(true));
    }
  };

  if (showEnd) {
    return (
      <View style={[styles.container, { paddingTop: topPad + 40, paddingBottom: bottomPad + 20 }]}>
        <Animated.View style={[styles.endCard, { opacity: fadeAnim }]}>
          <Text style={[styles.endTitle, { color: colors.brass }]}>your style DNA</Text>
          <Text style={[styles.endSub, { color: colors.warmWhite }]}>is ready</Text>

          <View style={styles.paletteRow}>
            {MOCK_USER.palette.map((c, i) => (
              <View key={i} style={[styles.paletteDot, { backgroundColor: c }]} />
            ))}
          </View>

          <View style={styles.keywordsRow}>
            {MOCK_USER.moodKeywords.map((k) => (
              <View key={k} style={[styles.keywordChip, { borderColor: colors.brass }]}>
                <Text style={[styles.keywordText, { color: colors.brass }]}>{k}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.dnaCaption, { color: colors.mutedForeground }]}>
            ZORA has analysed your style signature. Your wardrobe awaits.
          </Text>

          <TouchableOpacity
            style={[styles.enterBtn, { backgroundColor: colors.brass }]}
            onPress={() => navigation.reset({ index: 0, routes: [{ name: "Main" }] })}
            activeOpacity={0.8}
          >
            <Text style={[styles.enterBtnText, { color: colors.charcoal }]}>enter the wardrobe</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: topPad + 20, paddingBottom: bottomPad + 16 }]}>
      <View style={styles.header}>
        <Text style={[styles.interviewLabel, { color: colors.brass }]}>The Interview</Text>
        <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
          {step + 1} / {INTERVIEW_QUESTIONS.length}
        </Text>
      </View>

      <View style={styles.progressBar}>
        {INTERVIEW_QUESTIONS.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressDot,
              {
                backgroundColor: i <= step ? colors.brass : colors.border,
                width: i === step ? 24 : 8,
              },
            ]}
          />
        ))}
      </View>

      <Animated.View style={[styles.questionArea, { opacity: fadeAnim }]}>
        <Text style={[styles.questionText, { color: colors.warmWhite }]}>
          {currentQ.question}
        </Text>

        {currentQ.type === "tiles" && (
          <View style={styles.tilesGrid}>
            {currentQ.options?.map((opt) => {
              const isSelected = (selections[currentQ.id] || []).includes(opt.label);
              return (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => toggleSelection(currentQ.id, opt.label)}
                  activeOpacity={0.8}
                  style={[
                    styles.tile,
                    {
                      backgroundColor: opt.color,
                      borderColor: isSelected ? colors.brass : "transparent",
                      borderWidth: isSelected ? 2 : 0,
                    },
                  ]}
                >
                  {isSelected && (
                    <View style={[styles.tileOverlay]} />
                  )}
                  <Text style={styles.tileLabel}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {currentQ.type === "palette" && (
          <View style={styles.paletteGrid}>
            {currentQ.options?.map((opt) => {
              const isSelected = (selections[currentQ.id] || []).includes(opt.label);
              return (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => toggleSelection(currentQ.id, opt.label)}
                  activeOpacity={0.8}
                  style={[
                    styles.colorBlob,
                    {
                      backgroundColor: opt.color,
                      transform: [{ scale: isSelected ? 1.15 : 1 }],
                      borderWidth: isSelected ? 2 : 0,
                      borderColor: colors.brass,
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

        {currentQ.type === "icons" && (
          <View style={styles.iconsGrid}>
            {currentQ.options?.map((opt) => {
              const isSelected = (selections[currentQ.id] || []).includes(opt.label);
              return (
                <TouchableOpacity
                  key={opt.label}
                  onPress={() => toggleSelection(currentQ.id, opt.label)}
                  activeOpacity={0.8}
                  style={[
                    styles.iconTile,
                    {
                      backgroundColor: isSelected ? colors.brass : colors.surface,
                      borderColor: isSelected ? colors.brass : colors.border,
                    },
                  ]}
                >
                  <Feather
                    name={opt.icon as any}
                    size={22}
                    color={isSelected ? colors.charcoal : colors.mutedForeground}
                  />
                  <Text
                    style={[
                      styles.iconLabel,
                      { color: isSelected ? colors.charcoal : colors.mutedForeground },
                    ]}
                  >
                    {opt.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {currentQ.type === "text" && (
          <View style={styles.textInputArea}>
            <TextInput
              style={[
                styles.brandInput,
                { color: colors.warmWhite, borderBottomColor: colors.border },
              ]}
              placeholder="type a brand..."
              placeholderTextColor={colors.mutedForeground}
              value={brandText}
              onChangeText={setBrandText}
            />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandChips}>
              {currentQ.brands?.map((b) => (
                <TouchableOpacity
                  key={b}
                  onPress={() => {
                    ReactNativeHapticFeedback.trigger("impactLight");
                    setBrandText(b);
                  }}
                  style={[styles.brandChip, { borderColor: colors.border }]}
                >
                  <Text style={[styles.brandChipText, { color: colors.mutedForeground }]}>{b}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}
      </Animated.View>

      <TouchableOpacity
        onPress={goNext}
        style={[styles.nextButton, { backgroundColor: colors.brass }]}
        activeOpacity={0.8}
      >
        <Text style={[styles.nextButtonText, { color: colors.charcoal }]}>
          {step < INTERVIEW_QUESTIONS.length - 1 ? "continue" : "finish"}
        </Text>
        <Feather name="arrow-right" size={16} color={colors.charcoal} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#0D0B08",
    paddingHorizontal: 24,
    gap: 24,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  interviewLabel: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 16,
    letterSpacing: 1,
  },
  stepLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 1,
  },
  progressBar: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
  },
  progressDot: {
    height: 3,
    borderRadius: 2,
  },
  questionArea: {
    flex: 1,
    gap: 28,
  },
  questionText: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 30,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  tilesGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  tile: {
    width: (width - 60) / 2,
    height: 120,
    borderRadius: 4,
    justifyContent: "flex-end",
    padding: 14,
    overflow: "hidden",
  },
  tileOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(201,168,76,0.15)",
  },
  tileLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
    color: "#F5EDD6",
  },
  paletteGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 8,
  },
  colorBlob: {
    width: 60,
    height: 60,
    borderRadius: 30,
  },
  iconsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  iconTile: {
    width: (width - 72) / 3,
    height: 80,
    borderRadius: 4,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
  },
  iconLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 1,
  },
  textInputArea: {
    gap: 20,
  },
  brandInput: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  brandChips: {
    flexGrow: 0,
  },
  brandChip: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  brandChipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  nextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
  },
  nextButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  endCard: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 24,
    paddingHorizontal: 8,
  },
  endTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 16,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  endSub: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 42,
    letterSpacing: -1,
  },
  paletteRow: {
    flexDirection: "row",
    gap: 12,
  },
  paletteDot: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  keywordsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  keywordChip: {
    paddingVertical: 6,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  keywordText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  dnaCaption: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 20,
  },
  enterBtn: {
    paddingVertical: 14,
    paddingHorizontal: 40,
    borderRadius: 24,
    marginTop: 8,
  },
  enterBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
});
