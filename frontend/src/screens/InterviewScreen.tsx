import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  TextInput,
  ScrollView,
  Image,
  Animated,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import { INTERVIEW_QUESTIONS } from "@/constants/mockData";
import { useUpdateProfile, useUploadGarments } from "@/api/hooks";
import { pickImages, type PickSource } from "@/utils/pickImage";
import type { ApiWardrobeItem } from "@/api/types";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { SCREEN_WIDTH } from '@/constants/layout';

const width = SCREEN_WIDTH;

export default function InterviewScreen() {
  const colors = useColors();
  const updateProfile = useUpdateProfile();
  const uploadGarments = useUploadGarments();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();

  const [step, setStep] = useState(0);
  const [selections, setSelections] = useState<Record<number, string[]>>({});
  const [brandText, setBrandText] = useState("");
  // questions → wardrobe (optional photo upload) → done (the style DNA card)
  const [phase, setPhase] = useState<"questions" | "wardrobe" | "done">("questions");
  const [added, setAdded] = useState<ApiWardrobeItem[]>([]);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Clamped so an out-of-range step can never blank the screen mid-flow.
  const currentQ = INTERVIEW_QUESTIONS[Math.min(step, INTERVIEW_QUESTIONS.length - 1)];

  // "Your style DNA" is built entirely from this session's answers — not
  // whatever profile happened to be loaded — so it's correct offline and
  // right after a fresh sign-up alike.
  const moodQuestion = INTERVIEW_QUESTIONS.find((q) => q.type === "tiles");
  const paletteQuestion = INTERVIEW_QUESTIONS.find((q) => q.type === "palette");
  const moodKeywords = moodQuestion ? selections[moodQuestion.id] ?? [] : [];
  const paletteColors = paletteQuestion
    ? (selections[paletteQuestion.id] ?? []).flatMap((label) => {
        const opt = paletteQuestion.options?.find((o) => o.label === label);
        return opt && "color" in opt ? [opt.color as string] : [];
      })
    : [];

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

  /** Straight into the app. The interview only tunes recommendations, so
   *  refusing it should cost nothing but a less personal first suggestion. */
  const enterWardrobe = () => {
    ReactNativeHapticFeedback.trigger("impactLight");
    navigation.reset({ index: 0, routes: [{ name: "Main" }] });
  };

  const goNext = () => {
    if (step < INTERVIEW_QUESTIONS.length - 1) {
      animateTransition(() => setStep(step + 1));
    } else {
      // Best-effort: the DNA card below reads from local state either way,
      // so a flaky connection here doesn't block finishing the interview.
      updateProfile.mutate({
        moodKeywords,
        palette: paletteColors,
        favoritesBrand: brandText.trim() || undefined,
      });
      animateTransition(() => setPhase("wardrobe"));
    }
  };

  const addPhotos = async (source: PickSource) => {
    setUploadError(null);
    const picked = await pickImages(source);
    if (!picked.length) return;

    try {
      const items = await uploadGarments.mutateAsync(picked);
      ReactNativeHapticFeedback.trigger("notificationSuccess");
      setAdded((prev) => [...prev, ...items]);
    } catch (err) {
      ReactNativeHapticFeedback.trigger("notificationError");
      setUploadError(err instanceof Error ? err.message : "upload failed");
    }
  };

  if (phase === "wardrobe") {
    const busy = uploadGarments.isPending;
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: topPad + 20, paddingBottom: bottomPad + 16 },
        ]}
      >
        <View style={styles.header}>
          <Text style={[styles.interviewLabel, { color: colors.brass }]}>Your Wardrobe</Text>
          <TouchableOpacity onPress={enterWardrobe} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>skip</Text>
          </TouchableOpacity>
        </View>

        <Text style={[styles.questionText, { color: colors.warmWhite }]}>
          photograph a few{"\n"}of your clothes
        </Text>
        <Text style={[styles.dnaCaption, { color: colors.mutedForeground, textAlign: "left", paddingHorizontal: 0 }]}>
          ZORA reads each photo — colour, fabric, how dressy it is — and styles you from
          what you actually own. Add more any time from the wardrobe.
        </Text>

        <View style={styles.uploadRow}>
          <TouchableOpacity
            style={[styles.uploadBtn, { backgroundColor: colors.brass, opacity: busy ? 0.6 : 1 }]}
            onPress={() => addPhotos("camera")}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Feather name="camera" size={15} color={colors.charcoal} />
            <Text style={[styles.uploadBtnText, { color: colors.charcoal }]}>take a photo</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.uploadBtnGhost,
              { borderColor: colors.border, backgroundColor: colors.surface, opacity: busy ? 0.6 : 1 },
            ]}
            onPress={() => addPhotos("gallery")}
            disabled={busy}
            activeOpacity={0.85}
          >
            <Feather name="image" size={15} color={colors.brass} />
            <Text style={[styles.uploadBtnText, { color: colors.warmWhite }]}>upload photos</Text>
          </TouchableOpacity>
        </View>

        {busy && (
          <Text style={[styles.uploadStatus, { color: colors.brass }]}>
            reading your photos…
          </Text>
        )}
        {!!uploadError && (
          <Text style={[styles.uploadStatus, { color: colors.destructive }]}>{uploadError}</Text>
        )}

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.addedGrid}>
            {added.map((item) => (
              <View key={item.id} style={[styles.addedCard, { borderColor: colors.border }]}>
                {item.image ? (
                  <Image source={{ uri: item.image }} style={styles.addedPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.addedPhoto, { backgroundColor: item.color }]} />
                )}
                <Text style={[styles.addedName, { color: colors.warmGray }]} numberOfLines={1}>
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>

        <TouchableOpacity
          onPress={() => animateTransition(() => setPhase("done"))}
          style={[styles.nextButton, { backgroundColor: added.length ? colors.brass : colors.surface }]}
          activeOpacity={0.85}
        >
          <Text
            style={[
              styles.nextButtonText,
              { color: added.length ? colors.charcoal : colors.mutedForeground },
            ]}
          >
            {added.length ? `continue with ${added.length}` : "I'll add these later"}
          </Text>
          <Feather
            name="arrow-right"
            size={16}
            color={added.length ? colors.charcoal : colors.mutedForeground}
          />
        </TouchableOpacity>
      </View>
    );
  }

  if (phase === "done") {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: topPad + 40, paddingBottom: bottomPad + 20 },
        ]}
      >
        <Animated.View style={[styles.endCard, { opacity: fadeAnim }]}>
          <Text style={[styles.endTitle, { color: colors.brass }]}>your style DNA</Text>
          <Text style={[styles.endSub, { color: colors.warmWhite }]}>is ready</Text>

          <View style={styles.paletteRow}>
            {paletteColors.map((c, i) => (
              <View key={i} style={[styles.paletteDot, { backgroundColor: c }]} />
            ))}
          </View>

          <View style={styles.keywordsRow}>
            {moodKeywords.map((k) => (
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
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: topPad + 20, paddingBottom: bottomPad + 16 },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.interviewLabel, { color: colors.brass }]}>The Interview</Text>
        <View style={styles.headerRight}>
          <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
            {step + 1} / {INTERVIEW_QUESTIONS.length}
          </Text>
          <TouchableOpacity onPress={enterWardrobe} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Text style={[styles.skipLink, { color: colors.mutedForeground }]}>skip</Text>
          </TouchableOpacity>
        </View>
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
                      backgroundColor: 'color' in opt ? opt.color : "transparent",
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
                      backgroundColor: 'color' in opt ? opt.color : "#000",
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
                    name={('icon' in opt ? opt.icon : "help-circle") as any}
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
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  skipLink: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 1,
    textDecorationLine: "underline",
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
  uploadRow: {
    flexDirection: "row",
    gap: 10,
  },
  uploadBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 24,
  },
  uploadBtnGhost: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 24,
    borderWidth: 1,
  },
  uploadBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  uploadStatus: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 0.3,
  },
  addedGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  addedCard: {
    width: (width - 58) / 3,
    borderRadius: 6,
    borderWidth: 1,
    overflow: "hidden",
  },
  addedPhoto: {
    width: "100%",
    height: 88,
  },
  addedName: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    padding: 6,
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
