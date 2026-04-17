---
name: state-management
description: Trigger when working on state management, TanStack Query, Context API, AsyncStorage, auth token handling, outfit builder state, or managing selected garments
---

# State Management Skill

## Architecture Overview

ZORA uses **two state layers** — no Zustand, no Redux:

| Layer | Tool | What it stores |
|-------|------|---------------|
| **Server state** | TanStack Query | Garments, recommendations, try-on jobs, user profile |
| **Local/UI state** | React Context + AsyncStorage | Theme, auth token, outfit builder selections |

---

## TanStack Query — Server State

Query client is initialised in `App.tsx`. Configure defaults there:

```tsx
// frontend/App.tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 minutes — don't refetch too often
      gcTime: 10 * 60 * 1000,      // 10 minutes garbage collection
      retry: 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10000),
    },
    mutations: {
      retry: 0,  // don't auto-retry mutations
    },
  },
});
```

### Query Keys Convention

Use arrays as query keys for easy invalidation:

```tsx
// All garments for current user
['garments']

// Single garment
['garments', garmentId]

// Garments filtered by category
['garments', { category: 'upper_body' }]

// User measurements
['measurements']

// Try-on job status
['jobs', jobId]

// User profile
['user', 'me']
```

### Polling for Async Jobs

VTON jobs are long-running — poll until complete:

```tsx
import { useQuery } from '@tanstack/react-query';

function useTryOnJob(jobId: string | null) {
  return useQuery({
    queryKey: ['jobs', jobId],
    queryFn: () => apiClient.get(`/garments/jobs/${jobId}`),
    enabled: !!jobId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      // Stop polling once done
      if (status === 'complete' || status === 'failed') return false;
      return 3000;  // poll every 3 seconds while processing
    },
    staleTime: 0,  // always refetch polling queries
  });
}

// Usage
function LensScreen() {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: job } = useTryOnJob(activeJobId);

  // When job is complete, stop polling and show result
  useEffect(() => {
    if (job?.status === 'complete') {
      setActiveJobId(null);
    }
  }, [job?.status]);
}
```

### Optimistic Updates

```tsx
const queryClient = useQueryClient();

const { mutate: deleteGarment } = useMutation({
  mutationFn: (id: string) => apiClient.delete(`/garments/${id}`),
  onMutate: async (id) => {
    // Cancel outbound refetches
    await queryClient.cancelQueries({ queryKey: ['garments'] });
    // Snapshot old data for rollback
    const previous = queryClient.getQueryData(['garments']);
    // Optimistically remove from list
    queryClient.setQueryData(['garments'], (old: Garment[]) =>
      old.filter((g) => g.id !== id)
    );
    return { previous };
  },
  onError: (_err, _id, context) => {
    // Roll back on error
    queryClient.setQueryData(['garments'], context?.previous);
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['garments'] });
  },
});
```

---

## Auth State — Context + AsyncStorage

Auth token stored in AsyncStorage under key `@zora_auth_token`.

```tsx
// frontend/src/context/AuthContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTH_TOKEN_KEY = '@zora_auth_token';

interface AuthContextValue {
  token: string | null;
  isLoading: boolean;
  login: (token: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(AUTH_TOKEN_KEY).then((stored) => {
      setToken(stored);
      setIsLoading(false);
    });
  }, []);

  const login = async (newToken: string) => {
    await AsyncStorage.setItem(AUTH_TOKEN_KEY, newToken);
    setToken(newToken);
  };

  const logout = async () => {
    await AsyncStorage.removeItem(AUTH_TOKEN_KEY);
    setToken(null);
  };

  return (
    <AuthContext.Provider value={{ token, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

---

## Outfit Builder State — Local Component State

The outfit builder (selecting garments to combine) uses `useState` within the screen — no global state needed since it only lives in one screen:

```tsx
// Within WardrobeScreen or a dedicated OutfitBuilderScreen

interface OutfitSlot {
  upper?: Garment;
  lower?: Garment;
  dress?: Garment;
}

function OutfitBuilder() {
  const [outfit, setOutfit] = useState<OutfitSlot>({});

  const selectGarment = (garment: Garment) => {
    setOutfit((prev) => {
      if (garment.category === 'upper_body') return { ...prev, upper: garment };
      if (garment.category === 'lower_body') return { ...prev, lower: garment };
      if (garment.category === 'dresses') return { dress: garment, upper: undefined, lower: undefined };
      return prev;
    });
  };

  const clearOutfit = () => setOutfit({});

  // Trigger try-on when outfit is complete
  const isReadyForTryOn = !!outfit.dress || (!!outfit.upper && !!outfit.lower);
}
```

---

## Theme State — Context + AsyncStorage (already implemented)

Theme is managed by `src/context/ThemeContext.tsx` with `useTheme()` hook.
Colors are accessed via `src/hooks/useColors.ts` with `useColors()` hook.

Do not duplicate theme logic — use the existing pattern:

```tsx
import { useTheme } from '@/context/ThemeContext';
import { useColors } from '@/hooks/useColors';

function MyScreen() {
  const { theme, setTheme } = useTheme();  // 'light' | 'dark'
  const colors = useColors();              // theme-specific color tokens

  const toggleTheme = () => setTheme(theme === 'dark' ? 'light' : 'dark');
}
```

---

## When NOT to Add Global State

Do not reach for global state for:
- Form input values — local `useState`
- Modal open/close — local `useState`
- Loading/error states for a single mutation — TanStack mutation's `isPending`/`isError`
- Scroll position — local `useRef`
- Animation values — Reanimated `useSharedValue`

Global state is only appropriate for: auth token, theme, and cross-screen data that cannot be passed via navigation params or React Query.
