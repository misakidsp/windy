import { access } from "node:fs/promises";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

async function existingTsUrl(specifier, parentURL) {
  if (!specifier.startsWith(".") || extname(specifier)) return null;

  const parentPath = parentURL?.startsWith("file:")
    ? dirname(fileURLToPath(parentURL))
    : process.cwd();
  const candidate = resolvePath(parentPath, `${specifier}.ts`);

  try {
    await access(candidate);
    return pathToFileURL(candidate).href;
  } catch {
    return null;
  }
}

export async function resolve(specifier, context, nextResolve) {
  const tsUrl = await existingTsUrl(specifier, context.parentURL);
  if (tsUrl) return nextResolve(tsUrl, context);
  return nextResolve(specifier, context);
}
