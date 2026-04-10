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

const { width } = Dimensions.get("window");

type FeedMode = "trending" | "friends" | "for you";

const VIBES = [
  { name: "quiet luxury", colors: ["#2A2520", "#1A1510"] },
  { name: "ballet core", colors: ["#2A1A1A", "#201520"] },
  { name: "coastal", colors: ["#1A2030", "#1A2820"] },
  { name: "dopamine", colors: ["#302010", "#201030"] },
  { name: "office siren", colors: ["#1A1A2A", "#101010"] },
  { name: "dark academia", colors: ["#201810", "#151515"] },
];

const FEED_POSTS = [
  { id: "1", title: "linen morning", handle: "@stylebypriya", aesthetic: "quiet luxury", bgColor: "#1A2218", tall: true, hasSimilar: true },
  { id: "2", title: "tailored sunday", handle: "@norasaurs", aesthetic: "ballet core", bgColor: "#1A1822", tall: false, hasSimilar: false },
  { id: "3", title: "soft suiting", handle: "@minimalist.k", aesthetic: "quiet luxury", bgColor: "#181A22", tall: false, hasSimilar: true },
  { id: "4", title: "breezy coastal", handle: "@coastalvibes", aesthetic: "coastal", bgColor: "#181E1A", tall: true, hasSimilar: false },
  { id: "5", title: "studio look", handle: "@ariadne.s", aesthetic: "office siren", bgColor: "#1A1820", tall: true, hasSimilar: false },
  { id: "6", title: "golden hour", handle: "@priya.m", aesthetic: "dopamine", bgColor: "#201A10", tall: false, hasSimilar: true },
];

const TRENDS = [
  { name: "quiet luxury", delta: "+10%", positive: true, bar: 0.7 },
  { name: "ballet core", delta: "+9%", positive: true, bar: 0.65 },
  { name: "old money", delta: "0%", positive: false, bar: 0.4 },
  { name: "coastal", delta: "-4%", positive: false, bar: 0.3 },
  { name: "dopamine", delta: "+18%", positive: true, bar: 0.9 },
];

const FRIENDS_ACTIVITY = [
  { initials: "RG", name: "Rahul G.", action: "added 3 new places to wardrobe", time: "2h ago", swatches: ["#2A2020","#1A2030","#201810"] },
  { initials: "MS", name: "Meera S.", action: "tried on a Zara jacket via link", time: "5h ago", swatches: [] },
];

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const [feedMode, setFeedMode] = useState<FeedMode>("trending");
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [selectedPost, setSelectedPost] = useState<typeof FEED_POSTS[0] | null>(null);
  const [trendSheetName, setTrendSheetName] = useState<string | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const CARD_W = (width - 48) / 2;

  const filteredPosts = activeVibe
    ? FEED_POSTS.filter((p) => p.aesthetic === activeVibe)
    : FEED_POSTS;

  const leftCol = filteredPosts.filter((_, i) => i % 2 === 0);
  const rightCol = filteredPosts.filter((_, i) => i % 2 !== 0);

  return (
    <View style={[styles.container]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.screenTitle}>The Pulse</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={styles.iconBtn}>
            <Feather name="search" size={14} color="#C9A84C" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn}>
            <Feather name="sliders" size={14} color="#C9A84C" />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.toggleContainer}>
        {(["trending", "friends", "for you"] as FeedMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => {
              ReactNativeHapticFeedback.trigger("impactLight");
              setFeedMode(mode);
            }}
            style={[styles.togglePill, feedMode === mode && styles.togglePillActive]}
          >
            <Text style={[styles.togglePillText, feedMode === mode && styles.togglePillTextActive]}>
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
      >
        <View>
          <Text style={styles.sectionLabel}>THIS WEEK'S VIBES</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.vibesContent}
            style={{ marginTop: 8, marginHorizontal: -20 }}
          >
            <View style={{ width: 20 }} />
            {VIBES.map((vibe) => {
              const isActive = activeVibe === vibe.name;
              return (
                <TouchableOpacity
                  key={vibe.name}
                  onPress={() => {
                    ReactNativeHapticFeedback.trigger("impactLight");
                    setActiveVibe(isActive ? null : vibe.name);
                  }}
                  style={[
                    styles.vibePill,
                    isActive && { backgroundColor: "#1F1A0D", borderColor: "#C9A84C" },
                  ]}
                >
                  <View style={styles.microPalette}>
                    {vibe.colors.map((c, i) => (
                      <View key={i} style={[styles.microSwatch, { backgroundColor: c }]} />
                    ))}
                  </View>
                  <Text style={[styles.vibeName, isActive && { color: "#C9A84C" }]}>
                    {vibe.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <View style={{ width: 20 }} />
          </ScrollView>
        </View>

        {activeVibe && (
          <View style={styles.vibeFilterBar}>
            <Text style={styles.vibeFilterText}>showing: {activeVibe}</Text>
            <TouchableOpacity onPress={() => setActiveVibe(null)}>
              <Text style={styles.vibeFilterClear}>clear</Text>
            </TouchableOpacity>
          </View>
        )}

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
                  activeVibe && post.aesthetic !== activeVibe && { opacity: 0.2 },
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
                      <Feather name="camera" size={10} color="#888" />
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
                  activeVibe && post.aesthetic !== activeVibe && { opacity: 0.2 },
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
                      <Feather name="camera" size={10} color="#888" />
                      <Text style={styles.tryBtnText}>try on</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.radarCard}>
          <View style={styles.radarHeader}>
            <View>
              <Text style={styles.radarTitle}>trend radar</Text>
              <Text style={styles.radarSub}>this week's momentum</Text>
            </View>
            <View style={styles.liveBadge}>
              <Text style={styles.liveText}>live</Text>
            </View>
          </View>
          {TRENDS.map((trend, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => setTrendSheetName(trend.name)}
              style={styles.trendRow}
            >
              <Text style={styles.trendName}>{trend.name}</Text>
              <View style={styles.trendBar}>
                <View style={[styles.trendBarFill, { width: `${trend.bar * 100}%` as any }]} />
              </View>
              <Text
                style={[
                  styles.trendDelta,
                  { color: trend.positive ? "#C9A84C" : "#555555" },
                ]}
              >
                {trend.delta}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {feedMode === "friends" && (
          <View style={styles.friendsSection}>
            <Text style={styles.sectionLabel}>FRIENDS ACTIVITY</Text>

            <View style={styles.stylePalCard}>
              <View style={styles.stylePalHeader}>
                <View style={styles.stylePalIconBox}>
                  <Feather name="heart" size={14} color="#C9A84C" />
                </View>
                <View style={styles.stylePalMeta}>
                  <Text style={styles.stylePalTitle}>style pal request</Text>
                  <Text style={styles.stylePalSub}>priya is wearing this tomorrow — thoughts?</Text>
                </View>
              </View>

              <View style={styles.palOutfitPreview}>
                <View style={[styles.palOutfitBlock, { backgroundColor: "#1A2020" }]} />
                <View style={styles.palOutfitInfo}>
                  <Text style={styles.palOutfitName}>brunch saturday look</Text>
                  <Text style={styles.palOutfitSub}>planned for Apr 13 · brunch at olive</Text>
                </View>
              </View>

              <View style={styles.palActions}>
                <TouchableOpacity
                  style={styles.palActionSolid}
                  onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                >
                  <Text style={styles.palActionSolidText}>love it</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.palActionGhost}
                  onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                >
                  <Text style={styles.palActionGhostText}>not quite</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.palActionGhost}
                  onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                >
                  <Text style={styles.palActionGhostText}>suggest something</Text>
                </TouchableOpacity>
              </View>
            </View>

            {FRIENDS_ACTIVITY.map((friend, i) => (
              <View key={i} style={styles.activityCard}>
                <View style={styles.activityAvatar}>
                  <Text style={styles.activityInitials}>{friend.initials}</Text>
                </View>
                <View style={styles.activityInfo}>
                  <Text style={styles.activityName}>{friend.name}</Text>
                  <Text style={styles.activityAction}>{friend.action}</Text>
                  {friend.swatches.length > 0 && (
                    <View style={styles.activitySwatches}>
                      {friend.swatches.map((c, si) => (
                        <View key={si} style={[styles.activitySwatch, { backgroundColor: c }]} />
                      ))}
                    </View>
                  )}
                </View>
                <Text style={styles.activityTime}>{friend.time}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selectedPost} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setSelectedPost(null)}
        />
        {selectedPost && (
          <View style={styles.postDetailSheet}>
            <View style={styles.sheetHandle} />
            <View
              style={[
                styles.postDetailImage,
                { backgroundColor: selectedPost.bgColor },
              ]}
            >
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

      <Modal visible={!!trendSheetName} transparent animationType="slide">
        <TouchableOpacity
          style={styles.modalBackdrop}
          activeOpacity={1}
          onPress={() => setTrendSheetName(null)}
        />
        {trendSheetName && (
          <View style={styles.trendDetailSheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.trendDetailHeader}>
              <Text style={styles.trendDetailName}>{trendSheetName}</Text>
              <View style={styles.liveBadge}>
                <Text style={styles.liveText}>live</Text>
              </View>
            </View>
            <Text style={styles.sectionLabel}>7-DAY MOMENTUM</Text>
            <View style={styles.trendDetailBars}>
              {[0.3,0.5,0.4,0.7,0.6,0.8,0.9].map((h, i) => (
                <View key={i} style={styles.trendBarCol}>
                  <View style={[styles.trendBarItem, { height: h * 60 }]} />
                  <Text style={styles.trendBarDay}>{["M","T","W","T","F","S","S"][i]}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.sectionLabel, { marginTop: 12 }]}>POSTS IN THIS TREND</Text>
            <View style={styles.trendMiniGrid}>
              {filteredPosts.slice(0, 4).map((p) => (
                <View
                  key={p.id}
                  style={[styles.trendMiniCard, { backgroundColor: p.bgColor }]}
                />
              ))}
            </View>
          </View>
        )}
      </Modal>
    </View>
  );
}

const CARD_W = (width - 48) / 2;

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
  headerIcons: {
    flexDirection: "row",
    gap: 8,
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
  toggleContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    padding: 3,
    marginBottom: 16,
  },
  togglePill: {
    flex: 1,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 16,
  },
  togglePillActive: {
    backgroundColor: "#C9A84C",
  },
  togglePillText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#666666",
    letterSpacing: 0.5,
  },
  togglePillTextActive: {
    fontFamily: "Inter_500Medium",
    color: "#0A0A0A",
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 20,
  },
  sectionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#555555",
    letterSpacing: 1.5,
    textTransform: "uppercase",
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
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
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
    color: "#888888",
  },
  vibeFilterBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "#161208",
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  vibeFilterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#C9A84C",
  },
  vibeFilterClear: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#888",
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
    fontFamily: "CormorantGaramond_400Regular",
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
    fontFamily: "CormorantGaramond_600SemiBold",
    fontSize: 13,
    color: "#F0ECE4",
    lineHeight: 17,
  },
  cardHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#555555",
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
    color: "#888",
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
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
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
    color: "#E0D8CC",
  },
  radarSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#555555",
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
    color: "#888888",
    width: 90,
  },
  trendBar: {
    flex: 1,
    height: 4,
    backgroundColor: "#1A1A1A",
    borderRadius: 2,
    overflow: "hidden",
  },
  trendBarFill: {
    height: "100%",
    backgroundColor: "#C9A84C",
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
    color: "#666666",
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
    color: "#555555",
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
    color: "#666666",
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
    color: "#555555",
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
    fontFamily: "CormorantGaramond_600SemiBold",
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
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 24,
    color: "#F0ECE4",
  },
  postDetailHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#555555",
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
    fontFamily: "CormorantGaramond_700Bold",
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
    color: "#555555",
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
