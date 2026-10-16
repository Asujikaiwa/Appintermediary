import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { supabase } from "@/core/supabase/client";

export interface SessionState {
  /** true until the persisted session has been restored from SecureStore */
  isLoading: boolean;
  session: Session | null;
}

const SessionContext = createContext<SessionState>({
  isLoading: true,
  session: null,
});

/**
 * Single source of truth for the auth session. Route guards in app/_layout
 * read this; everything else should use useSession().
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({
    isLoading: true,
    session: null,
  });
  const queryClient = useQueryClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setState({ isLoading: false, session: data.session });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      setState({ isLoading: false, session });
      if (event === "SIGNED_OUT") {
        // another user may sign in next on this device — drop all cached data
        queryClient.clear();
      }
    });
    return () => sub.subscription.unsubscribe();
  }, [queryClient]);

  return (
    <SessionContext.Provider value={state}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
