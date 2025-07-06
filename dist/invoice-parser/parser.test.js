import assert from "node:assert";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { parseInvoiceHTML } from "./main.js";
const fixtureDir = path.join(import.meta.dirname, "../..", "fixtures");
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
        const DEBUG = process.env.DEBUG === "1" || process.env.DEBUG === "true";
        const order = parseInvoiceHTML(fixtureHTML, {
            onAttributeCaptured(name, value) {
                if (DEBUG) {
                    console.error(`  > ${name} = ${value}`);
                }
            },
            onMatchAttempted(token, match, result) {
                if (DEBUG) {
                    // console.error(`  > Matches ${match}: ${result ? "YES" : "NO"}`);
                }
            },
            onStateChange(oldState, newState) { },
            onToken(token, context, state) {
                if (DEBUG) {
                    console.error(`${state.name}: ${token}`);
                }
            },
        });
        if (shouldGenerateExpected) {
            await fs.writeFile(expectedJSONFile, JSON.stringify(order, null, 2) + "\n");
            assert.fail(`Generated ${expectedJSONFile} but it didn't exist before. Please check the output.`);
            return;
        }
        const items = order.shipments.reduce((acc, shipment) => acc.concat(shipment.items), []);
        const itemSubtotal = items.reduce((sum, item) => sum + (item.priceCents || 0) * item.quantity, 0);
        assert.strictEqual(itemSubtotal, order.subtotalCents, `Subtotal should match the sum of item prices, but got ${itemSubtotal} vs ${order.subtotalCents}`);
        assert.deepStrictEqual(order, expected);
    });
}
//# sourceMappingURL=parser.test.js.map