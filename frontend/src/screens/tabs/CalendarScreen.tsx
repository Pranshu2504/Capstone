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
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import { useColors } from "@/hooks/useColors";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const { width } = Dimensions.get("window");

const DAYS_ABR = ["M", "T", "W", "T", "F", "S", "S"];
const FULL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

const getDynamicWeekData = (now: Date) => {
  const currentDayOfWeek = now.getDay();
  const mondayOffset = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() + mondayOffset);

  const mockOutfits = [null, { colors: ["#3A3020", "#2A2A20"] }, { colors: ["#1A2030", "#30201A"] }, { colors: ["#2A2218", "#3A301A"] }, { colors: ["#1E1E2A", "#2A1E1E"] }, null, null];
  const mockEvents = [0, 1, 2, 3, 1, 0, 0];

  return Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    return {
      day: FULL_DAYS[i],
      fullDay: FULL_DAY_NAMES[i],
      date: d.getDate(),
      month: MONTHS[d.getMonth()],
      outfit: mockOutfits[i],
      events: mockEvents[i],
      isToday: d.getDate() === now.getDate() && d.getMonth() === now.getMonth(),
    };
  });
};

const TODAY_EVENTS = [
  { title: "team standup", time: "10:00 am", type: "work", tag: "smart casual" },
  { title: "lunch with priya", time: "1:00 pm", type: "social", tag: "casual fit" },
  { title: "evening walk", time: "6:00 pm", type: "wellness", tag: null },
];

const EVENT_COLORS: Record<string, string> = {
  work: "#7070C0",
  social: "#C09070",
  wellness: "#6A9A6A",
};

type ViewMode = "week" | "month" | "overview";

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec",
];

export default function CalendarScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>("week");
  const [selectedDay, setSelectedDay] = useState(10);
  const [showBuildSheet, setShowBuildSheet] = useState(false);

  const [currentTime, setCurrentTime] = useState(new Date());
  const [weatherData, setWeatherData] = useState("-- · --°");

  React.useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);

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

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const currentMonth = currentTime.getMonth();
  const currentYear = currentTime.getFullYear();
  const firstDay = (new Date(currentYear, currentMonth, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  const dynamicWeekData = getDynamicWeekData(currentTime);
  const selectedData = dynamicWeekData.find((d) => d.date === selectedDay) || dynamicWeekData.find(d => d.isToday) || dynamicWeekData[0];

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <Text style={styles.screenTitle}>The Calendar</Text>
        <View style={styles.headerIcons}>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="refresh-cw" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="plus" size={14} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => navigation.navigate("Identity")}>
            <Feather name="user" size={14} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={[styles.toggleContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
        {(["week", "month", "overview"] as ViewMode[]).map((mode) => (
          <TouchableOpacity
            key={mode}
            onPress={() => {
              ReactNativeHapticFeedback.trigger("impactLight");
              setViewMode(mode);
            }}
            style={[styles.togglePill, viewMode === mode && [styles.togglePillActive, { backgroundColor: colors.primary }]]}
          >
            <Text style={[styles.togglePillText, { color: colors.mutedForeground }, viewMode === mode && [styles.togglePillTextActive, { color: colors.primaryForeground }]]}>
              {mode}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 100 }]}
      >
        {viewMode === "week" && (
          <>
            <View style={styles.weekdayRow}>
              {DAYS_ABR.map((d, i) => (
                <Text key={i} style={styles.weekdayLabel}>{d}</Text>
              ))}
            </View>

            <View style={styles.weekGrid}>
              {dynamicWeekData.map((day) => (
                <TouchableOpacity
                  key={day.date}
                  onPress={() => {
                    ReactNativeHapticFeedback.trigger("impactLight");
                    setSelectedDay(day.date);
                  }}
                  style={[
                    styles.weekCell,
                    day.outfit
                      ? { backgroundColor: colors.surface, borderColor: colors.brassSubtle }
                      : { backgroundColor: colors.card, borderColor: colors.border },
                    day.isToday && { borderColor: colors.primary, borderWidth: 1 },
                    selectedDay === day.date && { borderColor: colors.primary, borderWidth: 1.5 },
                  ]}
                >
                  <Text
                    style={[
                      styles.weekCellDate,
                      day.isToday && { color: colors.primary },
                      selectedDay === day.date && !day.isToday && { color: colors.text },
                    ]}
                  >
                    {day.date}
                  </Text>
                  {day.outfit && (
                    <View
                      style={[styles.outfitSwatch, { backgroundColor: day.outfit.colors[0] }]}
                    />
                  )}
                  {day.events > 0 && (
                    <View style={styles.eventIndicator} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.glanceSection}>
              <Text style={styles.sectionLabel}>THIS WEEK AT A GLANCE</Text>
              <TouchableOpacity onPress={() => ReactNativeHapticFeedback.trigger("impactMedium")}>
                <Text style={styles.shuffleLabel}>SHUFFLE ALL</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dayCardsRow}
            >
              {dynamicWeekData.map((day) => (
                <TouchableOpacity
                  key={day.date}
                  onPress={() => setSelectedDay(day.date)}
                  style={[
                    styles.dayCard,
                    selectedDay === day.date && { borderColor: "#C9A84C" },
                  ]}
                >
                  <Text style={styles.dayCardAbbr}>{day.day}</Text>
                  {day.outfit ? (
                    <View style={[styles.dayCardSwatch, { backgroundColor: day.outfit.colors[0] }]} />
                  ) : (
                    <View style={styles.dayCardEmpty}>
                      <Feather name="plus" size={10} color="#777" />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>

            <View style={[styles.divider, { backgroundColor: "#1A1A1A" }]} />

            <View style={styles.detailCard}>
              <View style={styles.detailHeader}>
                <View>
                  <Text style={styles.detailDate}>
                    {selectedData.fullDay}, {selectedData.month} {selectedData.date}
                  </Text>
                  <Text style={styles.detailSub}>
                    {selectedData?.events ?? 0} events · {selectedData?.outfit ? "outfit planned" : "no outfit yet"}
                  </Text>
                </View>
                <View style={[styles.weatherPill, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                  <Feather name="sun" size={12} color={colors.primary} />
                  <Text style={[styles.weatherText, { color: colors.text }]}>{weatherData.split(' · ')[1] || '22°'}</Text>
                  <Text style={[styles.weatherSub, { color: colors.mutedForeground }]}>sunny</Text>
                </View>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.outfitStrip}
              >
                {[
                  { icon: "user", color: "#3A4A3A", label: "sage shirt" },
                  { icon: "user", color: "#3A3A4A", label: "navy trousers" },
                  { icon: "anchor", color: "#3A2A2A", label: "grey shoes" },
                  { icon: "briefcase", color: "#2A2A2A", label: "tan bag" },
                ].map((piece, i) => (
                  <View key={i} style={styles.pieceTile}>
                    <View style={[styles.pieceIcon, { backgroundColor: piece.color }]}>
                      <Feather name={piece.icon as any} size={14} color="rgba(255,255,255,0.3)" />
                    </View>
                    <Text style={styles.pieceLabel}>{piece.label}</Text>
                  </View>
                ))}
              </ScrollView>

              <Text style={[styles.sectionLabel, { marginBottom: 8 }]}>TODAY'S EVENTS</Text>
              {TODAY_EVENTS.map((event, i) => (
                <View key={i} style={styles.eventRow}>
                  <View style={[styles.eventDot, { backgroundColor: EVENT_COLORS[event.type] }]} />
                  <Text style={styles.eventName}>{event.title}</Text>
                  <Text style={styles.eventTime}>{event.time}</Text>
                  {event.tag && (
                    <View style={styles.eventTag}>
                      <Text style={styles.eventTagText}>{event.tag}</Text>
                    </View>
                  )}
                </View>
              ))}

              <View style={styles.actionGrid}>
                <TouchableOpacity
                  style={[styles.actionSolid, { backgroundColor: colors.primary }]}
                  onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                >
                  <Text style={[styles.actionSolidLabel, { color: colors.primaryForeground }]}>let ZORA pick</Text>
                  <Text style={[styles.actionSolidSub, { color: colors.primaryForeground, opacity: 0.7 }]}>AI auto-plan</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.actionGhost, { borderColor: colors.brassSubtle }]}
                  onPress={() => setShowBuildSheet(true)}
                >
                  <Text style={[styles.actionGhostLabel, { color: colors.primary }]}>build it</Text>
                  <Text style={[styles.actionGhostSub, { color: colors.mutedForeground }]}>from wardrobe</Text>
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity
              style={styles.shuffleCard}
              onPress={() => ReactNativeHapticFeedback.trigger("impactHeavy")}
            >
              <View style={styles.shuffleIcon}>
                <Feather name="shuffle" size={18} color="#C9A84C" />
              </View>
              <View style={styles.shuffleText}>
                <Text style={styles.shuffleTitle}>fun shuffle</Text>
                <Text style={styles.shuffleSub}>randomize the whole week</Text>
              </View>
              <View style={styles.shuffleArrow}>
                <Feather name="chevron-right" size={16} color="#777" />
              </View>
            </TouchableOpacity>
          </>
        )}

        {viewMode === "month" && (
          <>
            <View style={styles.weekdayRow}>
              {DAYS_ABR.map((d, i) => (
                <Text key={i} style={styles.weekdayLabel}>{d}</Text>
              ))}
            </View>
            <View style={styles.monthGrid}>
              {Array.from({ length: firstDay }).map((_, i) => (
                <View key={`e${i}`} style={styles.monthCell} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const isToday = day === currentTime.getDate();
                const hasOutfit = [7, 9, 11, 14, 18, 22, 25].includes(day);
                return (
                  <TouchableOpacity
                    key={day}
                    onPress={() => ReactNativeHapticFeedback.trigger("impactLight")}
                    style={[
                      styles.monthCell,
                      hasOutfit && { backgroundColor: colors.surface, borderColor: colors.brassSubtle },
                      isToday && { borderColor: colors.primary, borderWidth: 1 },
                    ]}
                  >
                    <Text style={[styles.monthCellText, { color: colors.text }, isToday && { color: colors.primary }]}>
                      {day}
                    </Text>
                    {hasOutfit && <View style={[styles.monthDot, { backgroundColor: colors.primary }]} />}
                  </TouchableOpacity>
                );
              })}
            </View>

            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>PAST 4 WEEKS</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.recapRow}
            >
              {Array.from({ length: 4 }).map((_, i) => (
                <View key={i} style={styles.recapCard}>
                  <View style={styles.recapSwatches}>
                    {["#3A3020","#1A2030","#2A2218","#1E1E2A"].map((c, ci) => (
                      <View key={ci} style={[styles.recapSwatch, { backgroundColor: c }]} />
                    ))}
                  </View>
                  <Text style={styles.recapWeek}>Wk {i + 1}</Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}

        {viewMode === "overview" && (
          <View style={styles.overviewContainer}>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatNum}>34</Text>
              <Text style={styles.overviewStatLabel}>outfits worn this month</Text>
            </View>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatNum}>89%</Text>
              <Text style={styles.overviewStatLabel}>wardrobe utilized</Text>
            </View>
            <View style={styles.overviewStat}>
              <Text style={styles.overviewStatNum}>6</Text>
              <Text style={styles.overviewStatLabel}>days unplanned</Text>
            </View>
          </View>
        )}
      </ScrollView>

      <Modal visible={showBuildSheet} transparent animationType="slide">
        <TouchableOpacity
          style={styles.sheetBackdrop}
          activeOpacity={1}
          onPress={() => setShowBuildSheet(false)}
        />
        <View style={[styles.buildSheet, { backgroundColor: colors.card }]}>
          <View style={[styles.sheetHandle, { backgroundColor: colors.border }]} />
          <Text style={[styles.buildSheetTitle, { color: colors.text }]}>build {selectedData.fullDay.toLowerCase()}'s look</Text>
          <View style={styles.buildOptionGrid}>
            {[
              { icon: "grid", label: "my wardrobe", sub: "browse pieces" },
              { icon: "star", label: "saved looks", sub: "my favourites" },
              { icon: "copy", label: "copy a day", sub: "reuse a look" },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.icon}
                style={[styles.buildOption, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => setShowBuildSheet(false)}
              >
                <View style={[styles.buildOptionIcon, { backgroundColor: colors.brassSubtle }]}>
                  <Feather name={opt.icon as any} size={18} color={colors.primary} />
                </View>
                <Text style={[styles.buildOptionLabel, { color: colors.text }]}>{opt.label}</Text>
                <Text style={[styles.buildOptionSub, { color: colors.mutedForeground }]}>{opt.sub}</Text>
              </TouchableOpacity>
            ))}
          </View>
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
    color: "#BBBBBB",
    letterSpacing: 0.5,
  },
  togglePillTextActive: {
    fontFamily: "Inter_500Medium",
    color: "#0A0A0A",
  },
  scrollContent: {
    paddingHorizontal: 20,
    gap: 12,
  },
  weekdayRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  weekdayLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    width: (width - 40 - 24) / 7,
    textAlign: "center",
  },
  weekGrid: {
    flexDirection: "row",
    gap: 4,
  },
  weekCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 10,
    borderWidth: 0.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  weekCellDate: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#A3A3A3",
  },
  outfitSwatch: {
    width: 14,
    height: 14,
    borderRadius: 4,
  },
  eventIndicator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(201,168,76,0.5)",
    position: "absolute",
    top: 4,
    right: 4,
  },
  glanceSection: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
  },
  sectionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    letterSpacing: 1.5,
    textTransform: "uppercase",
  },
  shuffleLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: "#C9A84C",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  dayCardsRow: {
    gap: 6,
    paddingRight: 4,
  },
  dayCard: {
    width: (width - 40 - 36) / 7,
    backgroundColor: "#111111",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    padding: 6,
    alignItems: "center",
    gap: 6,
  },
  dayCardAbbr: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
  },
  dayCardSwatch: {
    width: 24,
    height: 24,
    borderRadius: 6,
  },
  dayCardEmpty: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 0.5,
    borderColor: "#2A2A2A",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  divider: {
    height: 0.5,
    marginVertical: 4,
  },
  detailCard: {
    backgroundColor: "#111111",
    borderRadius: 20,
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    padding: 16,
    gap: 14,
  },
  detailHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  detailDate: {
    fontFamily: "CormorantGaramond_600SemiBold",
    fontSize: 17,
    color: "#F0ECE4",
    marginBottom: 3,
  },
  detailSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: "#A3A3A3",
  },
  weatherPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#0F0F0F",
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  weatherText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "#E0D8CC",
  },
  weatherSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  outfitStrip: {
    gap: 8,
    paddingRight: 4,
  },
  pieceTile: {
    backgroundColor: "#0F0F0F",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    padding: 10,
    alignItems: "center",
    gap: 6,
    width: 76,
  },
  pieceIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  pieceLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
    textAlign: "center",
  },
  eventRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: "#0F0F0F",
    borderRadius: 10,
    padding: 10,
    marginBottom: 6,
  },
  eventDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  eventName: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#CCCCCC",
    flex: 1,
  },
  eventTime: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  eventTag: {
    backgroundColor: "rgba(201,168,76,0.1)",
    borderRadius: 6,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  eventTagText: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#C9A84C",
  },
  actionGrid: {
    flexDirection: "row",
    gap: 8,
  },
  actionSolid: {
    flex: 1,
    backgroundColor: "#C9A84C",
    borderRadius: 12,
    padding: 11,
    alignItems: "center",
    gap: 3,
  },
  actionSolidLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#0A0A0A",
  },
  actionSolidSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#5A4A1A",
  },
  actionGhost: {
    flex: 1,
    backgroundColor: "transparent",
    borderRadius: 12,
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.33)",
    padding: 11,
    alignItems: "center",
    gap: 3,
  },
  actionGhostLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#C9A84C",
  },
  actionGhostSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
  },
  shuffleCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    borderRadius: 16,
    padding: 14,
    gap: 12,
  },
  shuffleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#1F1A0D",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.27)",
    alignItems: "center",
    justifyContent: "center",
  },
  shuffleText: {
    flex: 1,
    gap: 3,
  },
  shuffleTitle: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#E0D8CC",
  },
  shuffleSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  shuffleArrow: {
    opacity: 0.5,
  },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  monthCell: {
    width: (width - 40 - 18) / 7,
    aspectRatio: 1,
    borderRadius: 8,
    backgroundColor: "#111111",
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  monthCellText: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
  },
  monthDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(201,168,76,0.5)",
  },
  recapRow: {
    gap: 8,
    paddingTop: 8,
    paddingBottom: 8,
  },
  recapCard: {
    width: 60,
    height: 70,
    backgroundColor: "#111111",
    borderRadius: 10,
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    padding: 6,
    gap: 6,
    alignItems: "center",
    justifyContent: "center",
  },
  recapSwatches: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    width: 36,
  },
  recapSwatch: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  recapWeek: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
  },
  overviewContainer: {
    gap: 12,
  },
  overviewStat: {
    backgroundColor: "#111111",
    borderRadius: 16,
    borderWidth: 0.5,
    borderColor: "#1A1A1A",
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  overviewStatNum: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 52,
    color: "#C9A84C",
    letterSpacing: -2,
  },
  overviewStatLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: "#A3A3A3",
    letterSpacing: 0.5,
  },
  sheetBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  buildSheet: {
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
    marginBottom: 4,
  },
  buildSheetTitle: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 20,
    color: "#F0ECE4",
  },
  buildOptionGrid: {
    flexDirection: "row",
    gap: 8,
  },
  buildOption: {
    flex: 1,
    backgroundColor: "#161616",
    borderRadius: 14,
    borderWidth: 0.5,
    borderColor: "#1E1E1E",
    padding: 14,
    alignItems: "center",
    gap: 8,
  },
  buildOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#1F1A0D",
    borderWidth: 0.5,
    borderColor: "rgba(201,168,76,0.27)",
    alignItems: "center",
    justifyContent: "center",
  },
  buildOptionLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: "#E0D8CC",
    textAlign: "center",
  },
  buildOptionSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 9,
    color: "#A3A3A3",
    textAlign: "center",
  },
});
