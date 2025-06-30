import { describe, it } from "node:test";
import { expect } from "playwright/test";
import { parseMonetaryAmount } from "./money.ts";

describe("#parseMonetaryAmount", () => {
  const TESTS = [
    {
      input: "-$10.54",
      expected: {
        currency: "$",
        value: "-$10.54",
        cents: -1054,
      },
    },
  ];

  TESTS.forEach(({ input, expected }) => {
    it(`should parse "${input}" correctly`, () => {
      const result = parseMonetaryAmount(input);
      expect(result).toEqual(expected);
    });
  });
});
