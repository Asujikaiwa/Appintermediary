import NetInfo from "@react-native-community/netinfo";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { ListingStatus } from "@yodkai/shared";

import {
  createListingOnServer,
  feedPageSize,
  fetchCategories,
  fetchFeedPage,
  fetchListing,
  fetchMyListings,
  setListingStatus,
  type CreateListingPayload,
} from "@/features/listings/api";
import { enqueueCreateListing } from "@/features/listings/offline";
import { useMyProfile } from "@/features/profile/hooks";

export const feedKey = ["listings", "feed"] as const;
export const categoriesKey = ["categories"] as const;

export function useCategories() {
  return useQuery({
    queryKey: categoriesKey,
    queryFn: fetchCategories,
    staleTime: 60 * 60 * 1000, // reference data — refresh hourly
  });
}

export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedKey,
    queryFn: ({ pageParam }) => fetchFeedPage(pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length < feedPageSize ? undefined : pages.length,
  });
}

export function useListing(id: string) {
  return useQuery({
    queryKey: ["listings", "detail", id] as const,
    queryFn: () => fetchListing(id),
  });
}

export function useMyListings() {
  const profile = useMyProfile();
  const profileId = profile.data?.id;
  return useQuery({
    queryKey: ["listings", "mine", profileId] as const,
    queryFn: () => fetchMyListings(profileId!),
    enabled: profileId != null,
  });
}

export type CreateListingResult = "synced" | "queued";

/**
 * Online → create directly; offline (or the request fails like a network
 * error) → durable outbox, synced later by the sync engine.
 */
export function useCreateListing() {
  const queryClient = useQueryClient();
  return useMutation<CreateListingResult, Error, CreateListingPayload>({
    mutationFn: async (payload) => {
      const net = await NetInfo.fetch();
      if (!net.isConnected) {
        enqueueCreateListing(payload);
        return "queued";
      }
      try {
        await createListingOnServer(payload);
        return "synced";
      } catch (e) {
        // validation errors should surface; connectivity errors get queued
        if (e instanceof TypeError || /network|fetch/i.test(String(e))) {
          enqueueCreateListing(payload);
          return "queued";
        }
        throw e;
      }
    },
    onSuccess: (result) => {
      if (result === "synced") {
        void queryClient.invalidateQueries({ queryKey: ["listings"] });
      }
    },
  });
}

export function useSetListingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
    }: {
      id: string;
      status: Extract<ListingStatus, "active" | "sold" | "removed">;
    }) => setListingStatus(id, status),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["listings"] }),
  });
}
