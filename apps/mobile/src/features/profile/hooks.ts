import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UpdateProfileInput } from "@yodkai/shared";

import { useSession } from "@/features/auth/session";
import { fetchMyProfile, updateMyProfile } from "@/features/profile/api";

export const myProfileKey = ["profile", "me"] as const;

export function useMyProfile() {
  const { session } = useSession();
  return useQuery({
    queryKey: myProfileKey,
    queryFn: fetchMyProfile,
    enabled: session != null,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateMyProfile(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: myProfileKey }),
  });
}
