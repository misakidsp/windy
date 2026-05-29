import assert from "node:assert/strict";
import { readViewerImageFile, readViewerTextFile } from "../src/routes/viewerSideEffects";
import type { TauriInvoke } from "../src/routes/locationSideEffects";

const calls: { command: string; args?: Record<string, unknown> }[] = [];
const invoke: TauriInvoke = async (command, args) => {
  calls.push({ command, args });
  if (command.includes("image")) return { path: String(args?.path ?? ""), dataUrl: "data:image/png;base64,AA==", mimeType: "image/png" } as never;
  return { path: String(args?.path ?? ""), content: "hello", encoding: "utf-8", truncated: false } as never;
};

async function run(): Promise<void> {
  assert.equal((await readViewerTextFile(invoke, "/work/readme.md")).content, "hello");
  assert.equal((await readViewerTextFile(invoke, "/work/archive.zip::/readme.md")).content, "hello");
  assert.equal((await readViewerImageFile(invoke, "/work/image.png")).mimeType, "image/png");
  assert.equal((await readViewerImageFile(invoke, "/work/archive.zip::/image.png")).mimeType, "image/png");

  assert.deepEqual(calls, [
    { command: "read_text_file", args: { path: "/work/readme.md" } },
    { command: "read_archive_text_file", args: { path: "/work/archive.zip::/readme.md" } },
    { command: "read_image_file", args: { path: "/work/image.png" } },
    { command: "read_archive_image_file", args: { path: "/work/archive.zip::/image.png" } },
  ]);
}

run().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
