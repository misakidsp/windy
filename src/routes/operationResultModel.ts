import type { FileOperationResult } from "./types";

export function operationResultStatus(label: string, result: FileOperationResult): string {
  const prefix = result.canceled ? `${label} canceled` : label;
  return `${prefix}: ${result.succeeded.length} succeeded / ${result.failed.length} failed`;
}

export function operationResultTerminalLines(
  label: string,
  result: FileOperationResult,
  succeededPreviewLimit = 10,
): string[] {
  const lines = [""];
  for (const item of result.failed) {
    lines.push(`[failed] ${item.path || "-"}: ${item.message}`);
  }
  for (const item of result.succeeded.slice(0, succeededPreviewLimit)) {
    lines.push(`[ok] ${item.path || "-"}: ${item.message}`);
  }
  if (result.succeeded.length > succeededPreviewLimit) {
    lines.push(`[ok] ...and ${result.succeeded.length - succeededPreviewLimit} more`);
  }
  lines.push(`[operation] ${operationResultStatus(label, result)}`);
  return lines;
}
