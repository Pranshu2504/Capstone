import React, { useState } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Platform,
  Dimensions,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { MOCK_USER } from "@/constants/mockData";

const { width } = Dimensions.get("window");

const RADAR_DIMS = [
  { label: "Formal", opposite: "Casual", value: 0.72 },
  { label: "Minimal", opposite: "Expressive", value: 0.65 },
  { label: "Neutral", opposite: "Bold", value: 0.55 },
  { label: "Classic", opposite: "Trendy", value: 0.60 },
  { label: "Practical", opposite: "Decorative", value: 0.45 },
  { label: "Everyday", opposite: "Occasion", value: 0.58 },
];

const YEAR_IN_STYLE = [
  {
    label: "most-worn piece",
    value: "Black Cashmere Coat",
    stat: "20×",
    color: "#1A1A2A",
    copy: "worn through every season",
  },
  {
    label: "most repeated outfit",
    value: "Effortless Mondays",
    stat: "8×",
    color: "#1A2218",
    copy: "because some looks just work",
  },
  {
    label: "boldest look",
    value: "The Amber Statement",
    stat: "Apr 13",
    color: "#201A08",
    copy: "you went for it",
  },
  {
    label: "the surprise",
    value: "Linen Trousers",
    stat: "12× worn",
    color: "#201818",
    copy: "bought on a whim, wore constantly",
  },
];

const INITIAL_SETTINGS = [
  { icon: "sliders", label: "Style Preferences", status: "Effortless · Sharp · Powerful" },
  { icon: "user", label: "Size Profile", status: "S / EU 36 / 165cm" },
  { icon: "calendar", label: "Calendar Sync", status: "Not synced" },
  { icon: "monitor", label: "Mirror Connect", status: "Not connected" },
  { icon: "lock", label: "Privacy", status: "Friends only" },
  { icon: "at-sign", label: "Social Accounts", status: "No accounts linked" },
];

export default function IdentityScreen() {
  const insets = useSafeAreaInsets();
  const [settingsModal, setSettingsModal] = useState<string | null>(null);
  const [settingsData, setSettingsData] = useState(INITIAL_SETTINGS);
  const [isLinking, setIsLinking] = useState(false);
  const [linkSuccess, setLinkSuccess] = useState(false);

  const handleLinkAccount = () => {
    if (!settingsModal) return;
    ReactNativeHapticFeedback.trigger("impactMedium");
    setIsLinking(true);
    
    setTimeout(() => {
      ReactNativeHapticFeedback.trigger("notificationSuccess");
      setIsLinking(false);
      setLinkSuccess(true);
      
      setSettingsData(prev => prev.map(item => {
        if (item.label === settingsModal) {
          let newStatus = "Connected";
          if (settingsModal === "Social Accounts") newStatus = "Instagram & TikTok linked";
          if (settingsModal === "Calendar Sync") newStatus = "Google Calendar synced";
          if (settingsModal === "Mirror Connect") newStatus = "ZORA Mirror Active";
          return { ...item, status: newStatus };
        }
        return item;
      }));
    }, 2000);
  };

  const closeSettings = () => {
    setSettingsModal(null);
    setTimeout(() => {
      setLinkSuccess(false);
      setIsLinking(false);
    }, 300);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const radarSize = width - 80;
  const radarCenter = radarSize / 2;
  const radarRadius = radarSize * 0.38;

  const getRadarPoint = (index: number, value: number, total: number, r: number) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return {
      x: radarCenter + Math.cos(angle) * r * value,
      y: radarCenter + Math.sin(angle) * r * value,
    };
  };

  const getAxisPoint = (index: number, total: number, r: number) => {
    const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
    return {
      x: radarCenter + Math.cos(angle) * r,
      y: radarCenter + Math.sin(angle) * r,
    };
  };

  const mostLoved = [
    { name: "Black Cashmere Coat", color: "#1C1C1C", times: 20 },
    { name: "Chelsea Boots", color: "#1C1C1C", times: 18 },
    { name: "Leather Oxford Shoes", color: "#3B2A1A", times: 15 },
  ];

  const dusty = [
    { name: "Oversized Blazer", color: "#6B5B4E", times: 1 },
    { name: "Linen Wide-Leg Pants", color: "#C8BCA8", times: 3 },
    { name: "Merino Turtleneck", color: "#8B8682", times: 2 },
  ];

  return (
    <View style={[styles.container]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.screenTitle}>The Identity</Text>
        <TouchableOpacity style={styles.iconBtn}>
          <Feather name="share-2" size={14} color="#C9A84C" />
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
      >
        <View style={styles.styleCard}>
          <View style={styles.colorStripes}>
            {MOCK_USER.palette.map((color, i) => (
              <View key={i} style={[styles.colorStripe, { backgroundColor: color }]} />
            ))}
          </View>
          <View style={styles.styleCardContent}>
            <Text style={styles.styleCardKeyword}>Effortless</Text>
            <View style={styles.styleCardStats}>
              <View style={styles.statItem}>
                <Text style={styles.statNum}>47</Text>
                <Text style={styles.statLabel}>items</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>23</Text>
                <Text style={styles.statLabel}>outfits</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <Text style={styles.statNum}>89%</Text>
                <Text style={styles.statLabel}>utilised</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.exportBtn}
              onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
            >
              <Feather name="download" size={11} color="#C9A84C" />
              <Text style={styles.exportBtnText}>export style card</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.styleCardOverlay} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Style DNA</Text>
            <Text style={styles.sectionSub}>updated monthly</Text>
          </View>
          <View style={[styles.radarContainer, { height: radarSize }]}>
            <View style={styles.radarBackground}>
              {[0.25, 0.5, 0.75, 1].map((scale) => (
                <View
                  key={scale}
                  style={[
                    styles.radarRing,
                    {
                      width: radarRadius * 2 * scale,
                      height: radarRadius * 2 * scale,
                      borderRadius: radarRadius * scale,
                    },
                  ]}
                />
              ))}
            </View>

            {RADAR_DIMS.map((dim, i) => {
              const axisEnd = getAxisPoint(i, RADAR_DIMS.length, radarRadius);
              const labelPoint = getAxisPoint(i, RADAR_DIMS.length, radarRadius + 28);
              const oppPoint = getAxisPoint(i, RADAR_DIMS.length, radarRadius + 28);
              return (
                <React.Fragment key={i}>
                  <View
                    style={[
                      styles.radarAxis,
                      {
                        position: "absolute",
                        left: radarCenter,
                        top: radarCenter,
                        width: radarRadius,
                        height: 0.5,
                        transformOrigin: "left center",
                        transform: [
                          { rotate: `${(i / RADAR_DIMS.length) * 360 - 90}deg` },
                        ],
                      },
                    ]}
                  />
                  <Text
                    style={[
                      styles.radarLabel,
                      {
                        position: "absolute",
                        left: labelPoint.x - 30,
                        top: labelPoint.y - 8,
                      },
                    ]}
                  >
                    {dim.label}
                  </Text>
                </React.Fragment>
              );
            })}

            <View style={styles.radarFill}>
              {RADAR_DIMS.map((dim, i) => {
                const pt = getRadarPoint(i, dim.value, RADAR_DIMS.length, radarRadius);
                const size = 8;
                return (
                  <View
                    key={i}
                    style={[
                      styles.radarDot,
                      {
                        position: "absolute",
                        left: pt.x - size / 2,
                        top: pt.y - size / 2,
                        width: size,
                        height: size,
                      },
                    ]}
                  />
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Reusability</Text>
            <View style={styles.sustainRow}>
              <Feather name="wind" size={13} color="#6A9A6A" />
              <Text style={styles.sustainScore}>89%</Text>
              <Text style={styles.sustainLabel}>wardrobe value unlocked</Text>
            </View>
          </View>

          <Text style={[styles.subLabel, { color: "#C9A84C" }]}>most loved</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemRail}>
            {mostLoved.map((item, i) => (
              <View key={i} style={[styles.reusabilityCard, styles.lovedCard]}>
                <View style={[styles.reusabilityBlock, { backgroundColor: item.color }]} />
                <Text style={styles.reusabilityName} numberOfLines={2}>{item.name}</Text>
                <Text style={styles.reusabilityTimes}>{item.times}× worn</Text>
              </View>
            ))}
          </ScrollView>

          <Text style={[styles.subLabel, { color: "#A3A3A3" }]}>collecting dust</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.itemRail}>
            {dusty.map((item, i) => (
              <View key={i} style={[styles.reusabilityCard, styles.dustyCard]}>
                <View style={[styles.reusabilityBlock, { backgroundColor: item.color, opacity: 0.5 }]} />
                <Text style={[styles.reusabilityName, { opacity: 0.6 }]} numberOfLines={2}>
                  {item.name}
                </Text>
                <Text style={[styles.reusabilityTimes, { color: "#444" }]}>{item.times}× worn</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Year in Style</Text>
            <Text style={styles.sectionSub}>2025 — 2026</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.yearRail}>
            {YEAR_IN_STYLE.map((card, i) => (
              <View key={i} style={[styles.yearCard, { backgroundColor: card.color }]}>
                <Text style={styles.yearCardLabel}>{card.label}</Text>
                <Text style={styles.yearCardStat}>{card.stat}</Text>
                <Text style={styles.yearCardValue}>{card.value}</Text>
                <Text style={styles.yearCardCopy}>{card.copy}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Settings</Text>
          <View style={styles.settingsTiles}>
            {settingsData.map((tile) => (
              <TouchableOpacity
                key={tile.label}
                onPress={() => {
                  ReactNativeHapticFeedback.trigger("impactLight");
                  setSettingsModal(tile.label);
                }}
                style={styles.settingsTile}
              >
                <View style={styles.settingsTileIcon}>
                  <Feather name={tile.icon as any} size={16} color="#C9A84C" />
                </View>
                <Text style={styles.settingsTileLabel}>{tile.label}</Text>
                <Text style={styles.settingsTileStatus} numberOfLines={1}>{tile.status}</Text>
                <Feather name="chevron-right" size={13} color="#777" style={{ marginLeft: "auto" }} />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      <Modal visible={!!settingsModal} transparent animationType="slide">
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={closeSettings}
        />
        <View style={styles.settingsSheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.settingsSheetTitle}>{settingsModal}</Text>
          <View style={styles.settingsSheetBody}>
            <Text style={styles.settingsSheetNote}>
              {settingsModal === "Calendar Sync"
                ? "Seamlessly integrate your daily agenda to let ZORA suggest event-appropriate outfits."
                : settingsModal === "Mirror Connect"
                ? "Connect ZORA to a physical smart mirror device for hands-free 3D outfit previews."
                : settingsModal === "Social Accounts"
                ? "Link your social media to let ZORA analyze to your aesthetic pins and saved posts."
                : "Adjust your preferences for this section."}
            </Text>

            {(settingsModal === "Calendar Sync" || settingsModal === "Mirror Connect" || settingsModal === "Social Accounts") && (
              <TouchableOpacity
                style={[
                  styles.linkButton,
                  (isLinking || linkSuccess) && { backgroundColor: "#C9A84C", borderColor: "#C9A84C" }
                ]}
                onPress={handleLinkAccount}
                disabled={isLinking || linkSuccess}
              >
                <Text style={[
                  styles.linkButtonText,
                  (isLinking || linkSuccess) && { color: "#0A0A0A" }
                ]}>
                  {isLinking ? "authenticating securely..." : linkSuccess ? "successfully linked" : "connect new account"}
                </Text>
              </TouchableOpacity>
            )}

          </View>
          <TouchableOpacity
            style={styles.settingsSheetClose}
            onPress={closeSettings}
          >
            <Text style={styles.settingsSheetCloseText}>done</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#090909",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  screenTitle: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 22,
    color: "#F0ECE4",
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#141414",
    borderWidth: 0.5,
    borderColor: "#2A2A2A",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 28,
  },
  styleCard: {
    height: 200,
    borderRadius: 18,
    overflow: "hidden",
    position: "relative",
  },
  colorStripes: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: "row",
  },
  colorStripe: {
    flex: 1,
  },
  styleCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(9,9,9,0.55)",
  },
  styleCardContent: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 20,
    gap: 12,
  },
  styleCardKeyword: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 38,
    color: "#F0ECE4",
    letterSpacing: -1,
  },
  styleCardStats: {
    flexDirection: "row",
    alignItems: "center",
    gap: 0,
  },
  statItem: {
    alignItems: "center",
    gap: 1,
    paddingHorizontal: 12,
  },
  statNum: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 16,
    color: "#F0ECE4",
  },
  statLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "rgba(240,236,228,0.5)",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  statDivider: {
    width: 0.5,
    height: 28,
    backgroundColor: "rgba(240,236,228,0.2)",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.4)",
    backgroundColor: "rgba(201,168,76,0.1)",
  },
  exportBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#C9A84C",
    letterSpacing: 0.5,
  },
  section: {
    gap: 14,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
  },
  sectionTitle: {
    fontFamily: "CormorantGaramond_600SemiBold",
    fontSize: 20,
    color: "#F0ECE4",
    letterSpacing: 0.3,
  },
  sectionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    letterSpacing: 0.5,
  },
  radarContainer: {
    width: width - 40,
    position: "relative",
    alignSelf: "center",
    alignItems: "center",
    justifyContent: "center",
  },
  radarBackground: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  radarRing: {
    position: "absolute",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.12)",
  },
  radarAxis: {
    backgroundColor: "rgba(201,168,76,0.15)",
  },
  radarLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
    width: 60,
    textAlign: "center",
  },
  radarFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  radarDot: {
    borderRadius: 4,
    backgroundColor: "#C9A84C",
  },
  sustainRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  sustainScore: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: "#6A9A6A",
  },
  sustainLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  subLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  itemRail: {
    marginHorizontal: -20,
  },
  reusabilityCard: {
    width: 110,
    borderRadius: 14,
    borderWidth: 0.5,
    padding: 10,
    gap: 8,
    marginLeft: 20,
  },
  lovedCard: {
    backgroundColor: "#161208",
    borderColor: "rgba(201,168,76,0.2)",
  },
  dustyCard: {
    backgroundColor: "#111111",
    borderColor: "#1A1A1A",
  },
  reusabilityBlock: {
    width: "100%",
    height: 50,
    borderRadius: 8,
  },
  reusabilityName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#E0D8CC",
    lineHeight: 15,
  },
  reusabilityTimes: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#C9A84C",
  },
  yearRail: {
    marginHorizontal: -20,
  },
  yearCard: {
    width: 200,
    height: 200,
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    padding: 20,
    gap: 8,
    justifyContent: "flex-end",
    marginLeft: 20,
  },
  yearCardLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#A3A3A3",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  yearCardStat: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 40,
    color: "#C9A84C",
    letterSpacing: -1,
    lineHeight: 44,
  },
  yearCardValue: {
    fontFamily: "CormorantGaramond_600SemiBold",
    fontSize: 16,
    color: "#F0ECE4",
  },
  yearCardCopy: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    lineHeight: 15,
  },
  settingsTiles: {
    gap: 6,
  },
  settingsTile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    borderRadius: 14,
    padding: 14,
  },
  settingsTileIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1F1A0D",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  settingsTileLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#E0D8CC",
  },
  settingsTileStatus: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#A3A3A3",
    flex: 1,
    textAlign: "right",
    marginLeft: "auto" as any,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  settingsSheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#2A2A2A",
    borderRadius: 2,
    alignSelf: "center",
  },
  settingsSheetTitle: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 22,
    color: "#F0ECE4",
  },
  settingsSheetBody: {
    gap: 12,
  },
  settingsSheetNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#D1D1D1",
    lineHeight: 22,
  },
  settingsSheetClose: {
    backgroundColor: "#C9A84C",
    borderRadius: 12,
    padding: 14,
    alignItems: "center",
  },
  settingsSheetCloseText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#0A0A0A",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  linkButton: {
    marginTop: 10,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.6)",
    alignItems: "center",
  },
  linkButtonText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#C9A84C",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
});
