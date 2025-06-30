import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseInvoice } from "./invoice.js";
const fixtureDir = path.join(import.meta.dirname, "..", "fixtures");
const fixtureFiles = (await fs.readdir(fixtureDir))
    .filter((file) => file.startsWith("invoice-") && file.endsWith(".html"))
    .map((file) => path.join(fixtureDir, file));
for (const fixtureFile of fixtureFiles) {
    test(`Parsing ${path.basename(fixtureFile)}`, async () => {
        let expectedJSONFile = fixtureFile.replace(/\.html$/, ".json");
        let fixtureHTML;
        let expected;
        let shouldGenerateExpected = false;
        fixtureHTML = await fs.readFile(fixtureFile, "utf-8");
        try {
            const rawExpected = await fs.readFile(expectedJSONFile, "utf-8");
            shouldGenerateExpected = ["", "{}"].includes(rawExpected.trim());
            expected = JSON.parse(rawExpected);
        }
        catch (err) {
            if (err.code === "ENOENT") {
                shouldGenerateExpected = true;
            }
            else {
                throw err;
            }
        }
        const keysToEnsure = ["placedBy", "shippingCost", "shippingCostCents"];
        keysToEnsure.forEach((key) => {
            if (expected && !Object.keys(expected).includes(key)) {
                expected[key] = undefined;
            }
        });
        const order = parseInvoice(fixtureHTML, process.env["DEBUG"] === "1" ? console.error : () => { });
        if (shouldGenerateExpected) {
            await fs.writeFile(expectedJSONFile, JSON.stringify(order, null, 2) + "\n");
            assert.fail(`Generated ${expectedJSONFile} but it didn't exist before. Please check the output.`);
            return;
        }
        assert.deepStrictEqual(order, expected);
    });
}
//# sourceMappingURL=invoice.test.js.map