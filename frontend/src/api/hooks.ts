import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from './client';
import { uploadGarmentPhotos } from '@/services/wardrobeUpload';
import type { PickedImage } from '@/utils/pickImage';
import type {
  ApiCalendar,
  ApiCategoryCount,
  ApiCommunityPost,
  ApiOutfit,
  ApiTrend,
  ApiUser,
  ApiWardrobeItem,
  Recommendation,
  StylistAnswers,
  StylistQuestionsResponse,
} from './types';
import {
  MOCK_CALENDAR,
  MOCK_COMMUNITY_POSTS,
  MOCK_OUTFIT_TODAY,
  MOCK_TRENDS,
  MOCK_USER,
  MOCK_WARDROBE_ITEMS,
  VIBES_STRIP,
} from '@/constants/mockData';

/**
 * Every hook falls back to the bundled fixtures when the API is unreachable,
 * so the app still renders a complete demo with the backend switched off.
 * `isLive` tells a screen whether it is showing server data.
 */

export const queryKeys = {
  user: ['user'] as const,
  wardrobe: (filter?: string) => ['wardrobe', filter ?? 'all'] as const,
  categories: ['wardrobe', 'categories'] as const,
  outfitToday: ['outfits', 'today'] as const,
  calendar: ['calendar'] as const,
  trends: ['trends'] as const,
  posts: ['community', 'posts'] as const,
  vibes: ['vibes'] as const,
  stylistQuestions: ['stylist', 'questions'] as const,
};

// Fixtures are already API-shaped apart from these two fields.
const FALLBACK_USER: ApiUser = { id: 'mock-user', ...MOCK_USER };

const FALLBACK_ITEMS: ApiWardrobeItem[] = MOCK_WARDROBE_ITEMS.map((item) => ({ ...item }));

const FALLBACK_OUTFIT: ApiOutfit = {
  id: 'mock-outfit',
  headline: MOCK_OUTFIT_TODAY.headline,
  subhead: MOCK_OUTFIT_TODAY.subhead,
  occasion: MOCK_OUTFIT_TODAY.occasion,
  reasoning: MOCK_OUTFIT_TODAY.reasoning,
  date: new Date().toISOString().slice(0, 10),
  items: MOCK_OUTFIT_TODAY.items,
  itemDetails: FALLBACK_ITEMS.filter((i) => MOCK_OUTFIT_TODAY.items.includes(i.name)),
};

const FALLBACK_CALENDAR: ApiCalendar = {
  days: Object.entries(MOCK_CALENDAR.planned).map(([date, value], i) => ({
    id: `mock-${i}`,
    date,
    label: value.label,
    colors: value.colors,
    outfitId: null,
  })),
  planned: MOCK_CALENDAR.planned,
};

const FALLBACK_TRENDS: ApiTrend[] = MOCK_TRENDS.map((t) => ({ ...t }));
const FALLBACK_POSTS: ApiCommunityPost[] = MOCK_COMMUNITY_POSTS.map((p) => ({ ...p }));

const FALLBACK_CATEGORIES: ApiCategoryCount[] = Object.entries(
  FALLBACK_ITEMS.reduce<Record<string, number>>((acc, item) => {
    acc[item.category] = (acc[item.category] ?? 0) + 1;
    return acc;
  }, {}),
).map(([category, count]) => ({ category, count }));

/** Shared query behaviour: one quick retry, then fall back to fixtures. */
const baseOptions = {
  retry: 1,
  staleTime: 30_000,
  refetchOnWindowFocus: false,
} as const;

function withFallback<T>(result: { data: T | undefined; isError: boolean }, fallback: T) {
  const isLive = result.data !== undefined && !result.isError;
  return { data: isLive ? (result.data as T) : fallback, isLive };
}

export function useUser() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.user,
    queryFn: () => api.get<ApiUser>('/api/user/me'),
  });
  return { ...query, ...withFallback(query, FALLBACK_USER) };
}

// Saves the Interview screen's answers onto the signed-in user's profile.
export function useUpdateProfile() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (patch: { moodKeywords?: string[]; palette?: string[]; favoritesBrand?: string }) =>
      api.patch<ApiUser>('/api/user/me', patch),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

export function useWardrobe(filters?: { category?: string; occasion?: string }) {
  const search = new URLSearchParams();
  if (filters?.category) search.set('category', filters.category);
  if (filters?.occasion) search.set('occasion', filters.occasion);
  const suffix = search.toString() ? `?${search}` : '';

  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.wardrobe(suffix),
    queryFn: () => api.get<ApiWardrobeItem[]>(`/api/wardrobe${suffix}`),
  });

  const fallback = FALLBACK_ITEMS.filter(
    (item) =>
      (!filters?.category || item.category === filters.category) &&
      (!filters?.occasion || item.occasions.includes(filters.occasion)),
  );

  return { ...query, ...withFallback(query, fallback) };
}

export function useWardrobeCategories() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.categories,
    queryFn: () => api.get<ApiCategoryCount[]>('/api/wardrobe/categories'),
  });
  return { ...query, ...withFallback(query, FALLBACK_CATEGORIES) };
}

export function useOutfitToday() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.outfitToday,
    queryFn: () => api.get<ApiOutfit>('/api/outfits/today'),
  });
  return { ...query, ...withFallback(query, FALLBACK_OUTFIT) };
}

/** Saved outfits, newest first — the Wardrobe's "saved outfits" rail. */
export function useOutfits() {
  const query = useQuery({
    ...baseOptions,
    queryKey: ['outfits', 'all'] as const,
    queryFn: () => api.get<ApiOutfit[]>('/api/outfits'),
  });
  return { ...query, ...withFallback(query, [] as ApiOutfit[]) };
}

export function useCalendar() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.calendar,
    queryFn: () => api.get<ApiCalendar>('/api/calendar'),
  });
  return { ...query, ...withFallback(query, FALLBACK_CALENDAR) };
}

export function useTrends() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.trends,
    queryFn: () => api.get<ApiTrend[]>('/api/trends'),
  });
  return { ...query, ...withFallback(query, FALLBACK_TRENDS) };
}

export function useCommunityPosts() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.posts,
    queryFn: () => api.get<ApiCommunityPost[]>('/api/community/posts'),
  });
  return { ...query, ...withFallback(query, FALLBACK_POSTS) };
}

export function useVibes() {
  const query = useQuery({
    ...baseOptions,
    queryKey: queryKeys.vibes,
    queryFn: () => api.get<string[]>('/api/vibes'),
  });
  return { ...query, ...withFallback(query, [...VIBES_STRIP]) };
}

/* ── Mutations ─────────────────────────────────────────────────────────── */

type NewItem = Omit<ApiWardrobeItem, 'id' | 'timesWorn' | 'lastWorn' | 'dustOff'> &
  Partial<Pick<ApiWardrobeItem, 'timesWorn' | 'lastWorn' | 'dustOff'>>;

export function useAddWardrobeItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (item: NewItem) => api.post<ApiWardrobeItem>('/api/wardrobe', item),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useUpdateWardrobeItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...patch }: Partial<ApiWardrobeItem> & { id: string }) =>
      api.patch<ApiWardrobeItem>(`/api/wardrobe/${id}`, patch),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useDeleteWardrobeItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/wardrobe/${id}`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

export function useWearItem() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<ApiWardrobeItem>(`/api/wardrobe/${id}/wear`),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['wardrobe'] });
      client.invalidateQueries({ queryKey: queryKeys.outfitToday });
    },
  });
}

export function useSavePlannedDay() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (day: { date: string; label: string; colors: string[]; outfitId?: string | null }) =>
      api.put<ApiPlannedDayResponse>('/api/calendar', day),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.calendar });
    },
  });
}

type ApiPlannedDayResponse = ApiCalendar['days'][number];


// ── Stylist ─────────────────────────────────────────────────────────────────

/**
 * The interview questions, served by the API so the wording and the scoring
 * stay in step. No mock fallback: an unreachable API means the stylist cannot
 * run anyway, and a half-working questionnaire would be worse than an error.
 */
export function useStylistQuestions() {
  return useQuery({
    queryKey: queryKeys.stylistQuestions,
    queryFn: () => api.get<StylistQuestionsResponse>('/api/recommend/questions'),
    staleTime: 1000 * 60 * 30,
  });
}

/**
 * Runs the interview answers through the stylist.
 *
 * The result is persisted server-side as today's outfit, so the Mirror hero
 * and the calendar both pick it up — hence invalidating those queries here.
 */
export function useRecommendOutfit() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (answers: StylistAnswers) => api.post<Recommendation>('/api/recommend', answers),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: queryKeys.outfitToday });
      client.invalidateQueries({ queryKey: queryKeys.calendar });
    },
  });
}

/** Uploads garment photos; each becomes a catalogued wardrobe item. */
export function useUploadGarments() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (images: PickedImage[]) => uploadGarmentPhotos(images),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ['wardrobe'] });
    },
  });
}

/**
 * Records a yes/no on a suggestion.
 *
 * Invalidates nothing on purpose: the verdict changes the *next*
 * recommendation, not the one on screen, and refetching would swap the card
 * out from under the person who just answered.
 */
export function useOutfitFeedback() {
  return useMutation({
    mutationFn: ({ outfitId, liked }: { outfitId: string; liked: boolean }) =>
      api.post<{ id: string; liked: boolean }>(`/api/recommend/${outfitId}/feedback`, { liked }),
  });
}
