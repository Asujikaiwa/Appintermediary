import { Directory, File, Paths } from "expo-file-system";

import { enqueue } from "@/core/offline/outbox";
import { registerOpHandler } from "@/core/offline/sync-engine";
import {
  createListingOnServer,
  type CreateListingPayload,
} from "@/features/listings/api";

/**
 * Offline path for "ลงประกาศ" (BLUEPRINT.md §8 step 3 test criterion).
 * Picked images live in the picker's cache dir which the OS may purge, so we
 * copy them into the app's document dir before enqueueing; the op handler
 * deletes them after a successful upload.
 */

const OP_CREATE_LISTING = "create_listing";

const pendingDir = () => new Directory(Paths.document, "pending-images");

export function enqueueCreateListing(payload: CreateListingPayload): void {
  const dir = pendingDir();
  dir.create({ intermediates: true, idempotent: true });

  const durableUris = payload.imageUris.map((uri, i) => {
    const dest = new File(dir, `${payload.input.id}-${i}.jpg`);
    if (dest.exists) dest.delete();
    new File(uri).copy(dest);
    return dest.uri;
  });

  enqueue(OP_CREATE_LISTING, { ...payload, imageUris: durableUris });
}

export function registerListingOpHandlers(): void {
  registerOpHandler(OP_CREATE_LISTING, async (op) => {
    const payload = op.payload as CreateListingPayload;
    await createListingOnServer(payload);
    for (const uri of payload.imageUris) {
      try {
        const f = new File(uri);
        if (f.exists) f.delete();
      } catch {
        // best effort — leftover temp files are harmless
      }
    }
  });
}
