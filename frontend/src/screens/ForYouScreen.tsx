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
import ReactNativeHapticFeedback from "react-native-haptic-feedback";

const { width, height } = Dimensions.get("window");

const FOR_YOU_POSTS = [
  { id: "1", title: "weekend capsule", handle: "@minimalist.k", aesthetic: "neutral", bgColor: "#1A2218", tall: false, hasSimilar: true },
  { id: "2", title: "city stroll", handle: "@ariadne.s", aesthetic: "chic", bgColor: "#1A1822", tall: true, hasSimilar: false },
  { id: "3", title: "sunset hues", handle: "@priya.m", aesthetic: "vibrant", bgColor: "#201A10", tall: true, hasSimilar: true },
  { id: "4", title: "effortless linen", handle: "@stylebypriya", aesthetic: "breezy", bgColor: "#181A22", tall: false, hasSimilar: false },
];

export default function ForYouScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const [selectedPost, setSelectedPost] = useState<typeof FOR_YOU_POSTS[0] | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const leftCol = FOR_YOU_POSTS.filter((_, i) => i % 2 === 0);
  const rightCol = FOR_YOU_POSTS.filter((_, i) => i % 2 !== 0);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <TouchableOpacity 
          style={styles.iconBtn} 
          onPress={() => navigation.goBack()}
        >
          <Feather name="chevron-left" size={20} color="#C9A84C" />
        </TouchableOpacity>
        <Text style={styles.screenTitle}>For You</Text>
        <View style={{ width: 34 }} />
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: bottomPad + 40 }]}
      >
        <Text style={styles.sectionLabel}>CURATED FOR YOUR STYLE</Text>
        
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.8)",
  },
  postDetailSheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#111111",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    borderTopWidth: 1,
    borderColor: "#2A2A2A",
    height: height * 0.85,
    padding: 24,
    alignItems: "center",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#333",
    borderRadius: 2,
    marginBottom: 20,
  },
  postDetailImage: {
    width: "100%",
    height: 340,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  postDetailAesthetic: {
    fontFamily: "CormorantGaramond_400Regular",
    fontSize: 32,
    color: "rgba(255,255,255,0.05)",
  },
  postDetailContent: {
    width: "100%",
    gap: 8,
  },
  postDetailTitle: {
    fontFamily: "CormorantGaramond_700Bold",
    fontSize: 28,
    color: "#F0ECE4",
  },
  postDetailHandle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: "#BBBBBB",
  },
  postDetailActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 16,
  },
  postDetailSave: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#C9A84C",
    paddingVertical: 16,
    borderRadius: 16,
  },
  postDetailSaveText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#0A0A0A",
  },
  postDetailTryOn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)",
    paddingVertical: 16,
    borderRadius: 16,
  },
  postDetailTryOnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#C9A84C",
  },
});
