import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import Feather from 'react-native-vector-icons/Feather';
import ReactNativeHapticFeedback from 'react-native-haptic-feedback';

import { useColors } from '@/hooks/useColors';
import { useWeather } from '@/hooks/useWeather';
import { useOutfitFeedback, useRecommendOutfit, useStylistQuestions } from '@/api/hooks';
import type { ApiWardrobeItem, StylistAnswers, StylistQuestion } from '@/api/types';
import { SCREEN_WIDTH } from '@/constants/layout';

const width = SCREEN_WIDTH;

type Phase = 'questions' | 'thinking' | 'result';

/** Rotating copy so the wait reads as work being done, not a hung request. */
const THINKING_LINES = [
  'reading your wardrobe…',
  'weighing colour against occasion…',
  'checking what you wore recently…',
  'assembling the look…',
];

export default function StylistScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const weather = useWeather();

  const { data: questionsData, isLoading: questionsLoading, isError } = useStylistQuestions();
  const recommend = useRecommendOutfit();
  const feedback = useOutfitFeedback();

  const questions = useMemo<StylistQuestion[]>(
    () => questionsData?.questions ?? [],
    [questionsData],
  );

  const [phase, setPhase] = useState<Phase>('questions');
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<StylistAnswers>({});
  const [thinkingLine, setThinkingLine] = useState(0);
  const [verdict, setVerdict] = useState<boolean | null>(null);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const current = questions[step];
  const isLast = step === questions.length - 1;

  // Cycle the waiting copy; cleared as soon as the phase changes.
  useEffect(() => {
    if (phase !== 'thinking') return;
    const timer = setInterval(
      () => setThinkingLine((n) => (n + 1) % THINKING_LINES.length),
      1800,
    );
    return () => clearInterval(timer);
  }, [phase]);

  const animateTo = (next: () => void) => {
    Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() => {
      next();
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    });
  };

  const setAnswer = (id: string, value: string | string[]) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  const toggleMulti = (id: string, value: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    const chosen = (answers[id as keyof StylistAnswers] as string[] | undefined) ?? [];
    setAnswer(id, chosen.includes(value) ? chosen.filter((v) => v !== value) : [...chosen, value]);
  };

  const chooseSingle = (id: string, value: string) => {
    ReactNativeHapticFeedback.trigger('impactLight');
    setAnswer(id, value);
    // A single-choice answer is a complete thought — move on for them.
    if (!isLast) setTimeout(() => animateTo(() => setStep((s) => s + 1)), 180);
  };

  const submit = () => {
    ReactNativeHapticFeedback.trigger('impactMedium');
    setPhase('thinking');
    setVerdict(null);
    recommend.mutate(
      {
        ...answers,
        weather: weather ? { tempC: weather.tempC, summary: weather.summary } : undefined,
      },
      {
        onSuccess: () => setPhase('result'),
        onError: () => setPhase('result'),
      },
    );
  };

  const goNext = () => {
    if (isLast) submit();
    else animateTo(() => setStep((s) => s + 1));
  };

  const goBack = () => {
    if (step === 0) navigation.goBack();
    else animateTo(() => setStep((s) => s - 1));
  };

  const restart = () => {
    recommend.reset();
    setVerdict(null);
    setAnswers({});
    setStep(0);
    setPhase('questions');
  };

  /**
   * Records a yes/no. Optimistic on purpose — the answer is a preference, not
   * a transaction, so a failed write should not undo the tap or nag about it.
   */
  const answerVerdict = (outfitId: string, liked: boolean) => {
    ReactNativeHapticFeedback.trigger(liked ? 'notificationSuccess' : 'impactLight');
    setVerdict(liked);
    feedback.mutate({ outfitId, liked });
  };

  /** Hands one garment to the Lens try-on screen, inside the tab navigator. */
  const tryOn = (item: ApiWardrobeItem) => {
    if (!item.image) return;
    ReactNativeHapticFeedback.trigger('impactMedium');
    navigation.navigate('Main', {
      screen: 'lens',
      params: {
        garment: {
          uri: item.image,
          name: `${item.name.replace(/\s+/g, '-').toLowerCase()}.jpg`,
          type: 'image/jpeg',
        },
      },
    });
  };

  const answeredCount = questions.filter((q) => {
    const value = answers[q.id as keyof StylistAnswers];
    return Array.isArray(value) ? value.length > 0 : Boolean(value);
  }).length;

  // ── Loading / error / empty-wardrobe gates ───────────────────────────────

  if (questionsLoading || isError) {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topPad, paddingBottom: bottomPad },
        ]}
      >
        <Text style={[styles.thinkingText, { color: colors.mutedForeground }]}>
          {isError ? 'ZORA cannot reach the stylist right now.' : 'waking the stylist…'}
        </Text>
        {isError && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={{ marginTop: 20 }}>
            <Text style={[styles.ghostLink, { color: colors.brass }]}>go back</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // ── Result ────────────────────────────────────────────────────────────────

  if (phase === 'result') {
    const result = recommend.data;
    const failed = recommend.isError || !result;
    const wearable = result?.itemDetails.filter((i) => i.image) ?? [];

    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={{
          paddingTop: topPad + 20,
          paddingBottom: bottomPad + 40,
          paddingHorizontal: 24,
          gap: 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {failed ? (
          <>
            <Text style={[styles.resultHeadline, { color: colors.warmWhite }]}>
              no look today
            </Text>
            <Text style={[styles.bodyText, { color: colors.mutedForeground }]}>
              {recommend.error instanceof Error
                ? recommend.error.message
                : 'Something went wrong assembling your outfit.'}
            </Text>
            <TouchableOpacity
              style={[styles.primaryButton, { backgroundColor: colors.brass }]}
              onPress={restart}
              activeOpacity={0.85}
            >
              <Text style={[styles.primaryButtonText, { color: colors.charcoal }]}>try again</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.resultHeader}>
              <Text style={[styles.eyebrow, { color: colors.brass }]}>today's look</Text>
              {!result.aiGenerated && (
                <Text style={[styles.offlineTag, { color: colors.mutedForeground }]}>
                  offline pick
                </Text>
              )}
            </View>

            <Text style={[styles.resultHeadline, { color: colors.warmWhite }]}>
              {result.headline}
            </Text>
            {!!result.subhead && (
              <Text style={[styles.resultSubhead, { color: colors.mutedForeground }]}>
                {result.subhead}
              </Text>
            )}

            {/* The pieces */}
            <View style={styles.itemsGrid}>
              {result.itemDetails.map((item) => (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={item.image ? 0.8 : 1}
                  onPress={() => tryOn(item)}
                  style={[styles.itemCard, { borderColor: colors.border, backgroundColor: colors.surface }]}
                >
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.itemPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.itemPhoto, { backgroundColor: item.color }]} />
                  )}
                  <View style={styles.itemMeta}>
                    <Text style={[styles.itemName, { color: colors.warmWhite }]} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <Text style={[styles.itemCategory, { color: colors.mutedForeground }]}>
                      {item.category}
                    </Text>
                  </View>
                  {!!item.image && (
                    <View style={[styles.tryOnBadge, { backgroundColor: colors.brassSubtle }]}>
                      <Feather name="camera" size={11} color={colors.brass} />
                    </View>
                  )}
                </TouchableOpacity>
              ))}
            </View>

            {/* Why this works */}
            <View style={styles.reasoningBlock}>
              <Text style={[styles.eyebrow, { color: colors.brass }]}>why this works</Text>
              {result.reasoning.map((line, i) => (
                <View key={i} style={styles.reasonRow}>
                  <View style={[styles.reasonDot, { backgroundColor: colors.brass }]} />
                  <Text style={[styles.bodyText, { color: colors.warmGray }]}>{line}</Text>
                </View>
              ))}
            </View>

            {/* Yes/no on the suggestion. Steers the next one, so it is worth
                asking before the try-on call to action rather than after. */}
            <View style={styles.feedbackBlock}>
              <Text style={[styles.eyebrow, { color: colors.brass }]}>
                {verdict === null
                  ? 'would you wear this?'
                  : verdict
                    ? 'noted — more looks like this'
                    : 'noted — you will not see this again'}
              </Text>
              {verdict === null && (
                <View style={styles.feedbackRow}>
                  <TouchableOpacity
                    style={[styles.verdictBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => answerVerdict(result.id, true)}
                    activeOpacity={0.85}
                    disabled={feedback.isPending}
                  >
                    <Feather name="thumbs-up" size={14} color={colors.brass} />
                    <Text style={[styles.verdictText, { color: colors.warmWhite }]}>yes</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.verdictBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}
                    onPress={() => answerVerdict(result.id, false)}
                    activeOpacity={0.85}
                    disabled={feedback.isPending}
                  >
                    <Feather name="thumbs-down" size={14} color={colors.mutedForeground} />
                    <Text style={[styles.verdictText, { color: colors.warmWhite }]}>no</Text>
                  </TouchableOpacity>
                </View>
              )}
              {verdict === false && (
                <TouchableOpacity
                  style={[styles.verdictBtnWide, { borderColor: colors.brass, backgroundColor: colors.brassSubtle }]}
                  onPress={submit}
                  activeOpacity={0.85}
                >
                  <Feather name="refresh-cw" size={13} color={colors.brass} />
                  <Text style={[styles.verdictText, { color: colors.brass }]}>show me another</Text>
                </TouchableOpacity>
              )}
            </View>

            <TouchableOpacity
              style={[
                styles.primaryButton,
                { backgroundColor: wearable.length ? colors.brass : colors.surface },
              ]}
              onPress={() => wearable.length && tryOn(wearable[0])}
              activeOpacity={0.85}
              disabled={!wearable.length}
            >
              <Feather
                name="camera"
                size={14}
                color={wearable.length ? colors.charcoal : colors.mutedForeground}
              />
              <Text
                style={[
                  styles.primaryButtonText,
                  { color: wearable.length ? colors.charcoal : colors.mutedForeground },
                ]}
              >
                {wearable.length ? 'try it on' : 'upload photos to try on'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={restart} style={{ alignItems: 'center' }}>
              <Text style={[styles.ghostLink, { color: colors.mutedForeground }]}>
                ask again, differently
              </Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    );
  }

  // ── Thinking ──────────────────────────────────────────────────────────────

  if (phase === 'thinking') {
    return (
      <View
        style={[
          styles.container,
          styles.centered,
          { backgroundColor: colors.background, paddingTop: topPad, paddingBottom: bottomPad },
        ]}
      >
        <View style={[styles.pulseRing, { borderColor: colors.brass }]} />
        <Text style={[styles.thinkingText, { color: colors.warmWhite }]}>
          {THINKING_LINES[thinkingLine]}
        </Text>
      </View>
    );
  }

  // ── Questions ─────────────────────────────────────────────────────────────

  const value = current ? answers[current.id as keyof StylistAnswers] : undefined;
  const hasAnswer = Array.isArray(value) ? value.length > 0 : Boolean(value);
  const canAdvance = hasAnswer || current?.optional;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          paddingTop: topPad + 16,
          paddingBottom: bottomPad + 16,
          paddingHorizontal: 24,
        },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Feather name="arrow-left" size={18} color={colors.mutedForeground} />
        </TouchableOpacity>
        <Text style={[styles.eyebrow, { color: colors.brass }]}>what to wear today</Text>
        <Text style={[styles.stepLabel, { color: colors.mutedForeground }]}>
          {step + 1}/{questions.length}
        </Text>
      </View>

      <View style={styles.progressBar}>
        {questions.map((_, i) => (
          <View
            key={i}
            style={[
              styles.progressSegment,
              {
                backgroundColor: i <= step ? colors.brass : colors.border,
                flex: i === step ? 2 : 1,
              },
            ]}
          />
        ))}
      </View>

      <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 12 }}>
          <Text style={[styles.question, { color: colors.warmWhite }]}>{current?.prompt}</Text>
          {!!current?.helper && (
            <Text style={[styles.helper, { color: colors.mutedForeground }]}>{current.helper}</Text>
          )}

          {current?.type === 'text' ? (
            <TextInput
              style={[
                styles.textAnswer,
                { color: colors.warmWhite, borderBottomColor: colors.border },
              ]}
              placeholder="optional — say anything"
              placeholderTextColor={colors.mutedForeground}
              value={(answers.notes as string) ?? ''}
              onChangeText={(t) => setAnswer('notes', t)}
              multiline
            />
          ) : (
            <View style={styles.choices}>
              {current?.choices?.map((choice) => {
                const selected =
                  current.type === 'multi'
                    ? ((value as string[] | undefined) ?? []).includes(choice.value)
                    : value === choice.value;

                return (
                  <TouchableOpacity
                    key={choice.value}
                    activeOpacity={0.8}
                    onPress={() =>
                      current.type === 'multi'
                        ? toggleMulti(current.id, choice.value)
                        : chooseSingle(current.id, choice.value)
                    }
                    style={[
                      styles.choice,
                      {
                        backgroundColor: selected ? colors.brassSubtle : colors.surface,
                        borderColor: selected ? colors.brass : colors.border,
                      },
                    ]}
                  >
                    {!!choice.color && (
                      <View style={[styles.swatch, { backgroundColor: choice.color }]} />
                    )}
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.choiceLabel,
                          { color: selected ? colors.brass : colors.warmWhite },
                        ]}
                      >
                        {choice.label}
                      </Text>
                      {!!choice.hint && (
                        <Text style={[styles.choiceHint, { color: colors.mutedForeground }]}>
                          {choice.hint}
                        </Text>
                      )}
                    </View>
                    {selected && <Feather name="check" size={14} color={colors.brass} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </Animated.View>

      <TouchableOpacity
        style={[
          styles.primaryButton,
          { backgroundColor: canAdvance ? colors.brass : colors.surface },
        ]}
        onPress={goNext}
        activeOpacity={0.85}
        disabled={!canAdvance}
      >
        <Text
          style={[
            styles.primaryButtonText,
            { color: canAdvance ? colors.charcoal : colors.mutedForeground },
          ]}
        >
          {isLast ? `style me (${answeredCount} answers)` : 'continue'}
        </Text>
        <Feather
          name="arrow-right"
          size={14}
          color={canAdvance ? colors.charcoal : colors.mutedForeground}
        />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 24, paddingHorizontal: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  eyebrow: {
    fontFamily: 'Inter_500Medium',
    fontSize: 10,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  stepLabel: { fontFamily: 'Inter_400Regular', fontSize: 11, letterSpacing: 1 },

  progressBar: { flexDirection: 'row', gap: 4, marginTop: 16, marginBottom: 24 },
  progressSegment: { height: 2, borderRadius: 1 },

  question: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 26,
    lineHeight: 34,
    letterSpacing: -0.3,
  },
  helper: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
  },

  choices: { gap: 10, marginTop: 24 },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  swatch: { width: 22, height: 22, borderRadius: 11 },
  choiceLabel: { fontFamily: 'Inter_500Medium', fontSize: 14, letterSpacing: 0.3 },
  choiceHint: { fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 2 },

  textAnswer: {
    fontFamily: 'Inter_400Regular',
    fontSize: 15,
    lineHeight: 22,
    minHeight: 90,
    marginTop: 28,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    textAlignVertical: 'top',
  },

  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 15,
    borderRadius: 24,
    marginTop: 12,
  },
  primaryButtonText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
  ghostLink: { fontFamily: 'Inter_400Regular', fontSize: 12, letterSpacing: 0.5 },

  pulseRing: { width: 54, height: 54, borderRadius: 27, borderWidth: 1 },
  thinkingText: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 18,
    letterSpacing: 0.2,
    textAlign: 'center',
  },

  resultHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  offlineTag: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  resultHeadline: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 32,
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  resultSubhead: {
    fontFamily: 'Inter_400Regular',
    fontSize: 13,
    lineHeight: 20,
    marginTop: -12,
  },

  itemsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  itemCard: {
    width: (width - 58) / 2,
    borderRadius: 6,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemPhoto: { width: '100%', height: 130 },
  itemMeta: { padding: 10, gap: 2 },
  itemName: { fontFamily: 'Inter_500Medium', fontSize: 12 },
  itemCategory: {
    fontFamily: 'Inter_400Regular',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  tryOnBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },

  feedbackBlock: { gap: 12 },
  feedbackRow: { flexDirection: 'row', gap: 10 },
  verdictBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  verdictBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
  },
  verdictText: {
    fontFamily: 'Inter_500Medium',
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  reasoningBlock: { gap: 10 },
  reasonRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  reasonDot: { width: 4, height: 4, borderRadius: 2, marginTop: 7 },
  bodyText: { fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 20, flex: 1 },
});
