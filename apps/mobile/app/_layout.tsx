import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import {
  ActivityIndicator,
  MD3DarkTheme,
  MD3LightTheme,
  PaperProvider,
  Text,
} from "react-native-paper";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import { appVersion } from "@/core/config/env";
import { useMinVersionGate } from "@/core/config/min-version";
import { setOnFlushed, useSyncEngine } from "@/core/offline/sync-engine";
import { queryClient, queryPersister } from "@/core/query/client";
import { SessionProvider, useSession } from "@/features/auth/session";
import { registerListingOpHandlers } from "@/features/listings/offline";

// outbox op handlers must exist before the first flush
registerListingOpHandlers();
// after a successful replay, refetch listing queries so synced data shows up
setOnFlushed(() => {
  void queryClient.invalidateQueries({ queryKey: ["listings"] });
});

/**
 * Blocking force-update screen. Rendered INSTEAD of the app when the backend
 * says this binary is too old (BLUEPRINT.md §15 — must exist from release 1).
 * Store links will be added together with the store listings.
 */
function ForceUpdateScreen({ minVersion }: { minVersion: string }) {
  return (
    <SafeAreaView
      style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24 }}
    >
      <Text variant="headlineSmall" style={{ textAlign: "center" }}>
        กรุณาอัปเดตแอปเป็นเวอร์ชันล่าสุด
      </Text>
      <Text variant="bodyMedium" style={{ textAlign: "center", marginTop: 8 }}>
        เวอร์ชันขั้นต่ำที่รองรับคือ {minVersion}
      </Text>
    </SafeAreaView>
  );
}

/** Shown while restoring the persisted session — avoids flashing sign-in. */
function SplashFallback() {
  return (
    <SafeAreaView style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <ActivityIndicator />
    </SafeAreaView>
  );
}

function RootNavigator() {
  const minVersion = useMinVersionGate();
  const { isLoading, session } = useSession();
  const isSignedIn = session != null;

  // replay offline writes on start / reconnect / foreground (signed-in only)
  useSyncEngine(isSignedIn);

  if (minVersion.status === "update_required") {
    return <ForceUpdateScreen minVersion={minVersion.minVersion} />;
  }
  if (isLoading) {
    return <SplashFallback />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={isSignedIn}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="profile-setup"
          options={{ headerShown: true, title: "โปรไฟล์" }}
        />
        <Stack.Screen
          name="listing/[id]"
          options={{ headerShown: true, title: "" }}
        />
        <Stack.Screen
          name="my-listings"
          options={{ headerShown: true, title: "ประกาศของฉัน" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const theme = colorScheme === "dark" ? MD3DarkTheme : MD3LightTheme;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{ persister: queryPersister, buster: appVersion }}
        >
          <SessionProvider>
            <RootNavigator />
            <StatusBar style="auto" />
          </SessionProvider>
        </PersistQueryClientProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
