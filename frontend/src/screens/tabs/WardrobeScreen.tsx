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
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '@/context/ThemeContext';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';
import { useColors } from '@/hooks/useColors';
import { pickImage, pickImages, type PickSource } from '@/utils/pickImage';
import { useOutfits, useUploadGarments, useWardrobe } from '@/api/hooks';
import type { ApiWardrobeItem } from '@/api/types';

// Design elements that should stay "woody" or specific to the closet vibe
const getWoodTone = (theme: 'light' | 'dark') => ({
  rod: theme === 'dark' ? '#3A2A10' : '#8B7355',
  shelf: theme === 'dark' ? '#1A1208' : '#E8E4DD',
  bracket: theme === 'dark' ? 'rgba(201,168,76,0.27)' : 'rgba(122,139,111,0.27)',
  bracketBorder: theme === 'dark' ? 'rgba(201,168,76,0.4)' : 'rgba(122,139,111,0.4)',
});

// ─── Static Data ─────────────────────────────────────────────────────────────
const FILTER_PILLS = ['all', 'office', 'casual', 'events', 'date', 'indian', 'unused'];

/** Stroke colour for the icon shown before a piece has a photo. */
const STROKE_FALLBACK = '#3A3A3A';

/**
 * Adapts a stored wardrobe item to the props the rail components take. The
 * swatch stands in as the card background so a photo that is still loading —
 * or an item added before uploads existed — still reads as the right colour.
 */
function toRailItem(item: ApiWardrobeItem) {
  return {
    id: item.id,
    name: item.name,
    bg: item.color,
    stroke: STROKE_FALLBACK,
    wears: item.timesWorn,
    cat: item.colorName,
    image: item.image,
  };
}






// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionHeader({ title, count, onSeeAll }: { title: string; count: number; onSeeAll?: () => void }) {
  const colors = useColors();
  return (
    <View style={sh.row}>
      <View style={[sh.accent, { backgroundColor: colors.primary }]} />
      <Text style={[sh.title, { color: colors.text }]}>{title.toUpperCase()}</Text>
      <Text style={[sh.count, { color: colors.mutedForeground }]}>{count} items</Text>
      <TouchableOpacity onPress={onSeeAll}>
        <Text style={[sh.seeAll, { color: colors.primary }]}>see all</Text>
      </TouchableOpacity>
    </View>
  );
}
const sh = StyleSheet.create({
  row:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingTop: 22, paddingBottom: 10 },
  accent: { width: 2, height: 12, marginRight: 6 },
  title:  { fontFamily: 'Inter_500Medium', fontSize: 13, letterSpacing: 0.55, flex: 1 },
  count:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#999999', marginRight: 8 },
  seeAll: { fontFamily: 'Inter_400Regular', fontSize: 12 },
});

function RailCard({ children, showRod = true }: { children: React.ReactNode; showRod?: boolean }) {
  const colors = useColors();
  const { theme } = useTheme();
  const woods = getWoodTone(theme as any);

  return (
    <View style={[rc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {showRod && (
        <View style={rc.rodWrapper}>
          <View style={[rc.rodBar, { backgroundColor: woods.rod }]} />
          <View style={[rc.bracketL, { backgroundColor: woods.bracket, borderColor: woods.bracketBorder }]} />
          <View style={[rc.bracketR, { backgroundColor: woods.bracket, borderColor: woods.bracketBorder }]} />
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rc.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const rc = StyleSheet.create({
  card:       { backgroundColor: '#111111', borderRadius: 14, borderWidth: 0.5, borderColor: '#2A1E0A', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  rodWrapper: { height: 6, marginBottom: 8 },
  rodBar:     { position: 'absolute', left: 0, right: 0, top: 3, height: 3, backgroundColor: '#3A2A10', borderRadius: 2 },
  bracketL:   { position: 'absolute', left: 10, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(201,168,76,0.27)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  bracketR:   { position: 'absolute', right: 10, top: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(201,168,76,0.27)', borderWidth: 1, borderColor: 'rgba(201,168,76,0.4)' },
  scroll:     { gap: 8, alignItems: 'flex-start' },
});

function HangerItem({
  name, bg, stroke, wears, cat, isDress, image, onPress,
}: { name: string; bg: string; stroke: string; wears: number; cat: string; isDress?: boolean; image?: string | null; onPress?: () => void }) {
  const colors = useColors();
  const { theme } = useTheme();
  const woods = getWoodTone(theme as any);
  const lowWear = wears <= 1;

  return (
    <TouchableOpacity style={hng.wrapper} onPress={onPress} activeOpacity={0.85}>
      <View style={[hng.hook, { backgroundColor: woods.bracketBorder }]} />
      <View style={[hng.bar, { backgroundColor: woods.rod }]} />
      <View style={[hng.card, { backgroundColor: bg }, lowWear && { borderColor: colors.destructive }]}>
        {image ? (
          <Image source={{ uri: image }} style={hng.photo} resizeMode="cover" />
        ) : (
          <Feather name={isDress ? 'user' : 'shopping-bag'} size={22} color={stroke} />
        )}
        <View style={[hng.badge, lowWear && { backgroundColor: theme === 'dark' ? '#2A1010' : colors.destructive + '22' }]}>
          <Text style={[hng.badgeText, { color: colors.primary }, lowWear && { color: colors.destructive }]}>{wears}×</Text>
        </View>
      </View>
      <Text style={[hng.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
      <Text style={[hng.cat, { color: colors.mutedForeground }]}>{cat}</Text>
    </TouchableOpacity>
  );
}
const hng = StyleSheet.create({
  wrapper:       { width: 94, alignItems: 'center' },
  hook:          { width: 2, height: 10, backgroundColor: 'rgba(201,168,76,0.33)' },
  bar:           { width: 64, height: 2, backgroundColor: '#3A2A10', marginBottom: 5 },
  photo:         { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  card:          { width: 88, height: 106, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 0.5, borderColor: 'transparent', overflow: 'hidden' },
  cardWarn:      { borderColor: '#3A1A1A' },
  badge:         { position: 'absolute', top: 5, right: 5, backgroundColor: 'rgba(10,10,10,0.6)', borderRadius: 5, paddingHorizontal: 4, paddingVertical: 1 },
  badgeText:     { fontSize: 11, fontFamily: 'Inter_400Regular' },
  name:          { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#BBBBBB', marginTop: 5, maxWidth: 80, textAlign: 'center' },
  cat:           { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#BBBBBB', marginTop: 1 },
});

function ShelfCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const { theme } = useTheme();
  const woods = getWoodTone(theme as any);

  return (
    <View style={[sc.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <View style={[sc.shelf, { backgroundColor: woods.shelf }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sc.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const sc = StyleSheet.create({
  card:  { backgroundColor: '#0F0C07', borderRadius: 14, borderWidth: 0.5, borderColor: '#2A1E0A', paddingHorizontal: 12, paddingTop: 10, paddingBottom: 12 },
  shelf: { height: 3, backgroundColor: '#2A1E0A', marginBottom: 10, borderRadius: 1.5 },
  scroll:{ gap: 8, alignItems: 'flex-start' },
});

function FoldedItem({ name, bg, wears, image, onPress }: { name: string; bg: string; wears: number; image?: string | null; onPress?: () => void }) {
  const colors = useColors();
  const lowWear = wears === 0;
  return (
    <TouchableOpacity style={fi.wrapper} onPress={onPress} activeOpacity={0.85}>
      <View style={[fi.fold, { backgroundColor: bg }]}>
        {image ? (
          <Image source={{ uri: image }} style={fi.photo} resizeMode="cover" />
        ) : (
          /* Fold lines — evenly spaced horizontal bands suggest stacked fabric */
          <View style={fi.linesArea}>
            <View style={[fi.line, { opacity: 0.35 }]} />
            <View style={[fi.line, { opacity: 0.22 }]} />
            <View style={[fi.line, { opacity: 0.13 }]} />
          </View>
        )}
        {/* Count badge */}
        <View style={[fi.badge, lowWear && { backgroundColor: '#2A1010' }]}>
          <Text style={[fi.badgeText, { color: colors.primary }, lowWear && { color: colors.destructive }]}>{wears}×</Text>
        </View>
      </View>
      <Text style={[fi.name, { color: colors.text }, lowWear && { color: colors.destructive }]} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  );
}
const fi = StyleSheet.create({
  wrapper:   { width: 94, alignItems: 'center' },
  photo:     { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
  fold:      { width: 94, height: 86, borderRadius: 10, overflow: 'hidden', justifyContent: 'center' },
  linesArea: { paddingHorizontal: 10, gap: 7 },
  line:      { height: 2, backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 1 },
  badge:     { position: 'absolute', bottom: 6, right: 7, backgroundColor: 'rgba(10,10,10,0.55)', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  badgeText: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  name:      { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#BBBBBB', marginTop: 6, maxWidth: 80, textAlign: 'center' },
});

/** Stands in for a rail with nothing on it — honest about the gap. */
function EmptyRail({ label }: { label: string }) {
  const colors = useColors();
  return (
    <View style={[er.card, { borderColor: colors.border, backgroundColor: colors.surfaceDim }]}>
      <Feather name="camera" size={16} color={colors.mutedForeground} />
      <Text style={[er.text, { color: colors.mutedForeground }]}>{label}</Text>
    </View>
  );
}
const er = StyleSheet.create({
  card: {
    borderRadius: 14,
    borderWidth: 0.5,
    borderStyle: 'dashed',
    paddingVertical: 26,
    alignItems: 'center',
    gap: 8,
  },
  text: { fontFamily: 'Inter_400Regular', fontSize: 12, letterSpacing: 0.3 },
});

function RackCard({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  return (
    <View style={[rak.card, { backgroundColor: colors.surfaceDim, borderColor: colors.border }]}>
      <View style={[rak.rackLine, { backgroundColor: colors.border }]} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={rak.scroll}>
        {children}
      </ScrollView>
    </View>
  );
}
const rak = StyleSheet.create({
  card:     { backgroundColor: '#0D0A06', borderRadius: 14, borderWidth: 0.5, borderColor: '#2A1E0A', padding: 14 },
  rackLine: { height: 2, backgroundColor: '#2A1E0A', marginBottom: 12 },
  scroll:   { gap: 8, alignItems: 'flex-start' },
});


function OutfitCard({
  name, wears, occasion, pieces,
}: { name: string; wears: string; occasion: string; pieces: string[] }) {
  const colors = useColors();
  return (
    <View style={[oc.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={oc.mosaic}>
        {pieces.map((bg, i) => (
          <View key={i} style={[oc.piece, { backgroundColor: bg }]}>
            <Feather name={i < 2 ? 'shopping-bag' : i === 2 ? 'minus' : 'arrow-right'} size={10} color="rgba(255,255,255,0.2)" />
          </View>
        ))}
      </View>
      <Text style={[oc.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
      <Text style={[oc.wears, { color: colors.primary }]}>{wears}</Text>
      <Text style={[oc.occasion, { color: colors.mutedForeground }]}>{occasion}</Text>
    </View>
  );
}
const oc = StyleSheet.create({
  card:     { width: 108, borderRadius: 12, borderWidth: 0.5, overflow: 'hidden' },
  mosaic:   { flexDirection: 'row', flexWrap: 'wrap', gap: 2, padding: 6, height: 86 },
  piece:    { width: '47%', flex: 1, minHeight: 36, borderRadius: 4, alignItems: 'center', justifyContent: 'center' },
  name:     { fontFamily: 'Inter_500Medium', fontSize: 12, paddingHorizontal: 8, paddingTop: 6 },
  wears:    { fontFamily: 'Inter_400Regular', fontSize: 11, paddingHorizontal: 8, paddingTop: 2 },
  occasion: { fontFamily: 'Inter_400Regular', fontSize: 11, paddingHorizontal: 8, paddingBottom: 8, paddingTop: 1 },
});

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function WardrobeScreen() {
  const colors = useColors();
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [activeFilter, setActiveFilter] = useState('all');
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLink, setImportLink] = useState('');
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const uploadGarments = useUploadGarments();
  const { data: wardrobe } = useWardrobe();
  const { data: outfits } = useOutfits();

  const inCategory = (...names: string[]) =>
    wardrobe.filter((i) => names.includes(i.category.toLowerCase()));

  const tops = inCategory('tops');
  const dresses = inCategory('dresses');
  const bottoms = inCategory('bottoms');
  const outerwear = inCategory('outerwear');
  const everythingElse = wardrobe.filter(
    (i) => !['tops', 'dresses', 'bottoms', 'outerwear'].includes(i.category.toLowerCase()),
  );

  const openItem = (item: ApiWardrobeItem, displayType: 'hanger' | 'folded') =>
    navigation.navigate('ClothingCategory', {
      title: item.name,
      item: toRailItem(item),
      count: item.timesWorn,
      displayType,
    });

  const topPad = Platform.OS === 'web' ? 44 : insets.top;

  /**
   * A captured garment is catalogued into the wardrobe: uploaded, read by the
   * vision pass server-side, and stored as a real item the stylist can pick
   * from later. Permission prompts and the web/native split live in pickImage().
   */
  const captureGarment = async (source: PickSource) => {
    ReactNativeHapticFeedback.trigger('impactLight');

    const garments = source === 'gallery' ? await pickImages('gallery') : await (async () => {
      const g = await pickImage('camera');
      return g ? [g] : [];
    })();

    if (!garments.length) return; // Cancelled, or permission denied.

    setUploadNote(null);
    try {
      const items = await uploadGarments.mutateAsync(garments);
      ReactNativeHapticFeedback.trigger('notificationSuccess');
      setUploadNote(`added ${items.length} ${items.length === 1 ? 'item' : 'items'} to your wardrobe`);
    } catch (err) {
      ReactNativeHapticFeedback.trigger('notificationError');
      setUploadNote(err instanceof Error ? err.message : 'upload failed');
    }
  };

  const handleCamera = () => captureGarment('camera');
  const handleGallery = () => captureGarment('gallery');

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
    <View style={[s.root, { paddingTop: topPad, backgroundColor: colors.background }]}>

      {/* ── Wardrobe Header Bar ── */}
      <View style={[s.headerBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}>
        <Text style={[s.headerTitle, { color: colors.text }]}>ZORA · The Wardrobe</Text>
        <View style={s.headerIcons}>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="search" size={11} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="sliders" size={11} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity style={[s.iconBtn, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => navigation.navigate('Identity')}>
            <Feather name="user" size={11} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
 
      {/* ── Wardrobe Health Strip ── */}
      <View style={[s.healthStrip, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <Feather name="activity" size={14} color={colors.primary} style={{ marginRight: 2 }} />
        <Text style={[s.healthLabel, { color: colors.primary }]}>wardrobe health</Text>
        <View style={[s.trackOuter, { backgroundColor: colors.muted }]}>
          <View style={[s.trackFill, { width: '78%', backgroundColor: colors.primary }]} />
        </View>
        <Text style={[s.healthPct, { color: colors.primary }]}>78%</Text>
      </View>

      {/* ── Filter Pill Bar ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[s.filterBar, { backgroundColor: colors.background, borderBottomColor: colors.border }]}
        contentContainerStyle={s.filterScroll}
      >
        {FILTER_PILLS.map((pill) => {
          const active = activeFilter === pill;
          return (
            <TouchableOpacity
              key={pill}
              onPress={() => handleFilterPress(pill)}
              style={[s.pill, active ? [s.pillActive, { backgroundColor: colors.primary }] : [s.pillInactive, { backgroundColor: colors.card, borderColor: colors.border }]]}
            >
              <Text style={[s.pillText, active ? { color: colors.primaryForeground } : { color: colors.mutedForeground }]}>
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
          <TouchableOpacity
            style={[s.addCardPrimary, { backgroundColor: colors.primary, opacity: uploadGarments.isPending ? 0.6 : 1 }]}
            activeOpacity={0.85}
            onPress={handleCamera}
            disabled={uploadGarments.isPending}
          >
            <Feather name="camera" size={16} color={colors.primaryForeground} />
            <Text style={[s.addCardPrimaryText, { color: colors.primaryForeground }]}>
              {uploadGarments.isPending ? 'reading…' : 'photograph it'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[s.addCardSecondary, { backgroundColor: colors.card, borderColor: colors.border }]} 
            activeOpacity={0.85}
            onPress={() => {
              ReactNativeHapticFeedback.trigger('impactLight');
              setShowImportModal(true);
            }}
          >
            <Feather name="link" size={14} color={colors.primary} />
            <Text style={[s.addCardSecondaryText, { color: colors.mutedForeground }]}>import link</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.addCardSecondary, { backgroundColor: colors.card, borderColor: colors.border, opacity: uploadGarments.isPending ? 0.6 : 1 }]}
            activeOpacity={0.85}
            onPress={handleGallery}
            disabled={uploadGarments.isPending}
          >
            <Feather name="image" size={14} color={colors.primary} />
            <Text style={[s.addCardSecondaryText, { color: colors.mutedForeground }]}>from gallery</Text>
          </TouchableOpacity>
        </View>

        {!!uploadNote && (
          <Text style={[s.uploadNote, { color: colors.primary }]}>{uploadNote}</Text>
        )}

        {/* Rails are driven by what you have actually uploaded. An empty
            section says so rather than showing invented clothes. */}
        <SectionHeader title="Tops" count={tops.length} />
        {tops.length ? (
          <RailCard>
            {tops.map((item) => (
              <HangerItem
                key={item.id}
                {...toRailItem(item)}
                onPress={() => openItem(item, 'hanger')}
              />
            ))}
          </RailCard>
        ) : (
          <EmptyRail label="no tops yet" />
        )}

        <SectionHeader title="Dresses & Ethnic" count={dresses.length} />
        {dresses.length ? (
          <RailCard>
            {dresses.map((item) => (
              <HangerItem
                key={item.id}
                {...toRailItem(item)}
                isDress
                onPress={() => openItem(item, 'hanger')}
              />
            ))}
          </RailCard>
        ) : (
          <EmptyRail label="no dresses yet" />
        )}

        <SectionHeader title="Bottoms" count={bottoms.length} />
        {bottoms.length ? (
          <ShelfCard>
            {bottoms.map((item) => (
              <FoldedItem
                key={item.id}
                {...toRailItem(item)}
                onPress={() => openItem(item, 'folded')}
              />
            ))}
          </ShelfCard>
        ) : (
          <EmptyRail label="no bottoms yet" />
        )}

        {!!outerwear.length && (
          <>
            <SectionHeader title="Outerwear" count={outerwear.length} />
            <RailCard>
              {outerwear.map((item) => (
                <HangerItem
                  key={item.id}
                  {...toRailItem(item)}
                  onPress={() => openItem(item, 'hanger')}
                />
              ))}
            </RailCard>
          </>
        )}

        {!!everythingElse.length && (
          <>
            <SectionHeader title="Shoes & Accessories" count={everythingElse.length} />
            <ShelfCard>
              {everythingElse.map((item) => (
                <FoldedItem
                  key={item.id}
                  {...toRailItem(item)}
                  onPress={() => openItem(item, 'folded')}
                />
              ))}
            </ShelfCard>
          </>
        )}

        <SectionHeader title="Saved Outfits" count={outfits.length} />
        {outfits.length ? (
          <View style={s.outfitCard}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.outfitScroll}>
              {outfits.map((o) => (
                <OutfitCard
                  key={o.id}
                  name={o.headline}
                  wears={o.occasion ?? 'saved'}
                  occasion={o.date}
                  pieces={o.itemDetails.slice(0, 4).map((i) => i.color)}
                />
              ))}
            </ScrollView>
          </View>
        ) : (
          <EmptyRail label="ZORA has not styled you yet" />
        )}

      </ScrollView>

      {/* ── Import Link Modal ── */}
      <Modal visible={showImportModal} transparent animationType="fade">
        <TouchableOpacity 
          style={s.modalBackdrop} 
          activeOpacity={1} 
          onPress={() => setShowImportModal(false)}
        />
        <View style={[s.importModal, { backgroundColor: colors.card }]}>
          <Text style={[s.importModalTitle, { color: colors.text }]}>Import from link</Text>
          <Text style={[s.importModalSub, { color: colors.mutedForeground }]}>Paste a link from Zara, H&M, Myntra, etc. to digitally try on this garment.</Text>
          
          <View style={[s.inputWrapper, { backgroundColor: colors.background, borderColor: colors.primary + '44' }]}>
            <Feather name="link" size={16} color={colors.primary} style={{ marginRight: 8 }} />
            <TextInput
              style={[s.linkInput, { color: colors.text }]}
              placeholder="https://"
              placeholderTextColor={colors.mutedForeground}
              value={importLink}
              onChangeText={setImportLink}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
 
          <TouchableOpacity 
            style={[s.importSubmitBtn, { backgroundColor: colors.primary }, !importLink && { opacity: 0.5 }]}
            onPress={handleImportSubmit}
            disabled={!importLink}
          >
            <Text style={[s.importSubmitText, { color: colors.primaryForeground }]}>Import & Try On</Text>
          </TouchableOpacity>
        </View>
      </Modal>

    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  uploadNote: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    letterSpacing: 0.3,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
  root: { flex: 1, backgroundColor: '#111111' },

  // Header bar
  headerBar:    { height: 36, backgroundColor: '#1A1208', borderBottomWidth: 2, borderBottomColor: '#2A1E0A', flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14 },
  headerTitle:  { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#C9A84C', letterSpacing: 1.5, flex: 1 },
  headerIcons:  { flexDirection: 'row', gap: 6 },
  iconBtn:      { width: 24, height: 24, borderRadius: 12, backgroundColor: '#1F1208', borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.2)', alignItems: 'center', justifyContent: 'center' },

  // Health strip
  healthStrip:  { borderBottomWidth: 1, paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  healthLabel:  { fontFamily: 'Inter_500Medium', fontSize: 14 },
  trackOuter:   { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  trackFill:    { height: '100%', borderRadius: 3 },
  healthPct:    { fontFamily: 'Inter_500Medium', fontSize: 14 },

  // Filter pills
  filterBar:    { height: 52, borderBottomWidth: 1 },
  filterScroll: { paddingHorizontal: 16, gap: 8, flexDirection: 'row', alignItems: 'center', height: 52 },
  pill:         { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7 },
  pillActive:   { },
  pillInactive: { borderWidth: 0.5 },
  pillText:     { fontFamily: 'Inter_500Medium', fontSize: 13 },
  pillTextActive:   { color: '#0A0A0A' },
  pillTextInactive: { },

  // Scroll
  scroll: { paddingHorizontal: 12, paddingBottom: 120, gap: 0 },

  // Accessories
  accessCard:         { backgroundColor: '#0D0A06', borderRadius: 14, borderWidth: 0.5, borderColor: '#222222', padding: 14 },
  accessGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  accessCell:         { width: '22%', flex: 1, aspectRatio: 1, backgroundColor: '#161616', borderRadius: 10, borderWidth: 0.5, borderColor: '#1E1608', alignItems: 'center', justifyContent: 'center', gap: 3 },
  accessCellFeatured: { backgroundColor: '#1A1208', borderColor: 'rgba(201,168,76,0.27)' },
  accessLabel:        { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#999999', textAlign: 'center' },
  accessLabelFeatured:{ color: '#C9A84C' },

  // Outfits
  outfitCard:   { backgroundColor: '#161616', borderRadius: 14, borderWidth: 0.5, borderColor: '#222222', padding: 10 },
  outfitScroll: { gap: 8 },

  // Item Detail
  detailCard:   { borderRadius: 16, borderWidth: 0.5, padding: 16, marginTop: 10 },
  dragHandle:   { width: 36, height: 3, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  detailHeader: { flexDirection: 'row', gap: 14, marginBottom: 16 },
  detailThumb:  { width: 56, height: 64, borderRadius: 10, borderWidth: 0.5, alignItems: 'center', justifyContent: 'center' },
  detailInfo:   { flex: 1, gap: 4 },
  detailName:   { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 15, color: '#F0ECE4' },
  tagsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tagGold:      { backgroundColor: '#1F1A0D', borderWidth: 0.5, borderColor: 'rgba(201,168,76,0.27)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tagGoldText:  { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#C9A84C' },
  tag:          { backgroundColor: '#1E1608', borderWidth: 0.5, borderColor: '#222222', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  tagText:      { fontFamily: 'Inter_400Regular', fontSize: 11, color: '#BBBBBB' },
  wearsLabel:   { fontFamily: 'Inter_400Regular', fontSize: 12, color: '#999999', marginTop: 2 },
  dotsRow:      { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  dot:          { width: 7, height: 7, borderRadius: 3.5 },
  actionRow:    { flexDirection: 'row', gap: 6 },
  btnTryOn:     { flex: 1, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnTryOnText: { fontFamily: 'Inter_500Medium', fontSize: 12, color: '#0A0A0A' },
  btnPair:      { flex: 1, borderWidth: 0.5, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnPairText:  { fontFamily: 'Inter_500Medium', fontSize: 12 },
  btnRemove:    { flex: 1, borderWidth: 0.5, borderRadius: 9, paddingVertical: 8, alignItems: 'center' },
  btnRemoveText:{ fontFamily: 'Inter_500Medium', fontSize: 12 },

  // Add strip
  addStrip:           { flexDirection: 'row', gap: 8, marginTop: 12 },
  addCardPrimary:     { flex: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  addCardPrimaryText: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  addCardSecondary:   { flex: 1, borderWidth: 0.5, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 6, alignItems: 'center', gap: 4 },
  addCardSecondaryText:{ fontFamily: 'Inter_400Regular', fontSize: 12 },
  
  // Modals
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)' },
  importModal: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: Platform.OS === 'web' ? 24 : 44,
  },
  importModalTitle: { fontFamily: 'PlayfairDisplay_700Bold', fontSize: 22, marginBottom: 6 },
  importModalSub: { fontFamily: 'Inter_400Regular', fontSize: 13, marginBottom: 20, lineHeight: 16 },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 48,
    marginBottom: 20,
  },
  linkInput: {
    flex: 1,
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
  },
  importSubmitBtn: {
    borderRadius: 12,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importSubmitText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 14,
    letterSpacing: 0.5,
  },
});
