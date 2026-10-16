/**
 * @yodkai/shared — zod schemas + types shared between the mobile app
 * and Supabase Edge Functions (Deno). Keep this package dependency-free
 * except zod, and free of any platform-specific imports.
 */
import { z } from "zod";

export * from "./category-fields";
export * from "./provinces";

// ---------------------------------------------------------------------------
// Enums (must mirror CHECK constraints in supabase/migrations)
// ---------------------------------------------------------------------------

export const Locale = z.enum(["th", "en", "zh"]);
export type Locale = z.infer<typeof Locale>;

export const ListingCondition = z.enum(["like_new", "good", "fair", "poor"]);
export type ListingCondition = z.infer<typeof ListingCondition>;

export const ListingStatus = z.enum([
  "draft",
  "active",
  "matched",
  "sold",
  "removed",
]);
export type ListingStatus = z.infer<typeof ListingStatus>;

export const OfferStatus = z.enum([
  "pending",
  "accepted",
  "declined",
  "withdrawn",
  "expired",
]);
export type OfferStatus = z.infer<typeof OfferStatus>;

/**
 * Deal state machine (see BLUEPRINT.md §3):
 * accepted → meetup_planned → inspection_passed → (paid_held →) completed
 * inspection_failed → cancelled (no fee charged)
 */
export const DealStatus = z.enum([
  "accepted",
  "meetup_planned",
  "inspection_passed",
  "inspection_failed",
  "paid_held",
  "completed",
  "disputed",
  "cancelled",
]);
export type DealStatus = z.infer<typeof DealStatus>;

// ---------------------------------------------------------------------------
// Payloads
// ---------------------------------------------------------------------------

export const CreateOfferInput = z.object({
  listingId: z.uuid(),
  amount: z.number().positive().multipleOf(0.01).max(10_000_000),
  note: z.string().trim().max(500).optional(),
});
export type CreateOfferInput = z.infer<typeof CreateOfferInput>;

export const AcceptOfferInput = z.object({
  offerId: z.uuid(),
  idempotencyKey: z.uuid(),
});
export type AcceptOfferInput = z.infer<typeof AcceptOfferInput>;

export const TransitionDealInput = z.object({
  dealId: z.uuid(),
  toStatus: DealStatus,
  idempotencyKey: z.uuid(),
});
export type TransitionDealInput = z.infer<typeof TransitionDealInput>;

export const CreateListingInput = z.object({
  /** client-generated uuid — makes offline replay idempotent (same id → conflict → already created) */
  id: z.uuid(),
  categoryId: z.uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().max(4000),
  condition: ListingCondition,
  askingPrice: z.number().nonnegative().multipleOf(0.01).max(100_000_000),
  provinceCode: z.string().regex(/^TH-\d{2}$/),
  /** values for the category's template fields (category_fields) */
  attributes: z.record(z.string(), z.union([z.string(), z.number()])),
});
export type CreateListingInput = z.infer<typeof CreateListingInput>;

export const UpdateProfileInput = z.object({
  displayName: z.string().trim().min(2).max(50),
  provinceCode: z.string().regex(/^TH-\d{2}$/),
  locale: Locale,
});
export type UpdateProfileInput = z.infer<typeof UpdateProfileInput>;

// ---------------------------------------------------------------------------
// Uniform API error contract (BLUEPRINT.md §4)
// ---------------------------------------------------------------------------

export const ApiError = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
    retryable: z.boolean(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

// ---------------------------------------------------------------------------
// Semver compare — used by the remote min-version force-update gate.
// Returns -1 | 0 | 1 for a < b | a == b | a > b. Non-numeric parts -> 0.
// ---------------------------------------------------------------------------

/**
 * Normalize a Thai mobile number the user typed into E.164 (+66…).
 * Accepts "0812345678", "081-234-5678", "+66812345678", "66812345678".
 * Returns null when the input is not a valid Thai mobile number
 * (mobile prefixes are 06/08/09; 10 digits in local format).
 */
export function normalizeThaiPhone(input: string): string | null {
  const digits = input.replace(/\D/g, "");

  let local: string;
  if (digits.length === 10 && digits.startsWith("0")) {
    local = digits;
  } else if (digits.length === 11 && digits.startsWith("66")) {
    local = "0" + digits.slice(2);
  } else {
    return null;
  }

  if (!/^0[689]\d{8}$/.test(local)) return null;
  return "+66" + local.slice(1);
}

export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
