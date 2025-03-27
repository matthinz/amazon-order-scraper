import assert from "node:assert";
import { describe, it, mock } from "node:test";

import { run } from "./cli.ts";

describe("#run", () => {
  describe("with no subcommands", () => {
    it("runs orders by default", async () => {
      const orders = mock.fn();
      await run([], { orders });
      assert.equal(orders.mock.calls.length, 1);
    });
  });

  describe("with args for orders", () => {
    it("forwards args to orders subcommand", async () => {
      const orders = mock.fn();
      await run(["orders", "--charge=25.25"], { orders });

      assert.equal(orders.mock.calls.length, 1);
      assert.deepStrictEqual(orders.mock.calls[0].arguments[0].args, [
        "--charge=25.25",
      ]);
    });
  });
});
