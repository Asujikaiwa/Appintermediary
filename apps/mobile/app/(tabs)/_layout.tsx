import { Redirect, Tabs } from "expo-router";
import { ActivityIndicator } from "react-native-paper";

import { useMyProfile } from "@/features/profile/hooks";

/**
 * Bottom tab navigation (BLUEPRINT.md §5.1).
 * Gate: a signed-in user without a display name is sent to profile setup
 * first. Icons + i18n labels arrive with the theme/i18n step.
 */
export default function TabsLayout() {
  const profile = useMyProfile();

  if (profile.isPending) {
    return <ActivityIndicator style={{ flex: 1 }} />;
  }
  if (profile.data && profile.data.displayName.trim() === "") {
    return <Redirect href="/profile-setup" />;
  }

  return (
    <Tabs screenOptions={{ headerShown: true }}>
      <Tabs.Screen name="index" options={{ title: "หน้าแรก" }} />
      <Tabs.Screen name="sell" options={{ title: "ลงขาย" }} />
      <Tabs.Screen name="me" options={{ title: "ฉัน" }} />
    </Tabs>
  );
}
