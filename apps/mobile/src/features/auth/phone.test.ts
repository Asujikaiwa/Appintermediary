import { normalizeThaiPhone } from "@yodkai/shared";

describe("normalizeThaiPhone (sign-in input → E.164)", () => {
  it.each([
    ["0812345678", "+66812345678"],
    ["081-234-5678", "+66812345678"],
    ["081 234 5678", "+66812345678"],
    ["+66812345678", "+66812345678"],
    ["66812345678", "+66812345678"],
    ["0612345678", "+66612345678"],
    ["0912345678", "+66912345678"],
  ] as const)("normalizes %s → %s", (input, expected) => {
    expect(normalizeThaiPhone(input)).toBe(expected);
  });

  it.each([
    [""],
    ["081234567"], // too short
    ["08123456789"], // too long
    ["0212345678"], // landline prefix, not mobile
    ["1234567890"], // does not start with 0
    ["+14155550100"], // not a Thai number
    ["abcdefghij"],
  ])("rejects %s", (input) => {
    expect(normalizeThaiPhone(input)).toBeNull();
  });
});
