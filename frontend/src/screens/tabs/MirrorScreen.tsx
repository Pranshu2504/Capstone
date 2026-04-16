import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Platform,
  ImageBackground,
  Dimensions,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { useColors } from "@/hooks/useColors";
import { MOCK_OUTFIT_TODAY } from "@/constants/mockData";

const { width } = Dimensions.get("window");

const CARD_W = (width - 48) / 2;

const FEED_POSTS = [
  { id: "1", title: "linen morning", handle: "@stylebypriya", aesthetic: "quiet luxury", bgColor: "#1A2218", tall: true, hasSimilar: true },
  { id: "2", title: "tailored sunday", handle: "@norasaurs", aesthetic: "ballet core", bgColor: "#1A1822", tall: false, hasSimilar: false },
  { id: "3", title: "soft suiting", handle: "@minimalist.k", aesthetic: "quiet luxury", bgColor: "#181A22", tall: false, hasSimilar: true },
  { id: "4", title: "breezy coastal", handle: "@coastalvibes", aesthetic: "coastal", bgColor: "#181E1A", tall: true, hasSimilar: false },
  { id: "5", title: "studio look", handle: "@ariadne.s", aesthetic: "office siren", bgColor: "#1A1820", tall: true, hasSimilar: false },
  { id: "6", title: "golden hour", handle: "@priya.m", aesthetic: "dopamine", bgColor: "#201A10", tall: false, hasSimilar: true },
];

export default function MirrorScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [weatherData, setWeatherData] = useState("-- · --°");

  // Pulse state
  const [selectedPost, setSelectedPost] = useState<typeof FEED_POSTS[0] | null>(null);

  const leftCol = FEED_POSTS.filter((_, i) => i % 2 === 0);
  const rightCol = FEED_POSTS.filter((_, i) => i % 2 !== 0);

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000);

    const fetchWeather = async () => {
      try {
        const lat = 30.3398;
        const lon = 76.3869;
        const city = "Patiala";
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherJson = await weatherRes.json();
        if (weatherJson && weatherJson.current_weather) {
          setWeatherData(`${city.toLowerCase()} · ${Math.round(weatherJson.current_weather.temperature)}°`);
        }
      } catch (err) {
        console.log("Weather fetch failed", err);
      }
    };

    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 15 * 60000);

    return () => {
      clearInterval(timer);
      clearInterval(weatherTimer);
    };
  }, []);

  const timeStr = currentTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = currentTime.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <>
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={[
          styles.content,
          { paddingTop: topPad + 16, paddingBottom: bottomPad + 120 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Masthead ── */}
        <View style={styles.masthead}>
          <View style={{ flexDirection: "row", gap: 6, alignItems: "baseline" }}>
            <Text style={[styles.mastheadTime, { color: colors.warmWhite }]}>{timeStr}</Text>
            <Text style={[styles.mastheadDate, { color: colors.brass }]}>{dateStr}</Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={[styles.mastheadWeather, { color: colors.mutedForeground }]}>
              {weatherData}
            </Text>
            <TouchableOpacity
              style={{
                width: 34,
                height: 34,
                borderRadius: 17,
                backgroundColor: "#141414",
                borderWidth: 0.5,
                borderColor: "#2A1E0A",
                alignItems: "center",
                justifyContent: "center",
              }}
              onPress={() => navigation.navigate("Identity")}
            >
              <Feather name="user" size={14} color={colors.brass} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Hero Card ── */}
        <View style={[styles.heroCard, { backgroundColor: colors.card }]}>
          <ImageBackground
            source={require("../../../assets/images/outfit_hero.png")}
            style={styles.heroImage}
            resizeMode="cover"
          >
            <View style={styles.heroGradient} />
            <View style={styles.heroContent}>
              <Text style={[styles.heroHeadline, { color: colors.warmWhite }]}>
                {MOCK_OUTFIT_TODAY.headline}
              </Text>
              <Text style={[styles.heroSubhead, { color: colors.mutedForeground }]}>
                {MOCK_OUTFIT_TODAY.subhead}
              </Text>
              <View style={styles.heroCTARow}>
                <TouchableOpacity
                  style={[styles.heroCTASolid, { backgroundColor: colors.brass }]}
                >
                  <Text style={[styles.heroCTAText, { color: colors.charcoal }]}>wear this</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ImageBackground>
        </View>

        {/* ══════════════ PULSE SECTION ══════════════ */}

        {/* Pulse header */}
        <View style={styles.pulseHeader}>
          <Text style={[styles.pulseTitleText, { color: colors.warmWhite }]}>The Pulse</Text>
          <View style={[styles.liveBadge, { backgroundColor: colors.brassSubtle ?? "#1F1A0D" }]}>
            <Text style={[styles.liveText, { color: colors.brass }]}>live</Text>
          </View>
        </View>

        {/* Masonry grid */}
        <View style={styles.masonryGrid}>
          <View style={styles.masonryColumn}>
            {leftCol.map((post) => (
              <TouchableOpacity
                key={post.id}
                onPress={() => setSelectedPost(post)}
                style={[
                  styles.feedCard,
                  { backgroundColor: post.bgColor },
                  { height: post.tall ? 200 : 160 },
                ]}
              >
                <View style={styles.cardImageArea}>
                  <Text style={styles.cardAestheticWatermark}>{post.aesthetic}</Text>
                </View>
                <View style={styles.cardOverlay}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{post.title}</Text>
                  <Text style={styles.cardHandle}>{post.handle}</Text>
                  <View style={styles.cardActions}>
                    {post.hasSimilar && (
                      <View style={styles.saveBtn}>
                        <Feather name="heart" size={10} color="#C9A84C" />
                        <Text style={styles.saveBtnText}>save</Text>
                      </View>
                    )}
                    <View style={styles.tryBtn}>
                      <Feather name="camera" size={10} color="#BBB" />
                      <Text style={styles.tryBtnText}>try on</Text>
                    </View>
                  </View>
                  {post.hasSimilar && (
                    <View style={styles.similarBadge}>
                      <Text style={styles.similarText}>in your closet</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
          <View style={[styles.masonryColumn, { marginTop: 20 }]}>
            {rightCol.map((post) => (
              <TouchableOpacity
                key={post.id}
                onPress={() => setSelectedPost(post)}
                style={[
                  styles.feedCard,
                  { backgroundColor: post.bgColor },
                  { height: post.tall ? 200 : 160 },
                ]}
              >
                <View style={styles.cardImageArea}>
                  <Text style={styles.cardAestheticWatermark}>{post.aesthetic}</Text>
                </View>
                <View style={styles.cardOverlay}>
                  <Text style={styles.cardTitle} numberOfLines={2}>{post.title}</Text>
                  <Text style={styles.cardHandle}>{post.handle}</Text>
                  <View style={styles.cardActions}>
                    <View style={styles.tryBtn}>
                      <Feather name="camera" size={10} color="#BBB" />
                      <Text style={styles.tryBtnText}>try on</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Post Detail Modal */}
      <Modal visible={!!selectedPost} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedPost(null)}
        />
        {selectedPost && (
          <View style={styles.postDetailSheet}>
            <View style={styles.sheetHandle} />
            <View style={[styles.postDetailImage, { backgroundColor: selectedPost.bgColor }]}>
              <Text style={styles.postDetailAesthetic}>{selectedPost.aesthetic}</Text>
              {[0.25, 0.5, 0.75].map((pos, i) => (
                <View
                  key={i}
                  style={[
                    styles.goldDot,
                    {
                      top: `${pos * 100}%` as any,
                      left: `${(i % 3) * 30 + 20}%` as any,
                    },
                  ]}
                />
              ))}
            </View>
            <View style={styles.postDetailContent}>
              <Text style={styles.postDetailTitle}>{selectedPost.title}</Text>
              <Text style={styles.postDetailHandle}>{selectedPost.handle}</Text>
              <View style={styles.postDetailActions}>
                <TouchableOpacity
                  style={styles.postDetailSave}
                  onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                >
                  <Feather name="heart" size={14} color="#0A0A0A" />
                  <Text style={styles.postDetailSaveText}>save look</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.postDetailTryOn}
                  onPress={() => setSelectedPost(null)}
                >
                  <Feather name="camera" size={14} color="#C9A84C" />
                  <Text style={styles.postDetailTryOnText}>try on</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 20,
    paddingHorizontal: 20,
  },
  masthead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  mastheadTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  mastheadDate: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  mastheadWeather: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  heroCard: {
    borderRadius: 4,
    overflow: "hidden",
    height: 320,
  },
  heroImage: {
    flex: 1,
    justifyContent: "flex-end",
  },
  heroGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(13,11,8,0.45)",
  },
  heroContent: {
    padding: 20,
    gap: 6,
  },
  heroHeadline: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    letterSpacing: -0.5,
  },
  heroSubhead: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.3,
    marginBottom: 12,
  },
  heroCTARow: {
    flexDirection: "row",
    gap: 10,
  },
  heroCTASolid: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
  },
  heroCTAText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },

  // ── Pulse styles ──
  pulseHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  pulseTitleText: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 20,
    letterSpacing: 0.3,
  },
  sectionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  toggleContainer: {
    flexDirection: "row",
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    padding: 3,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 16,
  },
  togglePillText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  vibesContent: {
    gap: 8,
    alignItems: "center",
    paddingBottom: 4,
  },
  vibePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: 0.5,
    borderRadius: 20,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  microPalette: {
    flexDirection: "row",
    gap: 2,
  },
  microSwatch: {
    width: 8,
    height: 8,
    borderRadius: 2,
  },
  vibeName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  vibeFilterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  vibeFilterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  vibeFilterClear: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
  },
  masonryGrid: {
    flexDirection: "row",
    gap: 8,
  },
  masonryColumn: {
    flex: 1,
    gap: 8,
  },
  feedCard: {
    borderRadius: 18,
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    overflow: "hidden",
    position: "relative",
  },
  cardImageArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  cardAestheticWatermark: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 14,
    color: "rgba(255,255,255,0.07)",
    textAlign: "center",
    paddingHorizontal: 8,
  },
  cardOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
    gap: 3,
    backgroundColor: "rgba(9,9,9,0.7)",
  },
  cardTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 13,
    color: "#F0ECE4",
    lineHeight: 17,
  },
  cardHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
  },
  cardActions: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
  },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  saveBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#C9A84C",
  },
  tryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 8,
    paddingVertical: 3,
    paddingHorizontal: 7,
  },
  tryBtnText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#BBB",
  },
  similarBadge: {
    position: "absolute",
    top: -10,
    right: 10,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  similarText: {
    fontFamily: "Inter_500Medium",
    fontSize: 8,
    color: "#C9A84C",
    letterSpacing: 0.5,
  },
  radarCard: {
    borderWidth: 0.5,
    borderRadius: 18,
    padding: 14,
    gap: 10,
  },
  radarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  radarTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  radarSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
  },
  liveBadge: {
    backgroundColor: "#1F1A0D",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  liveText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#C9A84C",
  },
  trendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  trendName: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    width: 90,
  },
  trendBar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  trendBarFill: {
    height: "100%",
    borderRadius: 2,
  },
  trendDelta: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    width: 36,
    textAlign: "right",
  },
  friendsSection: {
    gap: 12,
  },
  stylePalCard: {
    backgroundColor: "#141208",
    borderWidth: 1.5,
    borderColor: "rgba(201,168,76,0.2)",
    borderRadius: 18,
    padding: 14,
    gap: 12,
  },
  stylePalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  stylePalIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#1F1A0D",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.27)",
    alignItems: "center",
    justifyContent: "center",
  },
  stylePalMeta: {
    flex: 1,
    gap: 2,
  },
  stylePalTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#E0D8CC",
  },
  stylePalSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#BBBBBB",
    lineHeight: 16,
  },
  palOutfitPreview: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  palOutfitBlock: {
    width: 50,
    height: 60,
    borderRadius: 8,
  },
  palOutfitInfo: {
    gap: 3,
  },
  palOutfitName: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#E0D8CC",
  },
  palOutfitSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    lineHeight: 15,
  },
  palActions: {
    flexDirection: "row",
    gap: 6,
  },
  palActionSolid: {
    backgroundColor: "#C9A84C",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  palActionSolidText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#0A0A0A",
  },
  palActionGhost: {
    backgroundColor: "transparent",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.3)",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  palActionGhostText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#C9A84C",
  },
  activityCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    borderRadius: 16,
    padding: 12,
  },
  activityAvatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#1E1E1E",
    borderWidth: 1.5,
    borderColor: "rgba(201,168,76,0.27)",
    alignItems: "center",
    justifyContent: "center",
  },
  activityInitials: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#C9A84C",
  },
  activityInfo: {
    flex: 1,
    gap: 3,
  },
  activityName: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#E0D8CC",
  },
  activityAction: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#BBBBBB",
  },
  activitySwatches: {
    flexDirection: "row",
    gap: 4,
    marginTop: 4,
  },
  activitySwatch: {
    width: 20,
    height: 20,
    borderRadius: 4,
  },
  activityTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.7)",
  },
  postDetailSheet: {
    backgroundColor: "#0A0A0A",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "85%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#2A2A2A",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
    marginBottom: 0,
  },
  postDetailImage: {
    height: 280,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  postDetailAesthetic: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 28,
    color: "rgba(255,255,255,0.12)",
  },
  goldDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#C9A84C",
  },
  postDetailContent: {
    padding: 20,
    gap: 10,
  },
  postDetailTitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    color: "#F0ECE4",
  },
  postDetailHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#A3A3A3",
  },
  postDetailActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 6,
  },
  postDetailSave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#C9A84C",
    borderRadius: 12,
    paddingVertical: 12,
  },
  postDetailSaveText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#0A0A0A",
  },
  postDetailTryOn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "transparent",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.4)",
    borderRadius: 12,
    paddingVertical: 12,
  },
  postDetailTryOnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#C9A84C",
  },
  trendDetailSheet: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    gap: 16,
    maxHeight: "60%",
  },
  trendDetailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  trendDetailName: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 24,
    color: "#F0ECE4",
  },
  trendDetailBars: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 6,
    height: 70,
    marginTop: 8,
  },
  trendBarCol: {
    flex: 1,
    alignItems: "center",
    gap: 4,
  },
  trendBarItem: {
    width: "100%",
    backgroundColor: "#C9A84C",
    borderRadius: 3,
  },
  trendBarDay: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
  },
  trendMiniGrid: {
    flexDirection: "row",
    gap: 8,
  },
  trendMiniCard: {
    flex: 1,
    height: 80,
    borderRadius: 10,
  },
});
