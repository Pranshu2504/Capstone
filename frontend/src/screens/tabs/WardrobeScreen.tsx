import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Text,
  Platform,
  Modal,
  TextInput,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useColors } from '@/hooks/useColors';

// ─── Design Tokens ───────────────────────────────────────────────────────────
const C = {
  bg: '#0E0B07',
  headerBg: '#1A1208',
  headerBorder: '#2A1E0A',
  healthBg: '#120F08',
  healthBorder: '#1E1608',
  brass: '#C9A84C',
  card: '#141008',
  cardBorder: '#2A1E0A',
  surfaceShelf: '#0F0C07',
  surfaceRack: '#0D0A06',
  green: '#7ABA7A',
  warmWhite: '#E0D8CC',
  lightWarm: '#F0ECE4',
  muted555: '#999999',
  muted888: '#BBBBBB',
  muted444: '#BBBBBB',
  muted666: '#AAAAAA',
  warnBg: '#2A1010',
  warnText: '#AA6060',
  warnBorder: '#3A1A1A',
  trackBg: '#1E1E1E',
  rod: '#3A2A10',
  pill: '#181208',
  pillBorder: '#2A1E0A',
};

// ─── Static Data ─────────────────────────────────────────────────────────────
const FILTER_PILLS = ['all', 'casual', 'formal', 'neutral', 'indian', 'unused', 'seasonal'];

const TOPS = [
  { id: 't1', name: 'sage shirt',   bg: '#1E2A1E', stroke: '#3A5A3A', wears: 12, cat: 'casual' },
  { id: 't2', name: 'navy tee',     bg: '#1A1A2E', stroke: '#2A2A5A', wears: 8,  cat: 'casual' },
  { id: 't3', name: 'white oxford', bg: '#1E1E1E', stroke: '#3A3A3A', wears: 5,  cat: 'formal' },
  { id: 't4', name: 'rust blouse',  bg: '#221818', stroke: '#5A3030', wears: 1,  cat: 'casual' },
  { id: 't5', name: 'olive tee',    bg: '#1E2218', stroke: '#3A4A2A', wears: 6,  cat: 'casual' },
];

const DRESSES = [
  { id: 'd1', name: 'mauve midi',    bg: '#1E1428', stroke: '#3A2A5A', wears: 4, cat: 'casual' },
  { id: 'd2', name: 'maroon kurta',  bg: '#1A0E0E', stroke: '#4A1A1A', wears: 2, cat: 'indian' },
  { id: 'd3', name: 'gold anarkali', bg: '#1E1E14', stroke: '#3A3A2A', wears: 0, cat: 'indian' },
  { id: 'd4', name: 'teal sundress', bg: '#141E1E', stroke: '#2A4A4A', wears: 3, cat: 'casual' },
];

const BOTTOMS = [
  { id: 'b1', name: 'navy trousers', bg: '#1A2030', wears: 9  },
  { id: 'b2', name: 'dark denim',    bg: '#181820', wears: 14 },
  { id: 'b3', name: 'olive cargos',  bg: '#1E2218', wears: 5  },
  { id: 'b4', name: 'khaki trousers',bg: '#221E14', wears: 0  },
  { id: 'b5', name: 'sweatpants',    bg: '#1A1414', wears: 3  },
];


const OUTFITS = [
  {
    id: 'o1', name: 'monday ease', wears: '3×', occasion: 'casual',
    pieces: ['#1A2030', '#1E2218', '#1E1E1E', '#141414'],
  },
  {
    id: 'o2', name: 'office sharp', wears: '5×', occasion: 'office',
    pieces: ['#1E1E1E', '#1A2030', '#141414', '#1A1208'],
  },
  {
    id: 'o3', name: 'brunch date', wears: '2×', occasion: 'brunch',
    pieces: ['#1E1428', '#221E14', '#1E1A10', '#1A0E0E'],
  },
];

const WEAR_DOTS = [
  '#4A7A5A','#4A6A9A','#C9A84C','#4A7A5A',
  '#9A5A7A','#4A6A9A','#4A7A5A','#C9A84C',
  '#4A6A9A','#4A7A5A','#9A5A7A','#C9A84C',
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, count }: { title: string; count: number }) {
  return (
    <View style={sh.row}>
      <View style={sh.accent} />
      <Text style={sh.title}>{title.toUpperCase()}</Text>
      <Text style={sh.count}>{count} items</Text>
      <TouchableOpacity>
        <Text style={sh.seeAll}>see all</Text>
      </TouchableOpacity>
    </View>
  );
}
const sh = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  accent: { width: 2, height: 12, backgroundColor: C.brass, marginRight: 6 },
  title:  { fontFamily: 'Inter_500Medium', fontSize: 11, color: C.warmWhite, letterSpacing: 0.55, flex: 1 },
  count:  { fontFamily: 'Inter_400Regular', fontSize: 9, color: C.muted555, marginRight: 8 },
  seeAll: { fontFamily: 'Inter_400Regular', fontSize: 9, color: C.brass },
});

function RailCard({ children, showRod = true }: { children: React.ReactNode; showRod?: boolean }) {
  return (
    <View style={rc.card}>
      {showRod && (
        <View style={rc.rodWrapper}>
          <View style={rc.rodBar} />
          <View style={rc.bracketL} />
          <View style={rc.bracketR} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rc.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const rc = StyleSheet.create({
  card:       { backgroundColor: C.card, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 14 },
  rodWrapper: { height: 6, marginBottom: 10 },
  rodBar:     { position: 'absolute', left: 0, right: 0, top: 3, height: 3, backgroundColor: C.rod, borderRadius: 2 },
  bracketL:   { position: 'absolute', left: 10, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(201,168,76,0.27)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  bracketR:   { position: 'absolute', right: 10, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(201,168,76,0.27)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  scroll:     { gap: 8, alignItems: 'flex-start' },
});

function HangerItem({
  name, bg, stroke, wears, cat, isDress,
}: { name: string; bg: string; stroke: string; wears: number; cat: string; isDress?: boolean }) {
  const lowWear = wears <= 1;
  return (
    <View style={hng.wrapper}>
      <View style={hng.hook} />
      <View style={hng.bar} />
      <View style={[hng.card, { backgroundColor: bg }, lowWear && hng.cardWarn]}>
        <Feather name={isDress ? 'user' : 'shopping-bag'} size={20} color={stroke} />
        <View style={[hng.badge, lowWear && hng.badgeWarn]}>
          <Text style={[hng.badgeText, lowWear && hng.badgeTextWarn]}>{wears}×</Text>
        </View>
      </View>
      <Text style={hng.name} numberOfLines={1}>{name}</Text>
      <Text style={hng.cat}>{cat}</Text>
    </View>
  );
}
const hng = StyleSheet.create({
  wrapper:       { width: 78, alignItems: 'center' },
  hook:          { width: 2, height: 10, backgroundColor: 'rgba(201,168,76,0.33)' },
  bar:           { width: 52, height: 2, backgroundColor: C.rod, marginBottom: 6 },
  card:          { width: 72, height: 84, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'transparent' },
  cardWarn:      { borderColor: '#3A1A1A' },
  badge:         { position: 'absolute', top: 4, right: 4, backgroundColor: 'rgba(10,10,10,0.6)', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  badgeWarn:     { backgroundColor: C.warnBg },
  badgeText:     { fontSize: 7, fontFamily: 'Inter_400Regular', color: C.brass },
  badgeTextWarn: { color: C.warnText },
  name:          { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.muted888, marginTop: 6, maxWidth: 76, textAlign: 'center' },
  cat:           { fontFamily: 'Inter_400Regular', fontSize: 7, color: C.muted444, marginTop: 2 },
});

function ShelfCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={sc.card}>
      <View style={sc.shelf} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { backgroundColor: C.surfaceShelf, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 14 },
  shelf: { height: 3, backgroundColor: C.cardBorder, marginBottom: 12, borderRadius: 1.5 },
  scroll:{ gap: 8, alignItems: 'flex-start' },
});

function FoldedItem({ name, bg, wears }: { name: string; bg: string; wears: number }) {
  const lowWear = wears === 0;
  return (
    <View style={fi.wrapper}>
      <View style={[fi.fold, { backgroundColor: bg }]}>
        <Feather name="minus" size={18} color={lowWear ? C.warnText : C.muted555} />
        <Text style={[fi.wears, lowWear && fi.wearsWarn]}>{wears}×</Text>
      </View>
      <Text style={[fi.name, lowWear && fi.nameWarn]} numberOfLines={1}>{name}</Text>
    </View>
  );
}
const fi = StyleSheet.create({
  wrapper:   { width: 80, alignItems: 'center' },
  fold:      { width: 80, height: 62, borderRadius: 10, alignItems: 'center', justifyContent: 'center', gap: 6 },
  wears:     { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.muted555 },
  wearsWarn: { color: C.warnText },
  name:      { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.muted888, marginTop: 6, maxWidth: 78, textAlign: 'center' },
  nameWarn:  { color: C.warnText },
});

function RackCard({ children }: { children: React.ReactNode }) {
  return (
    <View style={rak.card}>
      <View style={rak.rackLine} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rak.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const rak = StyleSheet.create({
  card:     { backgroundColor: C.surfaceRack, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 14 },
  rackLine: { height: 2, backgroundColor: C.cardBorder, marginBottom: 12 },
  scroll:   { gap: 8, alignItems: 'flex-start' },
});


function OutfitCard({ name, wears, occasion, pieces }: typeof OUTFITS[0]) {
  return (
    <View style={oc.card}>
      <View style={oc.mosaic}>
        {pieces.map((bg, i) => (
          <View key={i} style={[oc.piece, { backgroundColor: bg }]}>
            <Feather name={i < 2 ? 'shopping-bag' : i === 2 ? 'minus' : 'arrow-right'} size={10} color="rgba(255,255,255,0.2)" />
          </View>
        ))}
      </View>
      <Text style={oc.name} numberOfLines={1}>{name}</Text>
      <Text style={oc.wears}>{wears}</Text>
      <Text style={oc.occasion}>{occasion}</Text>
    </View>
  );
}
const oc = StyleSheet.create({
  card:     { width: 108, backgroundColor: '#0E0B07', borderRadius: 12, borderWidth: 0.5, borderColor: '#1E1608', overflow: 'hidden' },
  mosaic:   { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 6, height: 86 },
  piece:    { width: '47%', flex: 1, minHeight: 36, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  name:     { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.warmWhite, paddingHorizontal: 8, paddingTop: 6 },
  wears:    { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.brass, paddingHorizontal: 8, paddingTop: 2 },
  occasion: { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.muted555, paddingHorizontal: 8, paddingBottom: 8, paddingTop: 1 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function WardrobeScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLink, setImportLink] = useState('');

  const topPad = Platform.OS === 'web' ? 44 : insets.top;

  const handleImportSubmit = () => {
    ReactNativeHapticFeedback.trigger('notificationSuccess');
    setShowImportModal(false);
    setImportLink('');
    navigation.navigate('lens');
  };

  const handleFilterPress = (pill: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setActiveFilter(pill);
  };

  return (
    <View style={[s.root, { paddingTop: topPad }]}>

      {/* ── Wardrobe Header Bar ── */}
      <View style={s.headerBar}>
        <Text style={s.headerTitle}>ZORA · The Wardrobe</Text>
        <View style={s.headerIcons}>
          <TouchableOpacity style={s.iconBtn}>
            <Feather name="search" size={11} color={C.brass} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn}>
            <Feather name="sliders" size={11} color={C.brass} />
          </TouchableOpacity>
          <TouchableOpacity style={s.iconBtn} onPress={() => navigation.navigate('Identity')}>
            <Feather name="user" size={11} color={C.brass} />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Wardrobe Health Strip ── */}
      <View style={s.healthStrip}>
        <Feather name="activity" size={14} color={C.green} style={{ marginRight: 2 }} />
        <Text style={s.healthLabel}>wardrobe health</Text>
        <View style={s.trackOuter}>
          <View style={[s.trackFill, { width: '78%' }]} />
        </View>
        <Text style={s.healthPct}>78%</Text>
      </View>

      {/* ── Filter Pill Bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterBar}
        contentContainerStyle={s.filterScroll}
      >
        {FILTER_PILLS.map((pill) => {
          const active = activeFilter === pill;
          return (
            <TouchableOpacity
              key={pill}
              onPress={() => handleFilterPress(pill)}
              style={[s.pill, active ? [s.pillActive, { backgroundColor: colors.brass }] : s.pillInactive]}
            >
              <Text style={[s.pillText, active ? s.pillTextActive : s.pillTextInactive]}>
                {pill}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Main Scroll ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
      >

        {/* Add to Wardrobe Strip */}
        <View style={[s.addStrip, { marginTop: 16, marginBottom: 4 }]}>
          <TouchableOpacity style={s.addCardPrimary} activeOpacity={0.85}>
            <Feather name="camera" size={16} color="#0A0A0A" />
            <Text style={s.addCardPrimaryText}>photograph it</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={s.addCardSecondary} 
            activeOpacity={0.85}
            onPress={() => {
              ReactNativeHapticFeedback.trigger('impactLight');
              setShowImportModal(true);
            }}
          >
            <Feather name="link" size={14} color={C.muted888} />
            <Text style={s.addCardSecondaryText}>import link</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addCardSecondary} activeOpacity={0.85}>
            <Feather name="image" size={14} color={C.muted888} />
            <Text style={s.addCardSecondaryText}>from gallery</Text>
          </TouchableOpacity>
        </View>

        {/* Section 1: Tops */}
        <SectionHeader title="Tops" count={TOPS.length} />
        <RailCard>
          {TOPS.map((item) => (
            <HangerItem key={item.id} {...item} />
          ))}
        </RailCard>

        {/* Section 2: Dresses & Ethnic */}
        <SectionHeader title="Dresses & Ethnic" count={DRESSES.length} />
        <RailCard>
          {DRESSES.map((item) => (
            <HangerItem key={item.id} {...item} isDress />
          ))}
        </RailCard>

        {/* Section 3: Bottoms */}
        <SectionHeader title="Bottoms" count={BOTTOMS.length} />
        <ShelfCard>
          {BOTTOMS.map((item) => (
            <FoldedItem key={item.id} {...item} />
          ))}
        </ShelfCard>


        {/* Section 6: Saved Outfits */}
        <SectionHeader title="Saved Outfits" count={OUTFITS.length} />
        <View style={s.outfitCard}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.outfitScroll}>
            {OUTFITS.map((o) => (
              <OutfitCard key={o.id} {...o} />
            ))}
          </ScrollView>
        </View>

        {/* Section 7: Item Detail Panel */}
        <View style={s.detailCard}>
          <View style={s.dragHandle} />
          {/* Header */}
          <View style={s.detailHeader}>
            <View style={s.detailThumb}>
              <Feather name="shopping-bag" size={22} color="#3A5A3A" />
            </View>
            <View style={s.detailInfo}>
              <Text style={s.detailName}>sage linen shirt</Text>
              <View style={s.tagsRow}>
                <View style={s.tagGold}>
                  <Text style={s.tagGoldText}>tops</Text>
                </View>
                {['casual', 'linen', 'sage'].map((t) => (
                  <View key={t} style={s.tag}>
                    <Text style={s.tagText}>{t}</Text>
                  </View>
                ))}
              </View>
              <Text style={s.wearsLabel}>12 wears by occasion:</Text>
              <View style={s.dotsRow}>
                {WEAR_DOTS.map((col, i) => (
                  <View key={i} style={[s.dot, { backgroundColor: col }]} />
                ))}
              </View>
            </View>
          </View>
          {/* Actions */}
          <View style={s.actionRow}>
            <TouchableOpacity style={s.btnTryOn}>
              <Text style={s.btnTryOnText}>try on</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnPair}>
              <Text style={s.btnPairText}>pair with</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.btnRemove}>
              <Text style={s.btnRemoveText}>remove</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* ── Import Link Modal ── */}
      <Modal visible={showImportModal} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalBackdrop} 
          activeOpacity={1} 
          onPress={() => setShowImportModal(false)}
        />
        <View style={s.importModal}>
          <Text style={s.importModalTitle}>Import from link</Text>
          <Text style={s.importModalSub}>Paste a link from Zara, H&M, Myntra, etc. to digitally try on this garment.</Text>
          
          <View style={s.inputWrapper}>
            <Feather name="link" size={16} color={C.brass} style={{ marginRight: 8 }} />
            <TextInput
              style={s.linkInput}
              placeholder="https://"
              placeholderTextColor={C.muted666}
              value={importLink}
              onChangeText={setImportLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>

          <TouchableOpacity 
            style={[s.importSubmitBtn, !importLink && { opacity: 0.5 }]}
            onPress={handleImportSubmit}
            disabled={!importLink}
          >
            <Text style={s.importSubmitText}>Import & Try On</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  // Header bar
  headerBar:    { height: 36, backgroundColor: C.headerBg, borderBottomWidth: 2, borderBottomColor: '#2A1E0A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  headerTitle:  { fontFamily: 'Inter_400Regular', fontSize: 9, color: C.brass, letterSpacing: 1.5, flex: 1 },
  headerIcons:  { flexDirection: 'row', gap: 6 },
  iconBtn:      { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1F1208', borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center' },

  // Health strip
  healthStrip:  { backgroundColor: C.healthBg, borderBottomWidth: 1, borderBottomColor: C.healthBorder, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthLabel:  { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.green },
  trackOuter:   { flex: 1, height: 5, backgroundColor: C.trackBg, borderRadius: 3, overflow: 'hidden' },
  trackFill:    { height: '100%', backgroundColor: C.brass, borderRadius: 3 },
  healthPct:    { fontFamily: 'Inter_500Medium', fontSize: 13, color: C.brass },

  // Filter pills
  filterBar:    { height: 52, borderBottomWidth: 1, borderBottomColor: '#1A1408', backgroundColor: C.bg },
  filterScroll: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center', height: 52 },
  pill:         { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pillActive:   { backgroundColor: C.brass },
  pillInactive: { backgroundColor: '#181208', borderWidth: 0.5, borderColor: '#2A1E0A' },
  pillText:     { fontFamily: 'Inter_500Medium', fontSize: 11 },
  pillTextActive:   { color: '#0A0A0A' },
  pillTextInactive: { color: C.muted666 },

  // Scroll
  scroll: { paddingHorizontal: 12, paddingBottom: 120, gap: 0 },

  // Accessories
  accessCard:         { backgroundColor: C.surfaceRack, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 14 },
  accessGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accessCell:         { width: '22%', flex: 1, aspectRatio: 1, backgroundColor: C.card, borderRadius: 10, borderWidth: 0.5, borderColor: '#1E1608', alignItems: 'center', justifyContent: 'center', gap: 3 },
  accessCellFeatured: { backgroundColor: '#1A1208', borderColor: 'rgba(201,168,76,0.27)' },
  accessLabel:        { fontFamily: 'Inter_400Regular', fontSize: 7, color: C.muted555, textAlign: 'center' },
  accessLabelFeatured:{ color: C.brass },

  // Outfits
  outfitCard:   { backgroundColor: C.card, borderRadius: 14, borderWidth: 0.5, borderColor: C.cardBorder, padding: 10 },
  outfitScroll: { gap: 8 },

  // Item Detail
  detailCard:   { backgroundColor: C.card, borderRadius: 16, borderWidth: 0.5, borderColor: C.cardBorder, padding: 16, marginTop: 10 },
  dragHandle:   { width: 36, height: 3, backgroundColor: C.cardBorder, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  detailHeader: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  detailThumb:  { width: 56, height: 64, backgroundColor: '#1A1208', borderRadius: 10, borderWidth: 0.5, borderColor: C.cardBorder, alignItems: 'center', justifyContent: 'center' },
  detailInfo:   { flex: 1, gap: 4 },
  detailName:   { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 14, color: '#F0ECE4' },
  tagsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagGold:      { backgroundColor: '#1F1A0D', borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.27)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tagGoldText:  { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.brass },
  tag:          { backgroundColor: '#1E1608', borderWidth: 0.5, borderColor: C.cardBorder, borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tagText:      { fontFamily: 'Inter_400Regular', fontSize: 8, color: C.muted888 },
  wearsLabel:   { fontFamily: 'Inter_400Regular', fontSize: 9, color: C.muted555, marginTop: 2 },
  dotsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  dot:          { width: 7, height: 7, borderRadius: 3.5 },
  actionRow:    { flexDirection: 'row', gap: 6 },
  btnTryOn:     { flex: 1, backgroundColor: C.brass, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnTryOnText: { fontFamily: 'Inter_500Medium', fontSize: 10, color: '#0A0A0A' },
  btnPair:      { flex: 1, borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.33)', borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnPairText:  { fontFamily: 'Inter_500Medium', fontSize: 10, color: C.brass },
  btnRemove:    { flex: 1, backgroundColor: '#2A1414', borderWidth: 0.5, borderColor: '#5A2A2A', borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnRemoveText:{ fontFamily: 'Inter_500Medium', fontSize: 10, color: C.warnText },

  // Add strip
  addStrip:           { flexDirection: 'row', gap: 8, marginTop: 12 },
  addCardPrimary:     { flex: 1, backgroundColor: C.brass, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  addCardPrimaryText: { fontFamily: 'Inter_500Medium', fontSize: 9, color: '#0A0A0A' },
  addCardSecondary:   { flex: 1, backgroundColor: C.card, borderWidth: 0.5, borderColor: C.cardBorder, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  addCardSecondaryText:{ fontFamily: 'Inter_400Regular', fontSize: 9, color: C.muted666 },
  
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  importModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#111111',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'web' ? 24 : 44,
  },
  importModalTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 20, color: '#F0ECE4', marginBottom: 6 },
  importModalSub: { fontFamily: 'Inter_400Regular', fontSize: 11, color: C.muted888, marginBottom: 20, lineHeight: 16 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.3)',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 20,
  },
  linkInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 14,
    color: '#E0D8CC',
  },
  importSubmitBtn: {
    backgroundColor: C.brass,
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importSubmitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 13,
    color: '#000000',
    letterSpacing: 0.5,
  },
});
