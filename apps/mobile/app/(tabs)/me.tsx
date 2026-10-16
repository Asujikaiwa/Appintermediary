import { provinceByCode } from "@yodkai/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Avatar,
  Button,
  Chip,
  List,
  Text,
} from "react-native-paper";

import { signOut } from "@/features/auth/api";
import { useMyProfile } from "@/features/profile/hooks";

const LOCALE_LABEL = { th: "ไทย", en: "English", zh: "中文" } as const;

/**
 * Screen — Me tab (BLUEPRINT.md §5.1): own profile + settings entry points.
 * "ประกาศของฉัน" / "ดีลของฉัน" arrive with the Listings and Deals steps.
 */
export default function MeScreen() {
  const router = useRouter();
  const profile = useMyProfile();
  const [signingOut, setSigningOut] = useState(false);

  if (profile.isPending) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }
  if (profile.isError) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
        <Text variant="bodyMedium">โหลดโปรไฟล์ไม่สำเร็จ</Text>
        <Button mode="outlined" onPress={() => void profile.refetch()}>
          ลองใหม่
        </Button>
      </View>
    );
  }

  const p = profile.data;
  const province = p.provinceCode ? provinceByCode(p.provinceCode) : undefined;

  const doSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      // SIGNED_OUT event flips the route guard back to (auth)
    } catch {
      setSigningOut(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 24, gap: 16 }}>
      <View style={{ alignItems: "center", gap: 8 }}>
        <Avatar.Text size={72} label={p.displayName.slice(0, 2) || "?"} />
        <Text variant="titleLarge">{p.displayName}</Text>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {p.phoneVerified && (
            <Chip icon="check-decagram" compact>
              ยืนยันเบอร์แล้ว
            </Chip>
          )}
          <Chip icon="shield-account" compact>
            Trust {p.trustScore}
          </Chip>
        </View>
      </View>

      <List.Section>
        <List.Item
          title="จังหวัด"
          description={province?.nameTh ?? "ยังไม่ระบุ"}
          left={(props) => <List.Icon {...props} icon="map-marker" />}
        />
        <List.Item
          title="ภาษา"
          description={LOCALE_LABEL[p.locale]}
          left={(props) => <List.Icon {...props} icon="translate" />}
        />
        <List.Item
          title="ประกาศของฉัน"
          left={(props) => <List.Icon {...props} icon="storefront-outline" />}
          onPress={() => router.push("/my-listings")}
          testID="my-listings"
        />
        <List.Item
          title="แก้ไขโปรไฟล์"
          left={(props) => <List.Icon {...props} icon="account-edit" />}
          onPress={() => router.push("/profile-setup")}
          testID="edit-profile"
        />
      </List.Section>

      <Button
        mode="outlined"
        onPress={() => void doSignOut()}
        loading={signingOut}
        disabled={signingOut}
        testID="sign-out"
      >
        ออกจากระบบ
      </Button>
    </ScrollView>
  );
}
