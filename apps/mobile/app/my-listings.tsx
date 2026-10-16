import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useState } from "react";
import { View } from "react-native";
import {
  ActivityIndicator,
  Button,
  Chip,
  Dialog,
  Portal,
  Text,
} from "react-native-paper";

import { countPending } from "@/core/offline/outbox";
import { EmptyState, ErrorView, OfflineBanner } from "@/core/ui/states";
import type { FeedListing } from "@/features/listings/api";
import { ListingCard } from "@/features/listings/components/ListingCard";
import { useMyListings, useSetListingStatus } from "@/features/listings/hooks";

const STATUS_LABEL: Record<string, string> = {
  active: "กำลังขาย",
  matched: "มีดีลอยู่",
  sold: "ขายแล้ว",
  draft: "ฉบับร่าง",
};

/**
 * Screen 19 — My listings: manage own listings (close sale / remove).
 * Also surfaces listings still waiting in the offline outbox.
 */
export default function MyListingsScreen() {
  const router = useRouter();
  const listings = useMyListings();
  const setStatus = useSetListingStatus();
  const [manage, setManage] = useState<FeedListing | null>(null);
  const pendingCount = countPending();

  if (listings.isPending) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }
  if (listings.isError) {
    return <ErrorView onRetry={() => void listings.refetch()} />;
  }

  const act = (status: "active" | "sold" | "removed") => {
    if (!manage) return;
    setStatus.mutate({ id: manage.id, status });
    setManage(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <OfflineBanner />
      {pendingCount > 0 ? (
        <Chip icon="cloud-upload-outline" style={{ margin: 12 }}>
          รอซิงก์ {pendingCount} ประกาศ — จะลงให้อัตโนมัติเมื่อออนไลน์
        </Chip>
      ) : null}
      {listings.data.length === 0 && pendingCount === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title="ยังไม่มีประกาศของคุณ"
          actionLabel="ลงขายชิ้นแรก"
          onAction={() => router.push("/(tabs)/sell")}
        />
      ) : (
        <FlashList
          data={listings.data}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View>
              <ListingCard listing={item} onPress={() => setManage(item)} />
              <Chip
                compact
                style={{ position: "absolute", top: 12, right: 24 }}
                textStyle={{ fontSize: 11 }}
              >
                {STATUS_LABEL[item.status] ?? item.status}
              </Chip>
            </View>
          )}
          contentContainerStyle={{ paddingVertical: 8 }}
          onRefresh={() => void listings.refetch()}
          refreshing={listings.isRefetching}
        />
      )}

      <Portal>
        <Dialog visible={manage != null} onDismiss={() => setManage(null)}>
          <Dialog.Title numberOfLines={1}>{manage?.title}</Dialog.Title>
          <Dialog.Content style={{ gap: 8 }}>
            <Button
              mode="outlined"
              onPress={() => manage && router.push(`/listing/${manage.id}`)}
            >
              ดูประกาศ
            </Button>
            {manage?.status === "active" ? (
              <Button mode="outlined" onPress={() => act("sold")}>
                ปิดการขาย (ขายแล้ว)
              </Button>
            ) : null}
            {manage?.status === "sold" ? (
              <Button mode="outlined" onPress={() => act("active")}>
                เปิดขายอีกครั้ง
              </Button>
            ) : null}
            <Button
              mode="outlined"
              textColor="#b3261e"
              onPress={() => act("removed")}
            >
              ลบประกาศ
            </Button>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setManage(null)}>ปิด</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      {setStatus.isError ? (
        <Text style={{ textAlign: "center", color: "#b3261e", margin: 8 }}>
          อัปเดตสถานะไม่สำเร็จ กรุณาลองใหม่
        </Text>
      ) : null}
    </View>
  );
}
