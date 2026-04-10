import React, { useState, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Animated,
  Platform,
  ImageBackground,
  Dimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import {
  MOCK_OUTFIT_TODAY,
  MOCK_WEEKLY_PLAN,
  MOCK_TRENDS,
  MOCK_WARDROBE_ITEMS,
} from "@/constants/mockData";

const { width } = Dimensions.get("window");

export default function MirrorScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [occasion, setOccasion] = useState("General");
  const [explainOpen, setExplainOpen] = useState(false);
  const explainAnim = useRef(new Animated.Value(0)).current;

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const occasions = ["General", "Office", "Dinner"];
  const dustItems = MOCK_WARDROBE_ITEMS.filter((i) => i.dustOff).slice(0, 4);

  const toggleExplain = () => {
    const toValue = explainOpen ? 0 : 1;
    Animated.spring(explainAnim, {
      toValue,
      useNativeDriver: false,
      damping: 16,
    }).start();
    setExplainOpen(!explainOpen);
  };

  const now = new Date();
  const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: topPad + 16, paddingBottom: bottomPad + 120 },
      ]}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.masthead}>
        <Text style={[styles.mastheadTime, { color: colors.warmWhite }]}>{timeStr}</Text>
        <Text style={[styles.mastheadDate, { color: colors.brass }]}>{dateStr}</Text>
        <Text style={[styles.mastheadWeather, { color: colors.mutedForeground }]}>
          London · 22°
        </Text>
      </View>

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
              <TouchableOpacity
                style={[styles.heroCTAGhost, { borderColor: "rgba(201,168,76,0.5)" }]}
              >
                <Text style={[styles.heroCTAText, { color: colors.brass }]}>see why</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ImageBackground>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.brass }]}>from your closet</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dustRail}>
          {dustItems.map((item) => (
            <View
              key={item.id}
              style={[styles.dustCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[styles.dustSwatch, { backgroundColor: item.color }]} />
              <Text style={[styles.dustName, { color: colors.warmWhite }]} numberOfLines={2}>
                {item.name}
              </Text>
              <Text style={[styles.dustPrompt, { color: colors.brass }]}>dust off?</Text>
            </View>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.brass }]}>what's the occasion?</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.occasionRow}>
          {occasions.map((o) => (
            <TouchableOpacity
              key={o}
              onPress={() => setOccasion(o)}
              style={[
                styles.occasionPill,
                {
                  backgroundColor: occasion === o ? colors.brass : "transparent",
                  borderColor: occasion === o ? colors.brass : colors.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.occasionText,
                  { color: occasion === o ? colors.charcoal : colors.mutedForeground },
                ]}
              >
                {o}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.brass }]}>this week</Text>
        <View style={[styles.weekStrip, { backgroundColor: colors.card }]}>
          {MOCK_WEEKLY_PLAN.map((day, i) => (
            <View key={i} style={styles.dayColumn}>
              <Text style={[styles.dayLabel, { color: colors.mutedForeground }]}>{day.short}</Text>
              {day.planned ? (
                <View style={styles.swatchStack}>
                  {day.colors.map((c, ci) => (
                    <View
                      key={ci}
                      style={[
                        styles.swatchDot,
                        { backgroundColor: c, top: ci * 8 },
                      ]}
                    />
                  ))}
                </View>
              ) : (
                <View
                  style={[
                    styles.emptyDay,
                    { borderColor: colors.border },
                  ]}
                />
              )}
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.explainCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          onPress={toggleExplain}
          style={styles.explainHeader}
        >
          <View>
            <Text style={[styles.sectionLabel, { color: colors.brass }]}>ZORA picked this because...</Text>
          </View>
          <Feather
            name={explainOpen ? "chevron-up" : "chevron-down"}
            size={16}
            color={colors.mutedForeground}
          />
        </TouchableOpacity>
        {explainOpen && (
          <View style={styles.explainBody}>
            {MOCK_OUTFIT_TODAY.reasoning.map((r, i) => (
              <View key={i} style={styles.reasonRow}>
                <View style={[styles.reasonDot, { backgroundColor: colors.brass }]} />
                <Text style={[styles.reasonText, { color: colors.warmWhite }]}>{r}</Text>
              </View>
            ))}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={[styles.sectionLabel, { color: colors.brass }]}>in the world right now</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {MOCK_TRENDS.map((trend) => (
            <View
              key={trend.id}
              style={[styles.trendCard, { backgroundColor: colors.card }]}
            >
              <View style={[styles.trendImagePlaceholder, { backgroundColor: colors.surface }]}>
                <Text style={[styles.trendImageText, { color: colors.mutedForeground }]}>
                  {trend.name[0]}
                </Text>
              </View>
              <View style={styles.trendContent}>
                <Text style={[styles.trendName, { color: colors.warmWhite }]}>{trend.name}</Text>
                {trend.tag === "in your closet" && (
                  <View style={[styles.trendBadge, { backgroundColor: colors.brass }]}>
                    <Text style={[styles.trendBadgeText, { color: colors.charcoal }]}>
                      in your closet
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    gap: 24,
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
  heroCTAGhost: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: 20,
    borderWidth: 1,
  },
  heroCTAText: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  section: {
    gap: 14,
  },
  sectionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: "uppercase",
  },
  dustRail: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  dustCard: {
    width: 120,
    marginRight: 12,
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    padding: 12,
    gap: 8,
  },
  dustSwatch: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  dustName: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    lineHeight: 17,
  },
  dustPrompt: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  occasionRow: {
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  occasionPill: {
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  occasionText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    letterSpacing: 0.5,
  },
  weekStrip: {
    flexDirection: "row",
    borderRadius: 4,
    padding: 16,
    justifyContent: "space-between",
  },
  dayColumn: {
    alignItems: "center",
    gap: 8,
    flex: 1,
  },
  dayLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  swatchStack: {
    width: 28,
    height: 36,
    position: "relative",
  },
  swatchDot: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    alignSelf: "center",
  },
  emptyDay: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderStyle: "dashed",
  },
  explainCard: {
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  explainHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  explainBody: {
    gap: 10,
  },
  reasonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  reasonDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
  },
  reasonText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
    flex: 1,
  },
  trendCard: {
    width: 160,
    marginRight: 12,
    borderRadius: 4,
    overflow: "hidden",
  },
  trendImagePlaceholder: {
    height: 120,
    alignItems: "center",
    justifyContent: "center",
  },
  trendImageText: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 40,
  },
  trendContent: {
    padding: 12,
    gap: 6,
  },
  trendName: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 14,
  },
  trendBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  trendBadgeText: {
    fontFamily: "Inter_500Medium",
    fontSize: 9,
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
