import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { API_BASE_URL } from '@/config/api';
import { waitForApi } from '@/api/resilientFetch';
import { useColors } from '@/hooks/useColors';

/**
 * Holds the app on a splash until the API answers.
 *
 * The backend runs on a free instance that suspends after ~15 minutes idle
 * and takes ~25s to wake. Without this, opening the app cold means the first
 * screen fires requests into a sleeping server and renders errors — the worst
 * possible first impression, and precisely what happens when an app has been
 * sitting untouched before someone demonstrates it.
 *
 * Waiting here moves that unavoidable delay somewhere it reads as intent
 * rather than failure, and only shows the message if the wait is long enough
 * to notice.
 */
export function ApiBootGate({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [ready, setReady] = useState(false);
  // A warm API answers in well under a second; showing a splash for that long
  // would invent a delay rather than explain one.
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const reveal = setTimeout(() => {
      if (!cancelled) setShowSplash(true);
    }, 600);

    waitForApi(API_BASE_URL).finally(() => {
      if (cancelled) return;
      clearTimeout(reveal);
      // Proceeds even when the wait times out: every request retries on its
      // own, so a slow server should not lock anyone out of the app.
      setReady(true);
    });

    return () => {
      cancelled = true;
      clearTimeout(reveal);
    };
  }, []);

  if (ready) return <>{children}</>;
  if (!showSplash) return <View style={[styles.container, { backgroundColor: colors.background }]} />;

  return (
    <View style={[styles.container, styles.centered, { backgroundColor: colors.background }]}>
      <Text style={[styles.wordmark, { color: colors.brass }]}>ZORA</Text>
      <ActivityIndicator color={colors.brass} />
      <Text style={[styles.caption, { color: colors.mutedForeground }]}>
        waking the wardrobe…
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 20 },
  wordmark: {
    fontFamily: 'PlayfairDisplay_700Bold',
    fontSize: 24,
    letterSpacing: 10,
  },
  caption: {
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    letterSpacing: 1,
  },
});
