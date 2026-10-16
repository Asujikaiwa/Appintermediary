import { Locale, UpdateProfileInput } from "@yodkai/shared";
import { useRouter } from "expo-router";
import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, View } from "react-native";
import {
  ActivityIndicator,
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
} from "react-native-paper";

import { ProvincePicker } from "@/features/profile/ProvincePicker";
import type { MyProfile } from "@/features/profile/api";
import { useMyProfile, useUpdateProfile } from "@/features/profile/hooks";

/**
 * Screen 7 — Profile setup (first run) and profile edit (from the Me tab).
 * The (tabs) layout redirects here until display_name is filled in.
 */
export default function ProfileSetupScreen() {
  const profile = useMyProfile();

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
  return <ProfileForm initial={profile.data} />;
}

function ProfileForm({ initial }: { initial: MyProfile }) {
  const router = useRouter();
  const update = useUpdateProfile();

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [provinceCode, setProvinceCode] = useState<string | null>(
    initial.provinceCode,
  );
  const [locale, setLocale] = useState<Locale>(initial.locale);
  const [error, setError] = useState<string | null>(null);

  const save = () => {
    const parsed = UpdateProfileInput.safeParse({
      displayName,
      provinceCode,
      locale,
    });
    if (!parsed.success) {
      setError(
        displayName.trim().length < 2
          ? "กรุณากรอกชื่อที่แสดงอย่างน้อย 2 ตัวอักษร"
          : "กรุณาเลือกจังหวัด",
      );
      return;
    }
    setError(null);
    update.mutate(parsed.data, {
      onSuccess: () => router.replace("/(tabs)"),
      onError: () => setError("บันทึกไม่สำเร็จ กรุณาลองใหม่อีกครั้ง"),
    });
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={{ padding: 24, gap: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="titleLarge">ตั้งค่าโปรไฟล์</Text>
        <TextInput
          mode="outlined"
          label="ชื่อที่แสดง"
          value={displayName}
          onChangeText={(v) => {
            setDisplayName(v);
            if (error) setError(null);
          }}
          maxLength={50}
          testID="display-name-input"
        />
        <ProvincePicker value={provinceCode} onChange={setProvinceCode} />
        <Text variant="labelLarge">ภาษา</Text>
        <SegmentedButtons
          value={locale}
          onValueChange={(v) => setLocale(v as Locale)}
          buttons={[
            { value: "th", label: "ไทย" },
            { value: "en", label: "English" },
            { value: "zh", label: "中文" },
          ]}
        />
        <HelperText type="error" visible={error != null}>
          {error ?? " "}
        </HelperText>
        <Button
          mode="contained"
          onPress={save}
          loading={update.isPending}
          disabled={update.isPending}
          testID="save-profile"
        >
          บันทึก
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
