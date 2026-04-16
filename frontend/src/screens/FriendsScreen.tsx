import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import Feather from "react-native-vector-icons/Feather";
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const FRIENDS_ACTIVITY = [
  { initials: "RG", name: "Rahul G.", action: "added 3 new places to wardrobe", time: "2h ago", swatches: ["#2A2020","#1A2030","#201810"] },
  { initials: "MS", name: "Meera S.", action: "tried on a Zara jacket via link", time: "5h ago", swatches: [] },
];

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={() => navigation.goBack()}
        >
          <Feather name="chevron-left" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Friends Activity</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 40 }]}
      >
        <View style={styles.friendsSection}>
          <Text style={styles.sectionLabel}>LATEST ACTIVITY</Text>

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
      </ScrollView>
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
    borderBottomWidth: 0.5,
    borderBottomColor: "#1A1A1A",
    marginBottom: 16,
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
    gap: 20,
  },
  sectionLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    color: "#A3A3A3",
    letterSpacing: 1.5,
    textTransform: "uppercase",
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
});
