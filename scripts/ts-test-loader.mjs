import { existsSync, readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { compileModule } from "svelte/compiler";

function existingTsUrl(specifier, parentURL) {
  if (!specifier.startsWith(".") || (extname(specifier) && !specifier.endsWith(".svelte"))) return null;

  const parentPath = parentURL?.startsWith("file:")
    ? dirname(fileURLToPath(parentURL))
    : process.cwd();
  const candidate = resolvePath(parentPath, `${specifier}.ts`);

  return existsSync(candidate) ? pathToFileURL(candidate).href : null;
}

export function resolve(specifier, context, nextResolve) {
  const tsUrl = existingTsUrl(specifier, context.parentURL);
  if (tsUrl) return nextResolve(tsUrl, context);
  return nextResolve(specifier, context);
}

export function load(url, context, nextLoad) {
  if (url.endsWith(".svelte.ts")) {
    const filename = fileURLToPath(url);
    const source = stripTypeScriptTypes(readFileSync(filename, "utf8"));
    const compiled = compileModule(source, { filename, generate: "client" });
    return { format: "module", source: compiled.js.code, shortCircuit: true };
  }
  return nextLoad(url, context);
}
