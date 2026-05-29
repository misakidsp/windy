import { archiveEntryPath } from "./pathUtils";
import { invokeCommand, type TauriInvoke } from "./tauriInvoke";
import type { ImageFileContent, TextFileContent } from "./types";

export function readViewerTextFile(invoke: TauriInvoke, path: string): Promise<TextFileContent> {
  return invokeCommand<TextFileContent>(invoke, archiveEntryPath(path) ? "read_archive_text_file" : "read_text_file", { path });
}

export function readViewerImageFile(invoke: TauriInvoke, path: string): Promise<ImageFileContent> {
  return invokeCommand<ImageFileContent>(invoke, archiveEntryPath(path) ? "read_archive_image_file" : "read_image_file", { path });
}
