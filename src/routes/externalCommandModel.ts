import type { CommandTarget, ExternalCommandDefinition, FileEntry, PaneState } from "./types";

export type ExternalCommandContext = {
  activePane: PaneState;
  otherPane: PaneState;
  activeMarked: CommandTarget[];
  otherMarked: CommandTarget[];
  isWindows: boolean;
};

export function clampExternalCommandCursor(index: number, commandCount: number): number {
  return Math.min(Math.max(index, 0), Math.max(commandCount - 1, 0));
}

export function shellQuotePath(path: string, isWindows: boolean): string {
  if (isWindows) return `'${path.replace(/'/g, "''")}'`;
  return `'${path.replace(/'/g, `'\\''`)}'`;
}

export function clipboardTextForCommandTargets(targets: CommandTarget[], isWindows: boolean): string {
  return targets.map((target) => shellQuotePath(target.path, isWindows)).join(" ");
}

export function clipboardNameTextForCommandTargets(targets: CommandTarget[], isWindows: boolean): string {
  return targets.map((target) => shellQuotePath(target.name, isWindows)).join(" ");
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
        ...targetVariables(target, index, context.isWindows),
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
          shellQuoteLiteral(joinedCommandItems(command, targets, context.isWindows), context.isWindows),
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
  const args = quotedPaths(targets, context.isWindows);
  const names = quotedNames(targets, context.isWindows);
  const marked = quotedPaths(context.activeMarked, context.isWindows);
  const markedNames = quotedNames(context.activeMarked, context.isWindows);
  const otherMarkedPaths = quotedPaths(context.otherMarked, context.isWindows);
  const otherMarkedNames = quotedNames(context.otherMarked, context.isWindows);
  const first = targets[0]?.path ? shellQuoteLiteral(targets[0].path, context.isWindows) : "";
  const cwd = shellQuoteLiteral(context.activePane.currentPath || ".", context.isWindows);
  const otherCwd = shellQuoteLiteral(
    context.otherPane.source.kind === "local" ? context.otherPane.currentPath || "." : "",
    context.isWindows,
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

export function targetVariables(target: CommandTarget, index: number, isWindows: boolean): Record<string, string> {
  return {
    path: shellQuoteLiteral(target.path, isWindows),
    name: shellQuoteLiteral(target.name, isWindows),
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

function shellQuoteLiteral(value: string, isWindows: boolean): string {
  return shellQuotePath(value, isWindows);
}

function quotedPaths(targets: CommandTarget[], isWindows: boolean): string {
  return targets.map((target) => shellQuoteLiteral(target.path, isWindows)).join(" ");
}

function quotedNames(targets: CommandTarget[], isWindows: boolean): string {
  return targets.map((target) => shellQuoteLiteral(target.name, isWindows)).join(" ");
}

function decodedSeparator(separator: string | undefined): string {
  return (separator ?? " ").replaceAll("\\n", "\n").replaceAll("\\t", "\t");
}

function joinedCommandItems(command: ExternalCommandDefinition, targets: CommandTarget[], isWindows: boolean): string {
  const itemTemplate = command.itemTemplate ?? "{path}";
  return targets
    .map((target, index) => replaceTemplateVariables(itemTemplate, targetVariables(target, index, isWindows)))
    .join(decodedSeparator(command.itemSeparator));
}
