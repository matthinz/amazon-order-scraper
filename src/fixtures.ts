import fs from "node:fs/promises";
import path from "node:path";

export async function saveFixtureHTML(html: string): Promise<string> {
  const fixturesDir = path.join(import.meta.dirname, "..", "fixtures");
  let fixtureFile: string;

  const anonymizedHTML = await anonymizeInvoiceHTML(html);
  const orderID = getOrderIDFromHTML(anonymizedHTML);

  fixtureFile = path.join(fixturesDir, `invoice-${orderID}.html`);

  await fs.mkdir(path.dirname(fixtureFile), { recursive: true });
  await fs.writeFile(fixtureFile, anonymizedHTML);

  const jsonFile = path.join(fixturesDir, `invoice-${orderID}.json`);
  await fs.writeFile(jsonFile, "{}\n");

  return fixtureFile;
}

async function anonymizeInvoiceHTML(html: string): Promise<string> {
  // We want to anonymize anything that _looks_ like an order ID,
  // but only one of those will _actually_ be the order ID.

  const orderIDMap = new Map<string, string>();
  html = html.replace(/(\d{3}-\d{7}-\d{7})/g, (_, orderID) => {
    if (orderIDMap.has(orderID)) {
      return orderIDMap.get(orderID)!;
    }

    const replacement = generateRandomOrderID();
    orderIDMap.set(orderID, replacement);
    return replacement;
  });

  return await replacePiiTokens(html);
}

async function replacePiiTokens(html: string): Promise<string> {
  let piiTokens: { [pattern: string]: string };

  try {
    const json = await fs.readFile("pii_tokens.json", "utf8");
    piiTokens = JSON.parse(json);
  } catch (err) {
    throw err;
  }

  Object.entries(piiTokens).forEach(([pattern, replacement]) => {
    const regex = new RegExp(pattern, "gi");
    html = html.replace(regex, String(replacement));
  });

  return html;
}

function generateRandomOrderID() {
  return [
    new Array(3)
      .fill(0)
      .map(() => Math.floor(Math.random() * 10))
      .join(""),
    new Array(7)
      .fill(0)
      .map(() => Math.floor(Math.random() * 10))
      .join(""),
    new Array(7)
      .fill(0)
      .map(() => Math.floor(Math.random() * 10))
      .join(""),
  ].join("-");
}

function getOrderIDFromHTML(html: string): string {
  const m = /orderID%3D(\d{3}-\d{7}-\d{7})/.exec(html);
  if (m) {
    return m[1];
  }

  const potentialOrderIDs: { [id: string]: number } =
    html.match(/\b\d{3}-\d{7}-\d{7}\b/g)?.reduce((acc, id) => {
      acc[id] = (acc[id] ?? 0) + 1;
      return acc;
    }, {}) ?? {};

  const sortedPotentialOrderIDs = Object.entries(potentialOrderIDs)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const orderID = sortedPotentialOrderIDs[0];
  if (!orderID) {
    throw new Error("No order ID found in the invoice HTML.");
  }

  return orderID;
}
