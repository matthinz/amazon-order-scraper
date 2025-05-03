# amazon-order-scraper

This is a tool that scrapes your order data from Amazon.com. It is motivated primarily by the frustration I feel when I look at a credit card statement, see a charge from Amazon, and have no idea what it was for.

Caveats: 

* Only tested with USD
* There's probably lots of things you can order on Amazon that will break this
* Probably against Amazon's TOS

## Requirements

* Node.js 23.9.0
* Yarn
* Google Chrome

## Getting started

Install dependencies:

```shell
yarn
```

## Scraping orders

Run the scraping tool like this:

```shell
node src/main.ts scrape
```

The first time you run it, you will need to log into Amazon. You'll be prompted in your terminal
to switch to the browser and authenticate.


## Viewing orders

You can list and filter your orders using the `orders` subcommand (or by omitting the subcommand since `orders` is default):

```shell
# List all orders
node src/main.ts orders
# Or simply
node src/main.ts
```

Options:

- `--total=<amount>` Filter orders by total amount (e.g., `--total=123.45`)
- `--charge=<amount>` Filter orders by payment charge amount (e.g., `--charge=12.34`)
- `[orderIds...]` One or more order IDs to include (positional arguments)

Examples:

```shell
# Filter by total amount
node src/main.ts orders --total=100.00

# Filter by charge amount
node src/main.ts orders --charge=25.00

# Filter by total and charge for a specific order
node src/main.ts orders --total=100.00 --charge=25.00 123-4567890-1234567
```
