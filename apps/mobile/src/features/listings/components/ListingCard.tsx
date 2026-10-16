import { provinceByCode, type ListingCondition } from "@yodkai/shared";
import { Image } from "expo-image";
import { View } from "react-native";
import { Card, Chip, Text } from "react-native-paper";

import { publicImageUrl, type FeedListing } from "@/features/listings/api";

export const CONDITION_LABEL: Record<ListingCondition, string> = {
  like_new: "เหมือนใหม่",
  good: "สภาพดี",
  fair: "พอใช้",
  poor: "มีตำหนิ",
};

const priceFormat = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0,
});

export function formatPrice(amount: number): string {
  return priceFormat.format(amount);
}

export function ListingCard({
  listing,
  onPress,
}: {
  listing: FeedListing;
  onPress: () => void;
}) {
  const cover = [...listing.listing_images].sort(
    (a, b) => a.sort_order - b.sort_order,
  )[0];
  const province = listing.province_code
    ? provinceByCode(listing.province_code)
    : undefined;

  return (
    <Card mode="elevated" onPress={onPress} style={{ marginHorizontal: 16, marginVertical: 6 }}>
      <View style={{ flexDirection: "row" }}>
        <Image
          source={cover ? publicImageUrl(cover.storage_path) : null}
          placeholder={null}
          contentFit="cover"
          style={{
            width: 110,
            height: 110,
            borderTopLeftRadius: 12,
            borderBottomLeftRadius: 12,
            backgroundColor: "#00000014",
          }}
          accessibilityLabel={listing.title}
        />
        <View style={{ flex: 1, padding: 12, gap: 4 }}>
          <Text variant="titleSmall" numberOfLines={2}>
            {listing.title}
          </Text>
          <Text variant="titleMedium">{formatPrice(listing.asking_price)}</Text>
          <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
            <Chip compact textStyle={{ fontSize: 11 }}>
              {CONDITION_LABEL[listing.condition]}
            </Chip>
            {province ? (
              <Chip compact icon="map-marker" textStyle={{ fontSize: 11 }}>
                {province.nameTh}
              </Chip>
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}
