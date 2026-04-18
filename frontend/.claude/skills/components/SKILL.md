---
name: components
description: Trigger when building React Native components, UI elements, outfit builder, wardrobe grid, try-on result display, or any frontend UI for the ZORA app
---

# Components Skill

## Design System Conventions

### Colors — always use `useColors()`, never hardcode hex

```tsx
import { useColors } from '@/hooks/useColors';

function MyComponent() {
  const colors = useColors();
  // Available tokens from src/constants/colors.ts:
  // colors.background     — page background (#090909 dark, #F2EDE4 light)
  // colors.surface        — card/surface (#1a1a1a dark, #EDE8E0 light)
  // colors.text           — primary text
  // colors.textSecondary  — secondary/muted text
  // colors.brass          — brand accent (#C9A84C dark, #7A8B6F light)
  // colors.border         — hairline border
  // colors.destructive    — error/delete red

  return (
    <View style={{ backgroundColor: colors.background }}>
      <Text style={{ color: colors.text }}>Hello</Text>
    </View>
  );
}
```

### Text — always use `<ZoraText>` component

```tsx
import { ZoraText } from '@/components/ZoraText';

// Available variants:
<ZoraText variant="display">ZORA</ZoraText>       // Playfair Display 700, large
<ZoraText variant="heading">The Wardrobe</ZoraText> // Playfair Display 700
<ZoraText variant="subheading">Today</ZoraText>   // Inter 600
<ZoraText variant="body">Wear this tomorrow</ZoraText>  // Inter 400
<ZoraText variant="caption">2 hours ago</ZoraText>  // Inter 400, small
<ZoraText variant="brass">Size M</ZoraText>         // Inter 600, brass/gold colour
<ZoraText variant="label">CASUAL</ZoraText>         // Inter 700, uppercase, spaced
```

### Buttons — always use `<BrassButton>` component

```tsx
import { BrassButton } from '@/components/BrassButton';

// Variants: solid (filled brass), ghost (transparent, brass border), outline (dark border)
// Sizes: sm, md, lg

<BrassButton variant="solid" size="md" onPress={handleTryOn}>
  Try On
</BrassButton>

<BrassButton variant="ghost" size="sm" onPress={handlePair} loading={isPairing}>
  Pair With
</BrassButton>

<BrassButton variant="outline" size="md" onPress={handleRemove}>
  Remove
</BrassButton>
```

### Styles — always use `StyleSheet.create()`, never inline styles

```tsx
// WRONG
<View style={{ padding: 16, backgroundColor: '#fff' }}>

// RIGHT
const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: colors.surface,  // colors from useColors()
  },
});
<View style={styles.container}>
```

---

## TanStack Query for API Calls

All backend calls go through TanStack Query hooks — never raw `fetch` in component bodies.

### Query (GET)

```tsx
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/apiClient';

// src/lib/apiClient.ts — single source for base URL
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8000';

export const apiClient = {
  get: async <T>(path: string): Promise<T> => {
    const token = await AsyncStorage.getItem('@zora_auth_token');
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },
  post: async <T>(path: string, body: unknown): Promise<T> => {
    const token = await AsyncStorage.getItem('@zora_auth_token');
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  },
};

// In a component:
function WardrobeScreen() {
  const { data: garments, isLoading, error } = useQuery({
    queryKey: ['garments'],
    queryFn: () => apiClient.get('/garments'),
    staleTime: 5 * 60 * 1000,  // 5 minutes
  });
  // ...
}
```

### Mutation (POST/PUT/DELETE)

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';

function AddGarmentButton({ url }: { url: string }) {
  const queryClient = useQueryClient();

  const { mutate, isPending } = useMutation({
    mutationFn: () => apiClient.post('/garments/scrape', { url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['garments'] });
    },
  });

  return (
    <BrassButton variant="solid" size="md" onPress={() => mutate()} loading={isPending}>
      Add to Wardrobe
    </BrassButton>
  );
}
```

---

## Mock Data → Real API Migration Pattern

Current screens import from `src/constants/mockData.ts`. Replace each import with a query hook:

```tsx
// BEFORE (mock data)
import { mockWardrobeItems } from '@/constants/mockData';
const items = mockWardrobeItems;

// AFTER (real API)
const { data: items = [], isLoading } = useQuery({
  queryKey: ['garments'],
  queryFn: () => apiClient.get('/garments'),
});
```

Keep the mock data file — use it as fallback during development when backend is not running:

```tsx
const { data: items = mockWardrobeItems, isLoading } = useQuery({
  queryKey: ['garments'],
  queryFn: () => apiClient.get('/garments'),
  // placeholderData keeps mock visible while real data loads
  placeholderData: mockWardrobeItems,
});
```

---

## URL Paste Input Component

Pattern for pasting garment product URLs (used in WardrobeScreen and LensScreen):

```tsx
import React, { useState } from 'react';
import { View, TextInput, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { BrassButton } from '@/components/BrassButton';

interface UrlInputProps {
  onSubmit: (url: string) => void;
  isLoading?: boolean;
}

export function UrlInput({ onSubmit, isLoading }: UrlInputProps) {
  const colors = useColors();
  const [url, setUrl] = useState('');

  const isValid = url.startsWith('http://') || url.startsWith('https://');

  return (
    <View style={styles.row}>
      <TextInput
        style={[styles.input, { color: colors.text, borderColor: colors.border }]}
        placeholder="Paste product URL..."
        placeholderTextColor={colors.textSecondary}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <BrassButton
        variant="solid"
        size="sm"
        onPress={() => isValid && onSubmit(url.trim())}
        loading={isLoading}
      >
        Add
      </BrassButton>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 44,
    borderBottomWidth: 1,
    paddingHorizontal: 4,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
});
```

---

## Wardrobe Item Card Pattern

Mirrors the `RailCard` style in `WardrobeScreen.tsx`:

```tsx
interface GarmentCardProps {
  name: string;
  category: string;
  imageUri?: string;
  wearCount?: number;
  onPress: () => void;
}

export function GarmentCard({ name, category, imageUri, wearCount, onPress }: GarmentCardProps) {
  const colors = useColors();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}
      activeOpacity={0.75}
    >
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.image} resizeMode="cover" />
      ) : (
        <View style={[styles.imagePlaceholder, { backgroundColor: colors.background }]} />
      )}
      <ZoraText variant="caption" style={{ marginTop: 6 }}>{name}</ZoraText>
      <ZoraText variant="label">{category.replace('_', ' ').toUpperCase()}</ZoraText>
      {wearCount !== undefined && (
        <ZoraText variant="caption" style={{ color: colors.textSecondary }}>
          Worn {wearCount}×
        </ZoraText>
      )}
    </TouchableOpacity>
  );
}
```
