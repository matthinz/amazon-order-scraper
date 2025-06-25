---
applyTo: '**'
---

This is a Typescript project that uses the `@types/node` package to provide type definitions for Node.js. It is designed to be used with a Node.js environment.

Check package.json for dependencies and minimum required Node.js version.

Source code is in src. The entrypoint is `src/main.ts`.

## UX

The idea with this project is to provide a simple command line interface (CLI) for the user to build a local sqlite database of their orders on Amazon.com.

Amazon does not provide an API for this functionality, so the data is scraped from the user's order history page.

Amazon employs a number of techniques to prevent scraping, so the code is designed to be robust against these techniques.

A "real" web browser (Google Chrome) is used to scrape data, since it most reliably passes automated bot detection.

The code first attempts to run in headless mode, which is faster and more efficient. If it detects that headless mode is being blocked, it will switch to non-headless mode automatically and resume scraping.

Once data has been scraped, the CLI provides basic tools to query the order history.
