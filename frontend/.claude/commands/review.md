# Frontend Code Review Checklist

Run through this checklist before marking any frontend PR ready for review.

---

## API URLs
- [ ] No hardcoded `http://localhost:8000` or any raw URL strings in component files
- [ ] All API base URLs use `process.env.API_BASE_URL` via the `apiClient` helper
- [ ] No hardcoded IP addresses — all backend calls through `apiClient.ts`

## Styling
- [ ] No inline styles — zero `style={{ ... }}` with literal values on any JSX element
- [ ] All colors reference `useColors()` tokens — no hardcoded hex values (#fff, #000, etc.)
- [ ] All StyleSheet objects created with `StyleSheet.create()` outside render function
- [ ] No magic numbers in spacing — use multiples of 4 or 8 (e.g. 8, 12, 16, 24, 32)
- [ ] Font family always one of: `Inter-Regular`, `Inter-Medium`, `Inter-SemiBold`, `Inter-Bold`, `PlayfairDisplay-Bold`, `CormorantGaramond-Regular`

## Text and Buttons
- [ ] All text rendered through `<ZoraText variant="...">` — no raw `<Text>` components
- [ ] All interactive buttons use `<BrassButton variant="..." size="...">` — no custom `TouchableOpacity` with text as buttons
- [ ] Loading states handled via `BrassButton loading={isPending}` — no custom spinners on buttons

## Data Fetching
- [ ] All GET requests use `useQuery` — no `useEffect` + `fetch` + `useState` pattern
- [ ] All POST/PUT/DELETE use `useMutation` with `onSuccess` invalidating relevant queries
- [ ] No raw `fetch()` calls in component bodies
- [ ] Query keys follow the convention: `['resource']`, `['resource', id]`, `['resource', filters]`

## Animation and Performance
- [ ] Three.js / WebView canvas cleaned up on unmount (cancel animation frame, dispose renderer)
- [ ] Reanimated shared values not created inside render — use `useSharedValue` at component top
- [ ] `FlatList` used for any list with more than 10 items — never `ScrollView` + `map()`
- [ ] Heavy components (AvatarViewer, camera) are lazy loaded — not in initial render

## Code Quality
- [ ] No `console.log` in production paths — use `__DEV__ && console.log(...)` for debug
- [ ] No `any` TypeScript type in new code — use proper types or `unknown`
- [ ] No commented-out code blocks in PR diff
- [ ] No unused imports

## Haptics
- [ ] Primary CTA buttons call `HapticFeedback.trigger('impactLight')` on press
- [ ] Destructive actions (delete) call `HapticFeedback.trigger('notificationWarning')`

## Platform Safety
- [ ] `Platform.OS === 'ios'` guards used for iOS-specific APIs
- [ ] `StatusBar.currentHeight` accounted for on Android screens with custom headers
- [ ] No hardcoded screen dimensions — use `useWindowDimensions()` or `Dimensions.get()`
