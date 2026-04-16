import React, { useState, useRef, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Text,
  Platform,
  Dimensions,
  ViewToken,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useColors } from '@/hooks/useColors';
import { useTheme } from '@/context/ThemeContext';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

export type ClothingItem = {
  id: string;
  name: string;
  bg: string;
  stroke?: string;
  wears: number; // quantity owned
  cat?: string;
  isDress?: boolean;
};

const getWoodTone = (theme: 'light' | 'dark') => ({
  rod: theme === 'dark' ? '#3A2A10' : '#8B7355',
  bracketBorder: theme === 'dark' ? 'rgba(201,168,76,0.4)' : 'rgba(122,139,111,0.4)',
});

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CARD_W = SCREEN_W * 0.72;
const CARD_GAP = 16;
const SIDE_PAD = (SCREEN_W - CARD_W) / 2;
const SNAP_INTERVAL = CARD_W + CARD_GAP;

// Space reserved by everything except the carousel card:
// header ~70 + carousel marginTop 24 + pagination 32 + item info 68 + gap 10 + actions 72 ≈ 276
const RESERVED_H = 276;
const CARD_H_HANGER = Math.min(480, Math.max(280, SCREEN_H - RESERVED_H));
const CARD_H_FOLDED  = Math.min(340, Math.max(200, (SCREEN_H - RESERVED_H) * 0.72));

export default function ClothingCategoryScreen() {
  const colors = useColors();
  const { theme } = useTheme();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();

  const { title, item, count, displayType } = route.params as {
    title: string;
    item: ClothingItem;
    count: number;
    displayType: 'hanger' | 'folded';
  };

  const [currentIndex, setCurrentIndex] = useState(0);
  const woods = getWoodTone(theme as any);
  const cardH = displayType === 'folded' ? CARD_H_FOLDED : CARD_H_HANGER;
  const topPad = Platform.OS === 'web' ? 44 : insets.top;

  const copies = Array.from({ length: count }, (_, i) => ({
    copyId: `${item.id}-${i}`,
    copyNumber: i + 1,
  }));

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems.length > 0 && viewableItems[0].index !== null) {
        setCurrentIndex(viewableItems[0].index);
        ReactNativeHapticFeedback.trigger('selection');
      }
    },
    [],
  );

  return (
    <View style={[cs.root, { backgroundColor: colors.background }]}>
      {/* ── Header ── */}
      <View style={[cs.header, { paddingTop: topPad + 8, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity
          style={[cs.backBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
          onPress={() => navigation.goBack()}
        >
          <Feather name="arrow-left" size={14} color={colors.primary} />
        </TouchableOpacity>
        <View style={cs.headerCenter}>
          <Text style={[cs.headerTitle, { color: colors.text }]}>{title.toUpperCase()}</Text>
          <Text style={[cs.headerSub, { color: colors.mutedForeground }]}>{count} in wardrobe</Text>
        </View>
        <View style={{ width: 32 }} />
      </View>

      {/* ── Carousel ── */}
      <View style={{ marginTop: 24 }}>
        <FlatList
          data={copies}
          keyExtractor={c => c.copyId}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={SNAP_INTERVAL}
          decelerationRate="fast"
          contentContainerStyle={{ paddingHorizontal: SIDE_PAD }}
          ItemSeparatorComponent={() => <View style={{ width: CARD_GAP }} />}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          renderItem={({ index }) => {
            const isActive = index === currentIndex;

            if (displayType === 'hanger') {
              return (
                <View
                  style={[
                    cs.hangerCard,
                    {
                      width: CARD_W,
                      height: cardH,
                      backgroundColor: item.bg,
                      // Active: full opacity + gold border. Inactive: heavily dimmed, no border.
                      opacity: isActive ? 1 : 0.38,
                      borderWidth: isActive ? 1.5 : 0,
                      borderColor: isActive ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  <View style={cs.hangerHardware}>
                    <View style={[cs.hangerHook, { backgroundColor: woods.bracketBorder }]} />
                    <View style={[cs.hangerRod, { backgroundColor: woods.rod }]} />
                  </View>
                  <View style={cs.iconArea}>
                    <Feather
                      name={item.isDress ? 'user' : 'shopping-bag'}
                      size={80}
                      color={item.stroke || 'rgba(255,255,255,0.18)'}
                    />
                  </View>
                  {count > 1 && (
                    <View style={[cs.copyBadge, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                      <Text style={[cs.copyBadgeText, { color: colors.primary }]}>
                        {index + 1} / {count}
                      </Text>
                    </View>
                  )}
                </View>
              );
            } else {
              return (
                <View
                  style={[
                    cs.foldedCard,
                    {
                      width: CARD_W,
                      height: cardH,
                      backgroundColor: item.bg,
                      opacity: isActive ? 1 : 0.38,
                      borderWidth: isActive ? 1.5 : 0,
                      borderColor: isActive ? colors.primary : 'transparent',
                    },
                  ]}
                >
                  {/* Fold lines */}
                  <View style={cs.foldLinesArea}>
                    <View style={[cs.foldLine, { opacity: 0.4 }]} />
                    <View style={[cs.foldLine, { opacity: 0.25 }]} />
                    <View style={[cs.foldLine, { opacity: 0.14 }]} />
                  </View>
                  {count > 1 && (
                    <View style={[cs.copyBadge, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                      <Text style={[cs.copyBadgeText, { color: colors.primary }]}>
                        {index + 1} / {count}
                      </Text>
                    </View>
                  )}
                </View>
              );
            }
          }}
        />
      </View>

      {/* ── Pagination ── */}
      <View style={cs.pagination}>
        {count <= 9 ? (
          copies.map((_, i) => (
            <View
              key={i}
              style={[
                cs.dot,
                {
                  backgroundColor: i === currentIndex ? colors.primary : colors.border,
                  width: i === currentIndex ? 18 : 6,
                },
              ]}
            />
          ))
        ) : (
          <Text style={[cs.paginationText, { color: colors.mutedForeground }]}>
            {currentIndex + 1} of {count}
          </Text>
        )}
      </View>

      {/* ── Item info ── */}
      <View style={cs.itemInfo}>
        <Text style={[cs.itemName, { color: colors.text }]}>{title}</Text>
        {item.cat && (
          <View style={[cs.tagGold, { backgroundColor: colors.brassSubtle, borderColor: colors.primary + '33' }]}>
            <Text style={[cs.tagGoldText, { color: colors.primary }]}>{item.cat}</Text>
          </View>
        )}
      </View>

      {/* ── Action buttons ── */}
      <View style={[cs.actions, { paddingBottom: insets.bottom + 16 }]}>
        <TouchableOpacity
          style={[cs.btnTryOn, { backgroundColor: colors.primary }]}
          onPress={() => navigation.navigate('Main', { screen: 'lens' })}
        >
          <Text style={[cs.btnText, { color: colors.primaryForeground }]}>try on</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cs.btnPair, { borderColor: colors.primary + '55' }]}>
          <Text style={[cs.btnText, { color: colors.primary }]}>pair with</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[cs.btnRemove, { backgroundColor: colors.destructive + '15', borderColor: colors.destructive + '33' }]}>
          <Text style={[cs.btnText, { color: colors.destructive }]}>remove</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  root: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 0.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCenter: { flex: 1, alignItems: 'center' },
  headerTitle: { fontFamily: 'Inter_500Medium', fontSize: 12, letterSpacing: 1.5 },
  headerSub: { fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 2 },

  // Hanger card
  hangerCard: { borderRadius: 20, overflow: 'hidden', alignItems: 'center' },
  hangerHardware: { alignItems: 'center', paddingTop: 20 },
  hangerHook: { width: 3, height: 20 },
  hangerRod: { width: '72%', height: 4, borderRadius: 2, marginTop: 2, marginBottom: 12 },
  iconArea: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Folded card
  foldedCard: { borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  foldLinesArea: { width: '70%', gap: 10 },
  foldLine: { height: 3, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 1.5 },

  // Copy badge
  copyBadge: {
    position: 'absolute',
    bottom: 14,
    right: 14,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  copyBadgeText: { fontFamily: 'Inter_500Medium', fontSize: 10 },

  // Pagination
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 5,
    marginTop: 14,
    height: 14,
  },
  dot: { height: 6, borderRadius: 3 },
  paginationText: { fontFamily: 'Inter_400Regular', fontSize: 11 },

  // Item info — sits directly below pagination, no huge gap
  itemInfo: { alignItems: 'center', paddingTop: 16, paddingHorizontal: 24, gap: 8 },
  itemName: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 24, textAlign: 'center' },
  tagGold: { borderWidth: 0.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  tagGoldText: { fontFamily: 'Inter_400Regular', fontSize: 9, letterSpacing: 0.5 },

  // Actions — immediately below item info
  actions: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  btnTryOn:  { flex: 1, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnPair:   { flex: 1, borderWidth: 0.5, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnRemove: { flex: 1, borderWidth: 0.5, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  btnText:   { fontFamily: 'Inter_500Medium', fontSize: 12 },
});
