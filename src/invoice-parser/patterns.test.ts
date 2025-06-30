import assert from "node:assert";
import { test } from "node:test";
import { MONEY_PATTERN } from "./patterns.ts";

const tests: [string, string, boolean][] = [
  [MONEY_PATTERN, "$123.45", true],
  [MONEY_PATTERN, "123", true],
  [MONEY_PATTERN, "1,234", true],
  [MONEY_PATTERN, "1,234.56", true],
];

tests.forEach(([pattern, input, expected]) => {
  test(`Pattern "${pattern}" matches "${input}"`, () => {
    const regex = new RegExp(pattern);
    const result = regex.test(input);
    assert.strictEqual(result, expected);
  });
});
