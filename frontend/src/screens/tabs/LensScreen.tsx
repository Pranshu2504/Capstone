import React, { useState } from "react";
import {
  View,
  StyleSheet,
  TouchableOpacity,
  Text,
  ScrollView,
  TextInput,
  Platform,
  Modal,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import { MOCK_WARDROBE_ITEMS } from "@/constants/mockData";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const { width, height } = Dimensions.get("window");

type Mode = "mirror" | "link";

export default function LensScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState<Mode>("mirror");
  const [selectedOutfit, setSelectedOutfit] = useState<string[]>([]);
  const [linkUrl, setLinkUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [showResult, setShowResult] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const outfits = [
    { id: "effortless-monday", label: "effortless monday", items: ["1", "2", "3", "5"] },
    { id: "editorial-power", label: "editorial power", items: ["1", "3", "5"] },
    { id: "weekend-ease", label: "weekend ease", items: ["4", "6", "9"] },
    { id: "evening-look", label: "evening look", items: ["10", "7", "5"] },
  ];

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
              Mirror
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
        <View style={styles.mirrorMode}>
          <View style={[styles.bodyCanvas, { backgroundColor: colors.card }]}>
            <View style={[styles.bodyOutline, { borderColor: colors.border }]}>
              <View style={[styles.bodyHead, { borderColor: colors.border }]} />
              <View style={[styles.bodyTorso, { borderColor: colors.border }]}>
                {selectedOutfit.length > 0 && (
                  <View style={[styles.garmentOverlay, { backgroundColor: colors.midGround }]}>
                    <Text style={[styles.tryOnLabel, { color: colors.brass }]}>
                      {selectedOutfit.length} pieces
                    </Text>
                  </View>
                )}
              </View>
              <View style={styles.bodyLegs}>
                <View style={[styles.bodyLeg, { borderColor: colors.border }]} />
                <View style={[styles.bodyLeg, { borderColor: colors.border }]} />
              </View>
            </View>

            {selectedOutfit.length > 0 && (
              <View style={[styles.trackingLine, { borderColor: colors.brass }]} />
            )}

            <Text style={[styles.cameraHint, { color: colors.mutedForeground }]}>
              tap an outfit to try on
            </Text>
          </View>

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
                        const item = MOCK_WARDROBE_ITEMS.find((i) => i.id === itemId);
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

          {selectedOutfit.length > 0 && (
            <View style={[styles.interactionLayer, { bottom: bottomPad + 100 }]}>
              <TouchableOpacity
                style={[styles.askZoraButton, { backgroundColor: colors.brass }]}
                onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
              >
                <Feather name="mic" size={16} color={colors.charcoal} />
                <Text style={[styles.askZoraText, { color: colors.charcoal }]}>ask ZORA</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.linkMode, { paddingBottom: bottomPad + 100 }]}>
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
    fontSize: 12,
    letterSpacing: 0.5,
  },
  mirrorMode: {
    flex: 1,
    gap: 0,
  },
  bodyCanvas: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 20,
    borderRadius: 8,
    position: "relative",
    overflow: "hidden",
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
    fontSize: 11,
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
    fontSize: 11,
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
    fontSize: 10,
    lineHeight: 14,
  },
  interactionLayer: {
    position: "absolute",
    right: 24,
    alignItems: "center",
  },
  askZoraButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 20,
  },
  askZoraText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    letterSpacing: 1,
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
    fontSize: 12,
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
    fontSize: 12,
    letterSpacing: 0.5,
  },
  emptyLensState: {
    alignItems: "center",
    gap: 12,
  },
  emptyLensText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
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
    fontSize: 11,
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
    fontSize: 12,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
});
