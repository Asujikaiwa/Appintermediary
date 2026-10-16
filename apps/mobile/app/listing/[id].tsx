import { provinceByCode } from "@yodkai/shared";
import { Image } from "expo-image";
import { Stack, useLocalSearchParams } from "expo-router";
import { Dimensions, ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Banner,
  Button,
  Chip,
  Divider,
  List,
  Text,
} from "react-native-paper";

import { ErrorView } from "@/core/ui/states";
import { publicImageUrl } from "@/features/listings/api";
import {
  CONDITION_LABEL,
  formatPrice,
} from "@/features/listings/components/ListingCard";
import { useCategories, useListing } from "@/features/listings/hooks";

const { width: SCREEN_W } = Dimensions.get("window");

/**
 * Screen 10 — Listing detail: gallery, template attributes (the buyer's
 * inspection checklist), seller + trust. The "เสนอราคา" button becomes the
 * make-offer bottom sheet in the Offers step.
 */
export default function ListingDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const listing = useListing(id);
  const categories = useCategories();

  if (listing.isPending) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }
  if (listing.isError) {
    return <ErrorView onRetry={() => void listing.refetch()} />;
  }

  const l = listing.data;
  const images = [...l.listing_images].sort((a, b) => a.sort_order - b.sort_order);
  const province = l.province_code ? provinceByCode(l.province_code) : undefined;
  const fields =
    categories.data?.find((c) => c.id === l.category?.id)?.category_fields ??
    [];
  const notAvailable = l.status !== "active";

  return (
    <>
      <Stack.Screen options={{ title: l.title }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 96 }}>
        {notAvailable ? (
          <Banner visible icon="information-outline">
            {l.status === "sold"
              ? "ประกาศนี้ขายแล้ว"
              : l.status === "matched"
                ? "ประกาศนี้กำลังมีดีลอยู่"
                : "ประกาศนี้ถูกปิดไปแล้ว"}
          </Banner>
        ) : null}

        <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
          {images.length === 0 ? (
            <View
              style={{
                width: SCREEN_W,
                height: SCREEN_W * 0.75,
                backgroundColor: "#00000014",
              }}
            />
          ) : (
            images.map((img) => (
              <Image
                key={img.storage_path}
                source={publicImageUrl(img.storage_path)}
                contentFit="cover"
                style={{ width: SCREEN_W, height: SCREEN_W * 0.75 }}
                accessibilityLabel={l.title}
              />
            ))
          )}
        </ScrollView>

        <View style={{ padding: 16, gap: 8 }}>
          <Text variant="headlineSmall">{formatPrice(l.asking_price)}</Text>
          <Text variant="titleMedium">{l.title}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Chip compact>{CONDITION_LABEL[l.condition]}</Chip>
            {l.category?.name_i18n.th ? (
              <Chip compact icon="tag-outline">
                {l.category.name_i18n.th}
              </Chip>
            ) : null}
            {province ? (
              <Chip compact icon="map-marker">
                {province.nameTh}
              </Chip>
            ) : null}
          </View>
          {l.description ? (
            <Text variant="bodyMedium" style={{ marginTop: 8 }}>
              {l.description}
            </Text>
          ) : null}
        </View>

        {Object.keys(l.attributes).length > 0 ? (
          <>
            <Divider />
            <List.Section title="รายละเอียดตามหมวด (ใช้ตรวจของตอนนัดรับ)">
              {Object.entries(l.attributes).map(([key, value]) => {
                const spec = fields.find((f) => f.key === key);
                return (
                  <List.Item
                    key={key}
                    title={spec?.label_i18n.th ?? key}
                    description={String(value)}
                  />
                );
              })}
            </List.Section>
          </>
        ) : null}

        <Divider />
        {l.seller ? (
          <List.Item
            title={l.seller.display_name || "ผู้ขาย"}
            description={`Trust ${l.seller.trust_score}`}
            left={() =>
              l.seller ? (
                <Avatar.Text
                  size={40}
                  label={(l.seller.display_name || "?").slice(0, 2)}
                  style={{ marginLeft: 16 }}
                />
              ) : null
            }
          />
        ) : null}

        <View style={{ padding: 16 }}>
          <Button
            mode="contained"
            disabled={notAvailable}
            onPress={() => {
              // make-offer bottom sheet lands with the Offers step (BLUEPRINT §8 step 4)
            }}
            testID="make-offer"
          >
            เสนอราคา (เร็ว ๆ นี้)
          </Button>
        </View>
      </ScrollView>
    </>
  );
}
