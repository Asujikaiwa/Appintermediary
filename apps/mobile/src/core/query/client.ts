import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { QueryClient } from "@tanstack/react-query";
import { createMMKV } from "react-native-mmkv";

/**
 * Query client + MMKV persistence (BLUEPRINT.md §1 read path): the persisted
 * cache serves stale data while offline (old feed, own listings). It is a
 * throwaway cache — busting it on app update is fine (`buster`).
 */

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 24 * 60 * 60 * 1000, // keep for offline reads
      retry: 2,
    },
  },
});

const storage = createMMKV({ id: "query-cache" });

export const queryPersister = createSyncStoragePersister({
  storage: {
    getItem: (key) => storage.getString(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.remove(key),
  },
  throttleTime: 2_000,
});
