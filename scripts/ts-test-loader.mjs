import { existsSync } from "node:fs";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function existingTsUrl(specifier, parentURL) {
  if (!specifier.startsWith(".") || extname(specifier)) return null;

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
