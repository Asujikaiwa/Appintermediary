import { z } from "zod";

/**
 * Per-category detail templates (public.category_fields). The seller must
 * fill these when listing; at the meetup they are the buyer's checklist for
 * the inspection gate ("ของต้องตรงตามประกาศ").
 */

export const CategoryFieldType = z.enum(["text", "number", "select"]);
export type CategoryFieldType = z.infer<typeof CategoryFieldType>;

export interface CategoryFieldSpec {
  key: string;
  type: CategoryFieldType;
  required: boolean;
  /** for type=select */
  options?: readonly string[] | null;
}

/**
 * Build a zod schema that validates a listing's `attributes` object against
 * the category's template. Optional fields may be omitted or empty; unknown
 * keys are rejected (strict) so stale drafts can't smuggle junk in.
 */
export function buildAttributesSchema(
  fields: readonly CategoryFieldSpec[],
): z.ZodType<Record<string, string | number>> {
  const shape: Record<string, z.ZodTypeAny> = {};

  for (const f of fields) {
    let schema: z.ZodTypeAny;
    switch (f.type) {
      case "number":
        schema = z.number().finite();
        break;
      case "select":
        schema =
          f.options && f.options.length > 0
            ? z.enum(f.options as [string, ...string[]])
            : z.string().trim().min(1);
        break;
      default:
        schema = z.string().trim().min(1).max(200);
    }
    shape[f.key] = f.required ? schema : schema.optional();
  }

  return z.strictObject(shape) as z.ZodType<Record<string, string | number>>;
}
