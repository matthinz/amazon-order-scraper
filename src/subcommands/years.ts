import type { SubcommandOptions } from "../types.ts";

export async function years(options: SubcommandOptions): Promise<void> {
  const years = await options.datastore.completeYears();
  years.sort();

  const listItems = await years.reduce<Promise<string[]>>(
    async (promise, year) =>
      promise.then(async (result) => {
        const orderCount = await options.datastore.countOrdersForYear(year);
        result.push(`* ${year} (${orderCount} orders)`);
        return result;
      }),
    Promise.resolve([])
  );

  console.log(`# Complete years\n\n${listItems.join("\n")}`);
}
