# ⏳ Mobile Loading States Guide

> **Goal:** Create smooth, informative loading experiences that reduce perceived wait time.

---

## 1. Loading State Categories

| Type | When to Use | Example |
|------|-------------|---------|
| **Skeleton** | Initial data fetch | Profile card loading |
| **Button Spinner** | Form submission | Login button |
| **Pull to Refresh** | List refresh | News feed |
| **Infinite Scroll** | Paginated data | Product list |
| **Full Screen** | App initialization | Splash screen |

---

## 2. Skeleton Loaders

### Basic Skeleton Component
```tsx
// components/ui/Skeleton/Skeleton.tsx
import { View, StyleSheet, Animated, ViewStyle } from 'react-native';
import { useEffect, useRef } from 'react';
import { colors } from '@/constants';

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * @description Animated skeleton placeholder
 * @example <Skeleton width={200} height={20} />
 */
export function Skeleton({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        styles.skeleton,
        { width, height, borderRadius, opacity },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  skeleton: {
    backgroundColor: colors.gray[200],
  },
});
```

### Content-Specific Skeletons
```tsx
// components/skeletons/ProfileCardSkeleton.tsx
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';
import { spacing } from '@/constants';

export function ProfileCardSkeleton() {
  return (
    <View style={styles.container}>
      {/* Avatar */}
      <Skeleton width={80} height={80} borderRadius={40} />
      
      <View style={styles.content}>
        {/* Name */}
        <Skeleton width="60%" height={20} />
        <View style={styles.spacer} />
        
        {/* Bio lines */}
        <Skeleton width="100%" height={14} />
        <View style={styles.spacerSmall} />
        <Skeleton width="80%" height={14} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: spacing.md,
  },
  content: {
    flex: 1,
    marginLeft: spacing.md,
    justifyContent: 'center',
  },
  spacer: {
    height: spacing.sm,
  },
  spacerSmall: {
    height: spacing.xs,
  },
});
```

### List Skeleton
```tsx
// components/skeletons/ListSkeleton.tsx
import { View, StyleSheet } from 'react-native';
import { Skeleton } from '@/components/ui/Skeleton';

interface ListSkeletonProps {
  count?: number;
  itemHeight?: number;
}

export function ListSkeleton({ count = 5, itemHeight = 80 }: ListSkeletonProps) {
  return (
    <View style={styles.container}>
      {Array.from({ length: count }).map((_, index) => (
        <View key={index} style={styles.item}>
          <Skeleton width={60} height={60} borderRadius={8} />
          <View style={styles.content}>
            <Skeleton width="70%" height={16} />
            <Skeleton width="40%" height={12} style={styles.subtitle} />
          </View>
        </View>
      ))}
    </View>
  );
}
```

---

## 3. Button Loading States

### Loading Button Component
```tsx
// Already in components/ui/Button.tsx
// Key patterns:

// 1. Replace text with spinner
{isLoading ? (
  <ActivityIndicator color={textColor} size="small" />
) : (
  <Text>{children}</Text>
)}

// 2. Disable during loading
disabled={disabled || isLoading}

// 3. Maintain button width
<View style={styles.contentWrapper}>
  {isLoading && <ActivityIndicator />}
  <Text style={[styles.text, isLoading && styles.hidden]}>
    {children}
  </Text>
</View>
```

### Form Submit Pattern
```tsx
function MyForm() {
  const { mutate, isPending } = useSubmitForm();

  return (
    <Button 
      onPress={() => mutate(formData)}
      isLoading={isPending}
    >
      {isPending ? 'Submitting...' : 'Submit'}
    </Button>
  );
}
```

---

## 4. Pull to Refresh

```tsx
// features/products/screens/ProductListScreen.tsx
import { FlatList, RefreshControl } from 'react-native';

function ProductListScreen() {
  const { data, isLoading, refetch, isRefetching } = useProducts();

  return (
    <FlatList
      data={data}
      renderItem={({ item }) => <ProductCard product={item} />}
      refreshControl={
        <RefreshControl
          refreshing={isRefetching}
          onRefresh={refetch}
          tintColor={colors.primary}
          colors={[colors.primary]} // Android
        />
      }
      ListEmptyComponent={
        isLoading ? <ListSkeleton /> : <EmptyState />
      }
    />
  );
}
```

---

## 5. Infinite Scroll / Pagination

```tsx
// hooks/useInfiniteProducts.ts
import { useInfiniteQuery } from '@tanstack/react-query';

export function useInfiniteProducts() {
  return useInfiniteQuery({
    queryKey: ['products', 'infinite'],
    queryFn: ({ pageParam = 1 }) => fetchProducts({ page: pageParam }),
    getNextPageParam: (lastPage) => 
      lastPage.hasMore ? lastPage.nextPage : undefined,
    initialPageParam: 1,
  });
}

// Component usage
function ProductList() {
  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteProducts();

  const products = data?.pages.flatMap(page => page.items) ?? [];

  return (
    <FlatList
      data={products}
      renderItem={({ item }) => <ProductCard product={item} />}
      onEndReached={() => {
        if (hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      }}
      onEndReachedThreshold={0.5}
      ListFooterComponent={
        isFetchingNextPage ? (
          <View style={styles.footer}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null
      }
    />
  );
}
```

---

## 6. Full Screen Loading

```tsx
// components/common/LoadingScreen.tsx
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';
import { colors } from '@/constants';

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = 'Loading...' }: LoadingScreenProps) {
  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  message: {
    marginTop: 16,
    color: colors.textSecondary,
    fontSize: 16,
  },
});
```

---

## 7. Optimistic Updates

```tsx
// Show immediate feedback, revert on error

function LikeButton({ postId, initialLiked }: { postId: string; initialLiked: boolean }) {
  const [isLiked, setIsLiked] = useState(initialLiked);
  const { mutate } = useLikePost();

  const handlePress = () => {
    // Optimistic update
    setIsLiked(!isLiked);
    
    mutate(
      { postId, action: isLiked ? 'unlike' : 'like' },
      {
        onError: () => {
          // Revert on error
          setIsLiked(isLiked);
          Alert.alert('Failed to update');
        },
      }
    );
  };

  return (
    <TouchableOpacity onPress={handlePress}>
      <HeartIcon filled={isLiked} color={isLiked ? 'red' : 'gray'} />
    </TouchableOpacity>
  );
}
```

---

## 8. Loading State Patterns

### Pattern 1: Conditional Rendering
```tsx
function Screen() {
  const { data, isLoading, error } = useData();

  if (isLoading) return <LoadingScreen />;
  if (error) return <ErrorScreen error={error} />;
  if (!data) return <EmptyState />;

  return <Content data={data} />;
}
```

### Pattern 2: Suspense-like Pattern
```tsx
function Screen() {
  return (
    <DataProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Content />
      </Suspense>
    </DataProvider>
  );
}
```

### Pattern 3: Inline Loading
```tsx
function Profile() {
  const { data, isLoading } = useProfile();

  return (
    <View>
      <Header />
      {isLoading ? (
        <ProfileCardSkeleton />
      ) : (
        <ProfileCard data={data} />
      )}
      <Footer />
    </View>
  );
}
```

---

## 9. Best Practices Summary

| ✅ Do | ❌ Don't |
|-------|----------|
| Use skeletons for content | Use spinners for everything |
| Show inline loading for forms | Block entire screen for form submit |
| Maintain layout during loading | Cause layout shifts |
| Add loading text for accessibility | Leave loading silent |
| Use optimistic updates | Wait for every API response |
| Handle empty states | Show blank screen after loading |

---

## 10. Accessibility Considerations

```tsx
// Announce loading state to screen readers
<View
  accessibilityRole="progressbar"
  accessibilityLabel="Loading content"
  accessibilityValue={{ now: 0, min: 0, max: 100 }}
>
  <Skeleton />
</View>

// Announce when loading completes
<View
  accessibilityLiveRegion="polite"
  accessibilityLabel={isLoading ? 'Loading' : 'Content loaded'}
>
  {content}
</View>
```

---

> 📚 **Next:** Learn setup details → [SETUP_GUIDE.md](./09_SETUP_GUIDE.md)

