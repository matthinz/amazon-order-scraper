import { run } from "./cli.js";
run(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
//# sourceMappingURL=main.js.map