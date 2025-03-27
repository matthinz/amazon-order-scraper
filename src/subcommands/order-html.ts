import type { SubcommandOptions } from "../types.ts";

export async function orderHTML(options: SubcommandOptions): Promise<void> {
  await options.args.reduce<Promise<void>>(
    async (promise, orderID) =>
      promise.then(async () => {
        const html = await options.datastore.getOrderInvoiceHTML(orderID);
        console.log(html);
      }),
    Promise.resolve(),
  );
}
