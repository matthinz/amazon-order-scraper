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

This will list all your orders:

```shell
node src/main.ts
```

If you want to find an order that corresponds with a specific credit card charge, do this:

```shell
node src/main.ts orders --charge=12.34
```
