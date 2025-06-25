import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import { before, describe, it } from "node:test";
import { parseInvoice } from "./invoice.ts";

describe("Invoice parsing", async () => {
  const fixtureDir = path.join(import.meta.dirname, "..", "fixtures");

  const fixtureFiles = (await fs.readdir(fixtureDir))
    .filter((file) => file.startsWith("invoice-") && file.endsWith(".html"))
    .map((file) => path.join(fixtureDir, file));

  for (const fixtureFile of fixtureFiles) {
    describe(`Parsing ${path.basename(fixtureFile)}`, () => {
      let expectedJSONFile = fixtureFile.replace(/\.html$/, ".json");
      let fixtureHTML: string;
      let expected: unknown;
      let shouldGenerateExpected = false;

      before(async () => {
        fixtureHTML = await fs.readFile(fixtureFile, "utf-8");

        try {
          expected = JSON.parse(await fs.readFile(expectedJSONFile, "utf-8"));
        } catch (err) {
          if (err.code === "ENOENT") {
            shouldGenerateExpected = true;
          } else {
            throw err;
          }
        }

        if (expected && !Object.keys(expected).includes("placedBy")) {
          expected["placedBy"] = undefined;
        }
      });

      it("should parse the invoice correctly", async () => {
        const order = parseInvoice(
          fixtureHTML,
          process.env["DEBUG"] === "1" ? console.error : () => {},
        );

        if (shouldGenerateExpected) {
          await fs.writeFile(
            expectedJSONFile,
            JSON.stringify(order, null, 2) + "\n",
          );
          assert.fail(
            `Generated ${expectedJSONFile} but it didn't exist before. Please check the output.`,
          );
          return;
        }

        assert.deepStrictEqual(order, expected);
      });
    });
  }
});
