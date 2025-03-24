import { getContentChunks } from "../parsing.ts";
import type { SubcommandOptions } from "../types.ts";

export async function tokens(options: SubcommandOptions) {
  const orderIDs =
    options.args.length > 0
      ? options.args
      : ((await options.cache.getInvoices())
          .map((i) => i.orderID)
          .filter(Boolean) as string[]);

  await orderIDs.reduce(
    async (promise, id) =>
      promise.then(async () => {
        const html = await options.cache.getOrderInvoiceHTML(id);
        if (html == null) {
          throw new Error(`Invalid order ID: ${id}`);
        }
        const tokens = getContentChunks(html);
        tokens.forEach((token) => console.log(token));
      }),
    Promise.resolve()
  );
}
