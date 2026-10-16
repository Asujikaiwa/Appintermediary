import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";
import { AppState } from "react-native";

import { listDue, markFailed, remove, type OutboxOp } from "@/core/offline/outbox";

/**
 * Replays the outbox when connectivity returns (BLUEPRINT.md §1).
 * Op handlers are registered by feature modules (avoids core → feature
 * imports). A handler must be idempotent — it may run again after a crash
 * that happened between server-ack and outbox delete.
 */

type OpHandler = (op: OutboxOp) => Promise<void>;

const handlers = new Map<string, OpHandler>();

export function registerOpHandler(opType: string, handler: OpHandler): void {
  handlers.set(opType, handler);
}

let flushing = false;
let onFlushed: (() => void) | null = null;

/** Called after every flush that removed at least one op (refresh queries). */
export function setOnFlushed(cb: () => void): void {
  onFlushed = cb;
}

export async function flushOutbox(): Promise<void> {
  if (flushing) return;
  flushing = true;
  let processed = 0;
  try {
    for (const op of listDue()) {
      const handler = handlers.get(op.opType);
      if (!handler) continue; // unknown op from a newer/older build — leave it
      try {
        await handler(op);
        remove(op.id);
        processed++;
      } catch {
        markFailed(op);
        // network is probably still bad — stop and wait for the next trigger
        break;
      }
    }
  } finally {
    flushing = false;
  }
  if (processed > 0) onFlushed?.();
}

/** Mount once in the signed-in shell: flush on start, reconnect, foreground. */
export function useSyncEngine(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    void flushOutbox();

    const unsubNet = NetInfo.addEventListener((state) => {
      if (state.isConnected) void flushOutbox();
    });
    const appStateSub = AppState.addEventListener("change", (s) => {
      if (s === "active") void flushOutbox();
    });
    return () => {
      unsubNet();
      appStateSub.remove();
    };
  }, [enabled]);
}
