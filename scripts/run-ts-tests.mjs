import { readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const testsDir = resolve("tests");
const files = (await readdir(testsDir))
  .filter((name) => name.endsWith(".test.ts"))
  .sort();

for (const file of files) {
  await import(pathToFileURL(resolve(testsDir, file)).href);
}

await new Promise((resolveMicrotasks) => setImmediate(resolveMicrotasks));

if (process.exitCode && process.exitCode !== 0) {
  process.exit(process.exitCode);
}

console.log(`Executed ${files.length} TypeScript test files.`);
