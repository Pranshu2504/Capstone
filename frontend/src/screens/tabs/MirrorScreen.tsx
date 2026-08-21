import React, { useState, useEffect } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Platform,
  ImageBackground,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";
import { useColors } from "@/hooks/useColors";
import { useOutfitToday } from "@/api/hooks";
import { SCREEN_WIDTH } from '@/constants/layout';

const width = SCREEN_WIDTH;

export default function MirrorScreen() {
  const colors = useColors();
  const { data: outfitToday } = useOutfitToday();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const [currentTime, setCurrentTime] = useState(new Date());
  const [weatherData, setWeatherData] = useState("-- · --°");

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
                {outfitToday.headline}
              </Text>
              <Text style={[styles.heroSubhead, { color: colors.mutedForeground }]}>
                {outfitToday.subhead}
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

        {/* ── The main ask: let ZORA assemble today's outfit ── */}
        <TouchableOpacity
          style={[styles.stylistCTA, { borderColor: colors.brass, backgroundColor: colors.card }]}
          activeOpacity={0.85}
          onPress={() => {
            ReactNativeHapticFeedback.trigger("impactMedium");
            navigation.navigate("Stylist");
          }}
        >
          <View style={[styles.stylistIcon, { backgroundColor: colors.brassSubtle }]}>
            <Feather name="feather" size={16} color={colors.brass} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.stylistCTATitle, { color: colors.warmWhite }]}>
              what should I wear today?
            </Text>
            <Text style={[styles.stylistCTASub, { color: colors.mutedForeground }]}>
              a few questions, then a look built from your wardrobe
            </Text>
          </View>
          <Feather name="arrow-right" size={16} color={colors.brass} />
        </TouchableOpacity>
      </ScrollView>
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
  stylistCTA: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginTop: 20,
  },
  stylistIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  stylistCTATitle: {
    fontFamily: "PlayfairDisplay_700Bold",
    fontSize: 16,
    letterSpacing: -0.2,
  },
  stylistCTASub: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    lineHeight: 16,
    marginTop: 3,
  },
});
