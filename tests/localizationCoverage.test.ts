import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const routesDir = "src/routes";

const allowedSvelteLiterals = new Set([
  "src/routes/+page.svelte:>Windy<",
  "src/routes/PreferencesDialog.svelte:>x<",
  "src/routes/SearchDialog.svelte:placeholder=\"10m\"",
  "src/routes/SearchDialog.svelte:placeholder=\"1g\"",
  "src/routes/StatusBar.svelte:>Windy<",
]);

function svelteFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return svelteFiles(path);
    }
    return entry.isFile() && path.endsWith(".svelte") ? [path] : [];
  });
}

const literalPatterns = [
  /(?<!=)>\s*[^<{]*[A-Za-zぁ-んァ-ン一-龥][^<{]*</g,
  /placeholder="[^"]*[A-Za-zぁ-んァ-ン一-龥][^"]*"/g,
  /aria-label="[^"]*[A-Za-zぁ-んァ-ン一-龥][^"]*"/g,
  /aria-description="[^"]*[A-Za-zぁ-んァ-ン一-龥][^"]*"/g,
  /title="[^"]*[A-Za-zぁ-んァ-ン一-龥][^"]*"/g,
  /alt="[^"]*[A-Za-zぁ-んァ-ン一-龥][^"]*"/g,
];

const findings: string[] = [];

for (const file of svelteFiles(routesDir)) {
  const source = readFileSync(file, "utf8")
    .replace(/<script\b[\s\S]*?<\/script>/g, "")
    .replace(/<style\b[\s\S]*?<\/style>/g, "");
  const displayPath = relative(".", file).replace(/\\/g, "/");
  for (const pattern of literalPatterns) {
    for (const match of source.matchAll(pattern)) {
      const snippet = match[0].replace(/\s+/g, " ").trim();
      if (snippet.includes("{") || snippet.includes("}")) continue;
      const key = `${displayPath}:${snippet}`;
      if (!allowedSvelteLiterals.has(key)) {
        findings.push(key);
      }
    }
  }
}

assert.deepEqual(findings.sort(), [], "Visible Svelte literals should go through language.json messages");
