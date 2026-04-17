# Frontend Test Commands

## Run All Tests

```bash
cd frontend
npx jest --watchAll=false
```

## Run with Coverage

```bash
npx jest --coverage --watchAll=false
```

## Run Specific File or Pattern

```bash
# Single screen
npx jest src/screens/tabs/WardrobeScreen.test.tsx

# All component tests
npx jest src/components/ --watchAll=false

# Watch mode (development)
npx jest --watch
```

## Type Checking

```bash
npx tsc --noEmit
```

Must pass with zero errors before merging.

---

## Test Setup Notes

Tests use Jest + React Native Testing Library. The setup file is `jest.setup.ts`.

Mock AsyncStorage:
```ts
// jest.setup.ts (already configured if using @react-native-async-storage/async-storage/jest/async-storage-mock)
import mockAsyncStorage from '@react-native-async-storage/async-storage/jest/async-storage-mock';
jest.mock('@react-native-async-storage/async-storage', () => mockAsyncStorage);
```

Mock `fetch` (backend calls):
```ts
global.fetch = jest.fn();
// Per test:
(fetch as jest.Mock).mockResolvedValueOnce({
  ok: true,
  json: async () => ({ items: [], total: 0 }),
});
```

Mock Reanimated:
```ts
// jest.setup.ts
jest.mock('react-native-reanimated', () =>
  require('react-native-reanimated/mock')
);
```

---

## What to Test

### Components
- [ ] Renders without crashing with default props
- [ ] Shows loading state when `isLoading=true`
- [ ] Shows error state when query fails
- [ ] Buttons call correct handler on press
- [ ] Correct text displayed for given data

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';

test('BrassButton calls onPress', () => {
  const handler = jest.fn();
  render(<BrassButton variant="solid" size="md" onPress={handler}>Click</BrassButton>);
  fireEvent.press(screen.getByText('Click'));
  expect(handler).toHaveBeenCalledTimes(1);
});
```

### Screens
- [ ] Screen renders without errors when provided mock navigation
- [ ] API calls triggered on mount
- [ ] Loading indicator visible while fetching
- [ ] Garment list renders correct item count

```tsx
import { render, waitFor } from '@testing-library/react-native';
import { QueryClientProvider, QueryClient } from '@tanstack/react-query';
import { WardrobeScreen } from '@/screens/tabs/WardrobeScreen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

test('WardrobeScreen renders garment list', async () => {
  (fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => ({ items: [{ id: '1', product_name: 'Test Shirt', category: 'upper_body' }], total: 1 }),
  });

  const { getByText } = render(
    <QueryClientProvider client={queryClient}>
      <WardrobeScreen />
    </QueryClientProvider>
  );

  await waitFor(() => {
    expect(getByText('Test Shirt')).toBeTruthy();
  });
});
```

### Auth Flow
- [ ] Login stores token in AsyncStorage on success
- [ ] Logout clears token
- [ ] Protected screens redirect to Door when no token

---

## Lint

```bash
npx eslint src/ --ext .ts,.tsx
```

Fix all errors before PR. Warnings are acceptable but should be addressed.
