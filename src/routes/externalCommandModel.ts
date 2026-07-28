import type { CommandTarget, ExternalCommandDefinition, FileEntry, PaneState } from "./types";
import type { TerminalShellKind } from "./terminalSideEffects";

export type ExternalCommandContext = {
  activePane: PaneState;
  otherPane: PaneState;
  activeMarked: CommandTarget[];
  otherMarked: CommandTarget[];
  shellKind: TerminalShellKind;
};

export function clampExternalCommandCursor(index: number, commandCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(commandCount - 1, 0));
}

export class ShellQuoteError extends Error {
  readonly code: "cmdUnsafePath" | "unknownShell";
  readonly value: string;

  constructor(code: "cmdUnsafePath" | "unknownShell", value: string) {
    super(code);
    this.code = code;
    this.value = value;
  }
}

export function shellQuotePath(path: string, shellKind: TerminalShellKind): string {
  if (shellKind === "powershell") return `'${path.replace(/'/g, "''")}'`;
  if (shellKind === "cmd") {
    if (/[%!\r\n]/.test(path)) throw new ShellQuoteError("cmdUnsafePath", path);
    return `"${path}"`;
  }
  if (shellKind === "posix") return `'${path.replace(/'/g, `'\\''`)}'`;
  throw new ShellQuoteError("unknownShell", path);
}

export function clipboardTextForCommandTargets(targets: CommandTarget[], shellKind: TerminalShellKind): string {
  return targets.map((target) => shellQuotePath(target.path, shellKind)).join(" ");
}

export function clipboardNameTextForCommandTargets(targets: CommandTarget[], shellKind: TerminalShellKind): string {
  return targets.map((target) => shellQuotePath(target.name, shellKind)).join(" ");
}

export function selectedEntriesForPane(pane: PaneState, visibleEntries: FileEntry[]): FileEntry[] {
  const selected = pane.entries.filter((entry) => pane.selectedKeys.has(entry.key));
  if (selected.length > 0) return selected;

  const focused = visibleEntries[pane.cursorIndex];
  return focused ? [focused] : [];
}

export function commandTargetsFromEntries(pane: PaneState, entries: FileEntry[]): CommandTarget[] {
  return entries.map((entry) => ({
    key: entry.key,
    name: entry.name,
    path: entry.path,
    kind: entry.kind,
    mode: entry.mode,
    sourceKind: pane.source.kind,
  }));
}

export function selectedCommandTargetsForPane(pane: PaneState, visibleEntries: FileEntry[]): CommandTarget[] {
  return commandTargetsFromEntries(pane, selectedEntriesForPane(pane, visibleEntries));
}

export function markedCommandTargetsForPane(pane: PaneState): CommandTarget[] {
  return commandTargetsFromEntries(
    pane,
    pane.entries.filter((entry) => pane.selectedKeys.has(entry.key)),
  );
}

export function localCommandTargets(targets: CommandTarget[], pane: PaneState): CommandTarget[] {
  return pane.source.kind === "local" ? targets : [];
}

export function externalCommandLines(
  command: ExternalCommandDefinition,
  targets: CommandTarget[],
  context: ExternalCommandContext,
): string[] {
  const argumentMode = command.argumentMode ?? "args";

  if (argumentMode === "repeat") {
    return targets.map((target, index) =>
      replaceTemplateVariables(command.template, {
        ...externalCommandVariables([target], context),
        ...targetVariables(target, index, context.shellKind),
      }),
    );
  }

  if (argumentMode === "join") {
    return [
      replaceTemplateVariables(
        command.template,
        externalCommandVariables(
          targets,
          context,
          shellQuoteLiteral(joinedCommandItems(command, targets, context.shellKind), context.shellKind),
        ),
      ),
    ];
  }

  return [replaceTemplateVariables(command.template, externalCommandVariables(targets, context))];
}

export function externalCommandVariables(
  targets: CommandTarget[],
  context: ExternalCommandContext,
  items = "",
): Record<string, string> {
  const args = quotedPaths(targets, context.shellKind);
  const names = quotedNames(targets, context.shellKind);
  const marked = quotedPaths(context.activeMarked, context.shellKind);
  const markedNames = quotedNames(context.activeMarked, context.shellKind);
  const otherMarkedPaths = quotedPaths(context.otherMarked, context.shellKind);
  const otherMarkedNames = quotedNames(context.otherMarked, context.shellKind);
  const first = targets[0]?.path ? shellQuoteLiteral(targets[0].path, context.shellKind) : "";
  const cwd = shellQuoteLiteral(context.activePane.currentPath || ".", context.shellKind);
  const otherCwd = shellQuoteLiteral(
    context.otherPane.source.kind === "local" ? context.otherPane.currentPath || "." : "",
    context.shellKind,
  );

  return {
    args,
    paths: args,
    names,
    marked,
    markedPaths: marked,
    markedNames,
    otherMarked: otherMarkedPaths,
    otherMarkedPaths,
    otherMarkedNames,
    first,
    cwd,
    otherCwd,
    items,
  };
}

export function targetVariables(target: CommandTarget, index: number, shellKind: TerminalShellKind): Record<string, string> {
  return {
    path: shellQuoteLiteral(target.path, shellKind),
    name: shellQuoteLiteral(target.name, shellKind),
    rawPath: target.path,
    rawName: target.name,
    index: String(index + 1),
    zeroIndex: String(index),
    kind: target.kind,
  };
}

export function replaceTemplateVariables(template: string, variables: Record<string, string>): string {
  let line = template;
  for (const [key, value] of Object.entries(variables)) {
    line = line.replaceAll(`{${key}}`, value);
  }
  return line;
}

function shellQuoteLiteral(value: string, shellKind: TerminalShellKind): string {
  return shellQuotePath(value, shellKind);
}

function quotedPaths(targets: CommandTarget[], shellKind: TerminalShellKind): string {
  return targets.map((target) => shellQuoteLiteral(target.path, shellKind)).join(" ");
}

function quotedNames(targets: CommandTarget[], shellKind: TerminalShellKind): string {
  return targets.map((target) => shellQuoteLiteral(target.name, shellKind)).join(" ");
}

function decodedSeparator(separator: string | undefined): string {
  return (separator ?? " ").replaceAll("\\n", "\n").replaceAll("\\t", "\t");
}

function joinedCommandItems(command: ExternalCommandDefinition, targets: CommandTarget[], shellKind: TerminalShellKind): string {
  const itemTemplate = command.itemTemplate ?? "{path}";
  return targets
    .map((target, index) => replaceTemplateVariables(itemTemplate, targetVariables(target, index, shellKind)))
    .join(decodedSeparator(command.itemSeparator));
}
