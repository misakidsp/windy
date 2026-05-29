import type { FileOperationKind } from "./types";

export const textViewerExtensions = new Set([
  "txt",
  "md",
  "markdown",
  "def",
  "cfg",
  "ini",
  "json",
  "toml",
  "yaml",
  "yml",
  "log",
  "rs",
  "ts",
  "js",
  "svelte",
  "css",
  "html",
]);

export const imageViewerExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"]);
export const archiveExtensions = new Set(["zip", "tar", "tgz"]);

export const showParentEntry = false;
export const defaultConsoleHeightRatio = 0.22;
export const moveCursorAfterSelection = true;
export const defaultPageSize = 12;
export const fileRowHeight = 20;
export const virtualListOverscan = 8;
export const largeSearchResultWarningThreshold = 5000;
export const terminalRepeatDelayMs = 380;
export const terminalRepeatIntervalMs = 35;

export const operationKeys: Partial<Record<string, FileOperationKind>> = {
  c: "copy",
  m: "move",
  r: "rename",
  a: "chmod",
  u: "extractArchive",
};
