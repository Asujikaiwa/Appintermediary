import { compareSemver } from "@yodkai/shared";
import { useEffect, useState } from "react";

import { appVersion } from "@/core/config/env";
import { supabase } from "@/core/supabase/client";

/**
 * Remote-configurable force-update gate (BLUEPRINT.md §15).
 * MUST ship in the very first release — old binaries without this check can
 * never be forced to update later.
 *
 * Reads `app_config.min_supported_version`. Fail-open by design: if the
 * check itself fails (offline, backend down) the app stays usable.
 */
export type MinVersionState =
  | { status: "checking" }
  | { status: "ok" }
  | { status: "update_required"; minVersion: string };

export async function checkMinVersion(): Promise<MinVersionState> {
  const { data, error } = await supabase
    .from("app_config")
    .select("value")
    .eq("key", "min_supported_version")
    .single();

  if (error || data == null) return { status: "ok" }; // fail-open

  const minVersion = String(data.value).replaceAll('"', "");
  return compareSemver(appVersion, minVersion) < 0
    ? { status: "update_required", minVersion }
    : { status: "ok" };
}

export function useMinVersionGate(): MinVersionState {
  const [state, setState] = useState<MinVersionState>({ status: "checking" });

  useEffect(() => {
    let cancelled = false;
    checkMinVersion().then((result) => {
      if (!cancelled) setState(result);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
