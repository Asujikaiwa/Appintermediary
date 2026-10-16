import { buildAttributesSchema, type CategoryFieldSpec } from "@yodkai/shared";

const phoneFields: CategoryFieldSpec[] = [
  { key: "brand", type: "text", required: true },
  { key: "model", type: "text", required: true },
  {
    key: "storage",
    type: "select",
    required: true,
    options: ["64GB", "128GB", "256GB"],
  },
  { key: "battery_health", type: "number", required: false },
];

describe("buildAttributesSchema (category template → validation)", () => {
  const schema = buildAttributesSchema(phoneFields);

  it("accepts a complete valid attribute set", () => {
    const result = schema.safeParse({
      brand: "Apple",
      model: "iPhone 15",
      storage: "128GB",
      battery_health: 87,
    });
    expect(result.success).toBe(true);
  });

  it("allows omitting optional fields", () => {
    expect(
      schema.safeParse({ brand: "Apple", model: "iPhone 15", storage: "64GB" })
        .success,
    ).toBe(true);
  });

  it("rejects when a required field is missing", () => {
    expect(
      schema.safeParse({ brand: "Apple", storage: "64GB" }).success,
    ).toBe(false);
  });

  it("rejects empty strings for required text fields", () => {
    expect(
      schema.safeParse({ brand: " ", model: "iPhone", storage: "64GB" })
        .success,
    ).toBe(false);
  });

  it("rejects select values outside the options", () => {
    expect(
      schema.safeParse({ brand: "Apple", model: "iPhone", storage: "2TB" })
        .success,
    ).toBe(false);
  });

  it("rejects non-numeric values for number fields", () => {
    expect(
      schema.safeParse({
        brand: "Apple",
        model: "iPhone",
        storage: "64GB",
        battery_health: "eighty",
      }).success,
    ).toBe(false);
  });

  it("rejects unknown keys (stale draft protection)", () => {
    expect(
      schema.safeParse({
        brand: "Apple",
        model: "iPhone",
        storage: "64GB",
        hacked: "yes",
      }).success,
    ).toBe(false);
  });
});
