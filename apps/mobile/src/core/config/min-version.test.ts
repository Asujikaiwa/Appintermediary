import { compareSemver } from "@yodkai/shared";

describe("compareSemver (min-version force-update gate)", () => {
  it.each([
    ["1.0.0", "1.0.0", 0],
    ["1.0.0", "1.0.1", -1],
    ["1.2.0", "1.1.9", 1],
    ["2.0.0", "10.0.0", -1], // numeric, not lexicographic
    ["1.0", "1.0.0", 0], // missing patch treated as 0
    ["garbage", "1.0.0", -1], // non-numeric -> 0.0.0
  ] as const)("compareSemver(%s, %s) === %d", (a, b, expected) => {
    expect(compareSemver(a, b)).toBe(expected);
  });
});
