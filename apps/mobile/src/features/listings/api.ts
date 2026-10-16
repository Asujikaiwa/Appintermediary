import type {
  CategoryFieldType,
  CreateListingInput,
  ListingCondition,
  ListingStatus,
  Locale,
} from "@yodkai/shared";
import * as ImageManipulator from "expo-image-manipulator";

import { supabase } from "@/core/supabase/client";

const BUCKET = "listing-images";
const FEED_PAGE_SIZE = 20;
const MAX_IMAGE_DIM = 1280;

// ---------------------------------------------------------------------------
// Types (hand-written until `supabase gen types` lands with the CI step)
// ---------------------------------------------------------------------------

export type I18nName = Partial<Record<Locale, string>>;

export interface Category {
  id: string;
  slug: string;
  name_i18n: I18nName;
  sort_order: number;
  category_fields: CategoryFieldRow[];
}

export interface CategoryFieldRow {
  id: string;
  key: string;
  label_i18n: I18nName;
  type: CategoryFieldType;
  options: string[] | null;
  required: boolean;
  sort_order: number;
}

export interface ListingImageRow {
  storage_path: string;
  sort_order: number;
}

export interface FeedListing {
  id: string;
  title: string;
  asking_price: number;
  currency: string;
  condition: ListingCondition;
  province_code: string | null;
  status: ListingStatus;
  created_at: string;
  listing_images: ListingImageRow[];
}

export interface ListingDetail extends FeedListing {
  description: string;
  attributes: Record<string, string | number>;
  category: { id: string; slug: string; name_i18n: I18nName } | null;
  seller: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    trust_score: number;
    province_code: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select(
      "id, slug, name_i18n, sort_order, category_fields(id, key, label_i18n, type, options, required, sort_order)",
    )
    .order("sort_order")
    .order("sort_order", { referencedTable: "category_fields" });
  if (error) throw error;
  return data as unknown as Category[];
}

export async function fetchFeedPage(page: number): Promise<FeedListing[]> {
  const from = page * FEED_PAGE_SIZE;
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, asking_price, currency, condition, province_code, status, created_at, listing_images(storage_path, sort_order)",
    )
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .range(from, from + FEED_PAGE_SIZE - 1);
  if (error) throw error;
  return data as unknown as FeedListing[];
}

export const feedPageSize = FEED_PAGE_SIZE;

export async function fetchListing(id: string): Promise<ListingDetail> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      `id, title, description, attributes, asking_price, currency, condition,
       province_code, status, created_at,
       listing_images(storage_path, sort_order),
       category:categories(id, slug, name_i18n),
       seller:profiles!seller_id(id, display_name, avatar_url, trust_score, province_code)`,
    )
    .eq("id", id)
    .single();
  if (error) throw error;
  return data as unknown as ListingDetail;
}

export async function fetchMyListings(profileId: string): Promise<FeedListing[]> {
  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, title, asking_price, currency, condition, province_code, status, created_at, listing_images(storage_path, sort_order)",
    )
    .eq("seller_id", profileId)
    .neq("status", "removed")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as unknown as FeedListing[];
}

export function publicImageUrl(storagePath: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/** Hermes has atob built in (RN 0.74+); avoids a base64 lib dependency. */
function base64ToBytes(base64: string): Uint8Array {
  const bin = globalThis.atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function compressToBase64(uri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: MAX_IMAGE_DIM } }],
    {
      compress: 0.8,
      format: ImageManipulator.SaveFormat.JPEG,
      base64: true,
    },
  );
  if (!result.base64) throw new Error("IMAGE_COMPRESS_FAILED");
  return result.base64;
}

export interface CreateListingPayload {
  input: CreateListingInput;
  sellerId: string;
  imageUris: string[];
}

/**
 * Creates the listing on the server. Safe to replay (offline outbox):
 * - listing insert ignores duplicates on the client-generated id
 * - image uploads use upsert
 * - listing_images rows are only inserted when none exist yet
 */
export async function createListingOnServer(
  payload: CreateListingPayload,
): Promise<void> {
  const { input, sellerId, imageUris } = payload;

  const { error: insertError } = await supabase.from("listings").upsert(
    {
      id: input.id,
      seller_id: sellerId,
      category_id: input.categoryId,
      title: input.title,
      description: input.description,
      attributes: input.attributes,
      condition: input.condition,
      asking_price: input.askingPrice,
      currency: "THB",
      province_code: input.provinceCode,
      status: "active",
    },
    { onConflict: "id", ignoreDuplicates: true },
  );
  if (insertError) throw insertError;

  const { count, error: countError } = await supabase
    .from("listing_images")
    .select("id", { count: "exact", head: true })
    .eq("listing_id", input.id);
  if (countError) throw countError;
  if ((count ?? 0) > 0) return; // replay after partial success — images done

  const rows = [];
  for (let i = 0; i < imageUris.length; i++) {
    const base64 = await compressToBase64(imageUris[i]!);
    const path = `${sellerId}/${input.id}/${i}.jpg`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, base64ToBytes(base64).buffer as ArrayBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      });
    if (uploadError) throw uploadError;
    rows.push({ listing_id: input.id, storage_path: path, sort_order: i });
  }

  if (rows.length > 0) {
    const { error: imagesError } = await supabase
      .from("listing_images")
      .insert(rows);
    if (imagesError) throw imagesError;
  }
}

export async function setListingStatus(
  id: string,
  status: Extract<ListingStatus, "active" | "sold" | "removed">,
): Promise<void> {
  const { error } = await supabase
    .from("listings")
    .update({ status })
    .eq("id", id);
  if (error) throw error;
}
