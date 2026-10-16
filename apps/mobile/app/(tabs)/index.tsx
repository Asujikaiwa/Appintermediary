import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { View } from "react-native";
import { ActivityIndicator } from "react-native-paper";

import { EmptyState, ErrorView, OfflineBanner } from "@/core/ui/states";
import { ListingCard } from "@/features/listings/components/ListingCard";
import { useFeed } from "@/features/listings/hooks";

/**
 * Screen 8 — Home feed: latest active listings.
 * Recommendations ("แนะนำ/ใกล้ฉัน") arrive with the search/ranking step;
 * offline shows the persisted cache + banner.
 */
export default function HomeScreen() {
  const router = useRouter();
  const feed = useFeed();

  const listings = feed.data?.pages.flat() ?? [];

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {feed.isPending ? (
        <ActivityIndicator style={{ flex: 1 }} />
      ) : feed.isError && listings.length === 0 ? (
        <ErrorView onRetry={() => void feed.refetch()} />
      ) : listings.length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title="ยังไม่มีประกาศ"
          body="เป็นคนแรกที่ลงขายของมือสองบน Yodkai"
          actionLabel="ลงขายเลย"
          onAction={() => router.push("/(tabs)/sell")}
        />
      ) : (
        <FlashList
          data={listings}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ListingCard
              listing={item}
              onPress={() => router.push(`/listing/${item.id}`)}
            />
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          onRefresh={() => void feed.refetch()}
          refreshing={feed.isRefetching && !feed.isFetchingNextPage}
          onEndReached={() => {
            if (feed.hasNextPage && !feed.isFetchingNextPage) {
              void feed.fetchNextPage();
            }
          }}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            feed.isFetchingNextPage ? (
              <ActivityIndicator style={{ margin: 16 }} />
            ) : null
          }
        />
      )}
    </View>
  );
}
