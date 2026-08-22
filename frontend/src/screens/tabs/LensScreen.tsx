import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Image,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import { useOutfits, useWardrobe } from "@/api/hooks";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { pickImage, type PickedImage, type PickSource } from "@/utils/pickImage";
import type { ChainGarment } from "@/services/tryOnApi";
import { useTryOn } from "@/hooks/useTryOn";
import { checkTryOnService } from "@/services/tryOnApi";
import { SCREEN_WIDTH, SCREEN_HEIGHT, FLOATING_CTA_CLEARANCE } from '@/constants/layout';

const width = SCREEN_WIDTH;
const height = SCREEN_HEIGHT;

type Mode = "mirror" | "link";

export default function LensScreen() {
  const colors = useColors();
  const { data: wardrobeItems } = useWardrobe();
  const { data: savedOutfits } = useOutfits();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("mirror");
  const [selectedOutfit, setSelectedOutfit] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);

  // The two images the try-on needs. The garment may arrive pre-filled from
  // the Wardrobe screen's camera button.
  const [person, setPerson] = useState<PickedImage | null>(null);
  const [garment, setGarment] = useState<PickedImage | null>(null);
  /** A whole look handed over by the stylist, fitted one layer at a time. */
  const [chain, setChain] = useState<ChainGarment[] | null>(null);
  const [serviceNote, setServiceNote] = useState<string | null>(null);

  const tryOn = useTryOn();
  const resultUrl = tryOn.job?.images[0]?.url ?? null;

  // Accept a garment handed over by the Wardrobe screen.
  useEffect(() => {
    const incoming = route.params?.garment as PickedImage | undefined;
    if (incoming) {
      setGarment(incoming);
      setChain(null);
      navigation.setParams({ garment: undefined });
    }
  }, [route.params?.garment, navigation]);

  // Or a full look handed over by the stylist.
  useEffect(() => {
    const incoming = route.params?.garments as ChainGarment[] | undefined;
    if (incoming?.length) {
      setChain(incoming);
      // Show the first layer in the garment slot so the screen is not blank.
      setGarment({ uri: incoming[0].url, name: 'garment.jpg', type: 'image/jpeg' });
      navigation.setParams({ garments: undefined });
    }
  }, [route.params?.garments, navigation]);

  // Surface an unreachable service up front rather than at submit time.
  useEffect(() => {
    let cancelled = false;
    checkTryOnService().then(({ ready, credits, detail }) => {
      if (cancelled) return;
      if (!ready) setServiceNote(detail);
      else if (credits !== null && credits <= 5) {
        setServiceNote(`Only ${credits} FASHN credits left.`);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const choose = async (slot: "person" | "garment", source: PickSource) => {
    ReactNativeHapticFeedback.trigger("impactLight");
    const picked = await pickImage(source);
    if (!picked) return;

    if (slot === "person") setPerson(picked);
    else setGarment(picked);
    tryOn.reset();
  };

  const runTryOn = () => {
    if (!person || tryOn.isBusy) return;
    ReactNativeHapticFeedback.trigger("impactMedium");

    // A stylist hand-off carries several layers; each is its own prediction
    // and its own credit, so the button says how many before it spends them.
    if (chain?.length) {
      tryOn.runChain(person, chain, { mode: "performance" });
      return;
    }
    if (!garment) return;
    // performance mode keeps the try-on responsive at 1 credit per attempt.
    tryOn.run(person, garment, { category: "auto", mode: "performance" });
  };

  const canRun = Boolean(person && (garment || chain?.length)) && !tryOn.isBusy;
  const credits = chain?.length ?? 1;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  // Real saved outfits. The four hardcoded ones referenced item ids "1".."10"
  // that stopped existing the moment the wardrobe became real, so the swatches
  // silently rendered nothing.
  const outfits = savedOutfits.map((o) => ({
    id: o.id,
    label: o.headline,
    items: o.itemDetails.map((i) => i.id),
  }));

  const processLink = () => {
    if (!linkUrl.trim()) return;
    ReactNativeHapticFeedback.trigger("impactMedium");
    setProcessing(true);
    setTimeout(() => {
      setProcessing(false);
      setShowResult(true);
    }, 2200);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 8 },
        ]}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingBottom: 14 }}>
          <Text style={[styles.screenTitle, { color: colors.warmWhite }]}>The Lens</Text>
          <TouchableOpacity
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: "#141414",
              borderWidth: 0.5,
              borderColor: "#2A2A2A",
              alignItems: "center",
              justifyContent: "center",
            }}
            onPress={() => navigation.navigate("Identity")}
          >
            <Feather name="user" size={14} color={colors.brass} />
          </TouchableOpacity>
        </View>
        <View style={[styles.modeSwitcher, { backgroundColor: colors.card }]}>
          <TouchableOpacity
            onPress={() => setMode("mirror")}
            style={[
              styles.modeTab,
              mode === "mirror" && { backgroundColor: colors.brass },
            ]}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === "mirror" ? colors.charcoal : colors.mutedForeground },
              ]}
            >
              Try On
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setMode("link")}
            style={[
              styles.modeTab,
              mode === "link" && { backgroundColor: colors.brass },
            ]}
          >
            <Text
              style={[
                styles.modeTabText,
                { color: mode === "link" ? colors.charcoal : colors.mutedForeground },
              ]}
            >
              Link Lens
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {mode === "mirror" ? (
        <ScrollView
          style={styles.mirrorMode}
          contentContainerStyle={{ paddingBottom: bottomPad + FLOATING_CTA_CLEARANCE }}
          showsVerticalScrollIndicator={false}
        >
          {/* The generated try-on, or a placeholder until one exists. */}
          <View style={[styles.bodyCanvas, { backgroundColor: colors.card }]}>
            {resultUrl ? (
              <Image source={{ uri: resultUrl }} style={styles.resultImage} resizeMode="contain" />
            ) : (
              <View style={styles.busyState}>
                {tryOn.isBusy ? (
                  <ActivityIndicator color={colors.brass} />
                ) : (
                  <Feather name="user" size={36} color={colors.border} />
                )}
                <Text style={[styles.cameraHint, { color: colors.mutedForeground, marginTop: 12 }]}>
                  {tryOn.isBusy
                    ? tryOn.progressLabel
                    : "add both photos to see yourself wearing it"}
                </Text>
              </View>
            )}
          </View>

          {/* Two input slots: the wearer, and the garment. */}
          <View style={styles.slotRow}>
            {([
              { key: "person", label: "your photo", value: person, icon: "user" },
              { key: "garment", label: "the garment", value: garment, icon: "shopping-bag" },
            ] as const).map((slot) => (
              <View
                key={slot.key}
                style={[
                  styles.slot,
                  { backgroundColor: colors.card, borderColor: slot.value ? colors.brass : colors.border },
                ]}
              >
                {slot.value ? (
                  <Image source={{ uri: slot.value.uri }} style={styles.slotThumb} resizeMode="cover" />
                ) : (
                  <View style={styles.slotEmpty}>
                    <Feather name={slot.icon} size={22} color={colors.border} />
                  </View>
                )}

                <Text style={[styles.slotLabel, { color: colors.warmWhite }]}>{slot.label}</Text>

                <View style={styles.slotActions}>
                  <TouchableOpacity
                    style={[styles.slotButton, { backgroundColor: colors.brass }]}
                    onPress={() => choose(slot.key, "camera")}
                  >
                    <Feather name="camera" size={13} color={colors.charcoal} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.slotButton,
                      {
                        backgroundColor: colors.surface,
                        borderWidth: StyleSheet.hairlineWidth,
                        borderColor: colors.border,
                      },
                    ]}
                    onPress={() => choose(slot.key, "gallery")}
                  >
                    <Feather name="image" size={13} color={colors.mutedForeground} />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>

          {(tryOn.error || serviceNote) && (
            <View style={[styles.noticeBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Feather
                name={tryOn.error ? "alert-circle" : "info"}
                size={13}
                color={tryOn.error ? "#E5843F" : colors.mutedForeground}
              />
              <Text style={[styles.noticeText, { color: colors.mutedForeground }]}>
                {tryOn.error ?? serviceNote}
              </Text>
            </View>
          )}

          <TouchableOpacity
            style={[
              styles.tryLinkButton,
              {
                marginHorizontal: 20,
                backgroundColor: canRun ? colors.brass : colors.card,
                borderColor: canRun ? colors.brass : colors.border,
              },
            ]}
            onPress={runTryOn}
            disabled={!canRun}
          >
            <Text
              style={[styles.tryLinkText, { color: canRun ? colors.charcoal : colors.mutedForeground }]}
            >
              {tryOn.isBusy
                ? tryOn.progressLabel || "working…"
                : resultUrl
                  ? "try again"
                  : credits > 1
                    ? `try the look on · ${credits} credits`
                    : "try it on"}
            </Text>
          </TouchableOpacity>

          {!!outfits.length && (
          <View style={styles.outfitFilmStrip}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filmStripContent}
            >
              {outfits.map((outfit) => {
                const isActive = JSON.stringify(outfit.items) === JSON.stringify(selectedOutfit);
                return (
                  <TouchableOpacity
                    key={outfit.id}
                    onPress={() => {
                      ReactNativeHapticFeedback.trigger("impactLight");
                      setSelectedOutfit(isActive ? [] : outfit.items);
                    }}
                    style={[
                      styles.filmCard,
                      {
                        backgroundColor: colors.card,
                        borderColor: isActive ? colors.brass : colors.border,
                        borderWidth: isActive ? 2 : StyleSheet.hairlineWidth,
                      },
                    ]}
                  >
                    <View style={styles.filmCardSwatches}>
                      {outfit.items.slice(0, 3).map((itemId) => {
                        const item = wardrobeItems.find((i) => i.id === itemId);
                        return item ? (
                          <View
                            key={itemId}
                            style={[styles.filmSwatch, { backgroundColor: item.color }]}
                          />
                        ) : null;
                      })}
                    </View>
                    <Text style={[styles.filmLabel, { color: colors.warmWhite }]} numberOfLines={2}>
                      {outfit.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
          )}
        </ScrollView>
      ) : (
        <View style={[styles.linkMode, { paddingBottom: bottomPad + FLOATING_CTA_CLEARANCE }]}>
          <Text style={[styles.linkTitle, { color: colors.warmWhite }]}>
            paste a link to try it on
          </Text>
          <Text style={[styles.linkSub, { color: colors.mutedForeground }]}>
            works with Myntra, Zara, H&M, ASOS, Uniqlo & more
          </Text>

          <View style={[styles.urlBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="link" size={16} color={colors.mutedForeground} />
            <TextInput
              style={[styles.urlInput, { color: colors.warmWhite }]}
              placeholder="https://..."
              placeholderTextColor={colors.mutedForeground}
              value={linkUrl}
              onChangeText={setLinkUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {linkUrl.length > 0 && (
              <TouchableOpacity onPress={() => setLinkUrl("")}>
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}
          </View>

          <TouchableOpacity
            style={[
              styles.tryLinkButton,
              {
                backgroundColor: linkUrl.trim() ? colors.brass : colors.card,
                borderColor: linkUrl.trim() ? colors.brass : colors.border,
              },
            ]}
            onPress={processLink}
            disabled={!linkUrl.trim() || processing}
          >
            {processing ? (
              <Text style={[styles.tryLinkText, { color: colors.charcoal }]}>analysing...</Text>
            ) : (
              <Text
                style={[
                  styles.tryLinkText,
                  { color: linkUrl.trim() ? colors.charcoal : colors.mutedForeground },
                ]}
              >
                try it on
              </Text>
            )}
          </TouchableOpacity>

          <View style={[styles.processingVisual, { backgroundColor: colors.card }]}>
            {processing ? (
              <View style={styles.processingAnimation}>
                <View style={[styles.processingDot, { backgroundColor: colors.brass }]} />
                <Text style={[styles.processingText, { color: colors.mutedForeground }]}>
                  extracting garment from page...
                </Text>
              </View>
            ) : (
              <View style={styles.emptyLensState}>
                <Feather name="link-2" size={32} color={colors.border} />
                <Text style={[styles.emptyLensText, { color: colors.mutedForeground }]}>
                  your try-on preview will appear here
                </Text>
              </View>
            )}
          </View>
        </View>
      )}

      <Modal visible={showResult} transparent animationType="slide">
        <TouchableOpacity
          style={styles.resultBackdrop}
          activeOpacity={1}
          onPress={() => setShowResult(false)}
        />
        <View style={[styles.resultSheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.sheetHandle} />
          <Text style={[styles.resultTitle, { color: colors.warmWhite }]}>try-on result</Text>
          <View style={[styles.resultItem, { borderColor: colors.border }]}>
            <View style={[styles.resultSwatch, { backgroundColor: colors.midGround }]} />
            <View style={styles.resultInfo}>
              <Text style={[styles.resultItemName, { color: colors.warmWhite }]}>
                Imported Piece
              </Text>
              <Text style={[styles.resultItemSub, { color: colors.mutedForeground }]}>
                from link
              </Text>
            </View>
            <View style={styles.resultActions}>
              <TouchableOpacity
                style={[styles.resultAction, { backgroundColor: colors.brass }]}
                onPress={() => setShowResult(false)}
              >
                <Feather name="star" size={14} color={colors.charcoal} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.resultAction, { backgroundColor: colors.surface }]}
                onPress={() => setShowResult(false)}
              >
                <Feather name="x" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: colors.brass }]}
            onPress={() => setShowResult(false)}
          >
            <Text style={[styles.saveButtonText, { color: colors.charcoal }]}>save to wardrobe</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  screenTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 22,
    letterSpacing: -0.3,
  },
  modeSwitcher: {
    flexDirection: "row",
    borderRadius: 20,
    padding: 3,
    alignSelf: "flex-start",
  },
  modeTab: {
    paddingVertical: 7,
    paddingHorizontal: 18,
    borderRadius: 17,
  },
  modeTabText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  mirrorMode: {
    flex: 1,
    gap: 0,
  },
  bodyCanvas: {
    // Fixed rather than flex: this now sits inside a ScrollView.
    height: height * 0.46,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    borderRadius: 8,
    position: "relative",
    overflow: "hidden",
  },
  resultImage: {
    width: "100%",
    height: "100%",
  },
  busyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  slotRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  slot: {
    flex: 1,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 10,
    alignItems: "center",
    gap: 8,
  },
  slotThumb: {
    width: "100%",
    height: 92,
    borderRadius: 6,
  },
  slotEmpty: {
    width: "100%",
    height: 92,
    alignItems: "center",
    justifyContent: "center",
  },
  slotLabel: {
    fontSize: 13,
    letterSpacing: 0.3,
  },
  slotActions: {
    flexDirection: "row",
    gap: 8,
  },
  slotButton: {
    width: 34,
    height: 28,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    padding: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    lineHeight: 15,
  },
  bodyOutline: {
    alignItems: "center",
    gap: 4,
  },
  bodyHead: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
  },
  bodyTorso: {
    width: 90,
    height: 120,
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  garmentOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  tryOnLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  bodyLegs: {
    flexDirection: "row",
    gap: 6,
  },
  bodyLeg: {
    width: 38,
    height: 80,
    borderRadius: 4,
    borderWidth: 1,
  },
  trackingLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 1.5,
    borderRadius: 8,
    opacity: 0.3,
  },
  cameraHint: {
    position: "absolute",
    bottom: 16,
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 1,
  },
  outfitFilmStrip: {
    height: 120,
    justifyContent: "center",
  },
  filmStripContent: {
    paddingHorizontal: 20,
    gap: 10,
    alignItems: "center",
  },
  filmCard: {
    width: 100,
    height: 96,
    borderRadius: 4,
    padding: 10,
    gap: 8,
  },
  filmCardSwatches: {
    flexDirection: "row",
    gap: 4,
  },
  filmSwatch: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  filmLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 14,
  },
  interactionLayer: {
    position: "absolute",
    right: 24,
    alignItems: "center",
  },
  linkMode: {
    flex: 1,
    paddingHorizontal: 20,
    gap: 20,
    paddingTop: 8,
  },
  linkTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 26,
    lineHeight: 34,
  },
  linkSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  urlBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  urlInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  tryLinkButton: {
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
    borderWidth: 1,
  },
  tryLinkText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  processingVisual: {
    flex: 1,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  processingAnimation: {
    alignItems: "center",
    gap: 14,
  },
  processingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  processingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    letterSpacing: 0.5,
  },
  emptyLensState: {
    alignItems: "center",
    gap: 12,
  },
  emptyLensText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    maxWidth: 200,
    lineHeight: 18,
  },
  resultBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  resultSheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 20,
  },
  sheetHandle: {
    width: 36,
    height: 3,
    backgroundColor: "rgba(201,168,76,0.3)",
    borderRadius: 2,
    alignSelf: "center",
  },
  resultTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
  },
  resultItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  resultSwatch: {
    width: 50,
    height: 60,
    borderRadius: 4,
  },
  resultInfo: {
    flex: 1,
  },
  resultItemName: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
  },
  resultItemSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  resultActions: {
    flexDirection: "row",
    gap: 8,
  },
  resultAction: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  saveButton: {
    paddingVertical: 14,
    borderRadius: 24,
    alignItems: "center",
  },
  saveButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
