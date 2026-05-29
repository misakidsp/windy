import type { AppearanceSettings } from "./types";

const fallbackFontFamily = '"UDEV Gothic", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace';

export const defaultAppearanceSettings: AppearanceSettings = {
  schemaVersion: 1,
  fonts: {
    uiFamily: "UDEV Gothic",
    terminalFamily: "UDEV Gothic",
    uiSize: 12,
    terminalSize: 12,
    viewerSize: 12,
  },
  colors: {
    "app.background": "#181a1f",
    "app.foreground": "#e8e8e8",
    "pane.background": "#202329",
    "pane.activeBackground": "#242832",
    "pane.headerBackground": "#303847",
    "pane.border": "#4b5563",
    "entry.foreground": "#d8dee9",
    "entry.cursorBackground": "#475569",
    "entry.selectedBackground": "#263f46",
    "entry.cursorSelectedBackground": "#3f5962",
    "entry.directoryForeground": "#9fd1ff",
    "entry.hiddenForeground": "#8d96a7",
    "entry.errorForeground": "#fca5a5",
    "entry.mutedForeground": "#858f9e",
    "entry.filterKeptBackground": "#20262c",
    "entry.diffLeftOnlyBackground": "#1d3147",
    "entry.diffRightOnlyBackground": "#1d3a2a",
    "entry.diffChangedBackground": "#3a2f1f",
    "filter.foreground": "#c7d2fe",
    "filter.editingForeground": "#e5e7eb",
    "filter.editingBackground": "#1d2530",
    "dialog.background": "#171a20",
    "dialog.foreground": "#d1d5db",
    "dialog.accent": "#93c5fd",
    "dialog.backdrop": "rgb(0 0 0 / 0.58)",
    "dialog.shadow": "rgb(0 0 0 / 0.42)",
    "dialog.headerForeground": "#f8fafc",
    "dialog.mutedForeground": "#aeb6c3",
    "dialog.itemBackground": "#171c24",
    "dialog.itemBorder": "#303946",
    "dialog.itemActiveBackground": "#243142",
    "dialog.inputBackground": "#1f242c",
    "dialog.warningForeground": "#fbbf24",
    "dialog.dangerForeground": "#fca5a5",
    "dialog.dangerBorder": "#a94444",
    "dialog.warningBorder": "#a9792b",
    "terminal.background": "#111318",
    "terminal.foreground": "#d1d5db",
    "terminal.cursor": "#f9fafb",
    "terminal.selectionBackground": "#374151",
    "viewer.background": "#111318",
    "viewer.foreground": "#d8dee9",
    "viewer.lineNumberForeground": "#6b7280",
  },
  extensionColors: {
    ".md": "#f9d65c",
    ".json": "#fbbf24",
    ".toml": "#f0abfc",
    ".rs": "#fb923c",
    ".ts": "#7dd3fc",
    ".svelte": "#ff8a65",
    ".png": "#86efac",
    ".jpg": "#86efac",
    ".jpeg": "#86efac",
    ".zip": "#c4b5fd",
    ".tar": "#c4b5fd",
    ".gz": "#c4b5fd",
  },
};

export function colorSetting(settings: AppearanceSettings, key: string): string {
  return settings.colors[key] ?? defaultAppearanceSettings.colors[key] ?? "";
}

export function fontFamilySetting(family: string): string {
  const trimmed = family.trim();
  if (!trimmed) return fallbackFontFamily;
  return `"${trimmed.replaceAll("\"", "\\\"")}", ${fallbackFontFamily}`;
}

export function appearanceCssVariables(settings: AppearanceSettings): Record<string, string> {
  return {
    "--windy-font-family": fontFamilySetting(settings.fonts.uiFamily),
    "--windy-terminal-font-family": fontFamilySetting(settings.fonts.terminalFamily),
    "--windy-ui-font-size": `${settings.fonts.uiSize}px`,
    "--windy-terminal-font-size": `${settings.fonts.terminalSize}px`,
    "--windy-viewer-font-size": `${settings.fonts.viewerSize}px`,
    "--windy-app-background": colorSetting(settings, "app.background"),
    "--windy-app-foreground": colorSetting(settings, "app.foreground"),
    "--windy-pane-background": colorSetting(settings, "pane.background"),
    "--windy-pane-active-background": colorSetting(settings, "pane.activeBackground"),
    "--windy-pane-header-background": colorSetting(settings, "pane.headerBackground"),
    "--windy-pane-border": colorSetting(settings, "pane.border"),
    "--windy-entry-foreground": colorSetting(settings, "entry.foreground"),
    "--windy-entry-cursor-background": colorSetting(settings, "entry.cursorBackground"),
    "--windy-entry-selected-background": colorSetting(settings, "entry.selectedBackground"),
    "--windy-entry-cursor-selected-background": colorSetting(settings, "entry.cursorSelectedBackground"),
    "--windy-entry-directory-foreground": colorSetting(settings, "entry.directoryForeground"),
    "--windy-entry-hidden-foreground": colorSetting(settings, "entry.hiddenForeground"),
    "--windy-entry-error-foreground": colorSetting(settings, "entry.errorForeground"),
    "--windy-entry-muted-foreground": colorSetting(settings, "entry.mutedForeground"),
    "--windy-entry-filter-kept-background": colorSetting(settings, "entry.filterKeptBackground"),
    "--windy-entry-diff-left-only-background": colorSetting(settings, "entry.diffLeftOnlyBackground"),
    "--windy-entry-diff-right-only-background": colorSetting(settings, "entry.diffRightOnlyBackground"),
    "--windy-entry-diff-changed-background": colorSetting(settings, "entry.diffChangedBackground"),
    "--windy-filter-foreground": colorSetting(settings, "filter.foreground"),
    "--windy-filter-editing-foreground": colorSetting(settings, "filter.editingForeground"),
    "--windy-filter-editing-background": colorSetting(settings, "filter.editingBackground"),
    "--windy-dialog-background": colorSetting(settings, "dialog.background"),
    "--windy-dialog-foreground": colorSetting(settings, "dialog.foreground"),
    "--windy-dialog-accent": colorSetting(settings, "dialog.accent"),
    "--windy-dialog-backdrop": colorSetting(settings, "dialog.backdrop"),
    "--windy-dialog-shadow": colorSetting(settings, "dialog.shadow"),
    "--windy-dialog-header-foreground": colorSetting(settings, "dialog.headerForeground"),
    "--windy-dialog-muted-foreground": colorSetting(settings, "dialog.mutedForeground"),
    "--windy-dialog-item-background": colorSetting(settings, "dialog.itemBackground"),
    "--windy-dialog-item-border": colorSetting(settings, "dialog.itemBorder"),
    "--windy-dialog-item-active-background": colorSetting(settings, "dialog.itemActiveBackground"),
    "--windy-dialog-input-background": colorSetting(settings, "dialog.inputBackground"),
    "--windy-dialog-warning-foreground": colorSetting(settings, "dialog.warningForeground"),
    "--windy-dialog-danger-foreground": colorSetting(settings, "dialog.dangerForeground"),
    "--windy-dialog-danger-border": colorSetting(settings, "dialog.dangerBorder"),
    "--windy-dialog-warning-border": colorSetting(settings, "dialog.warningBorder"),
    "--windy-terminal-background": colorSetting(settings, "terminal.background"),
    "--windy-terminal-foreground": colorSetting(settings, "terminal.foreground"),
    "--windy-terminal-cursor": colorSetting(settings, "terminal.cursor"),
    "--windy-terminal-selection-background": colorSetting(settings, "terminal.selectionBackground"),
    "--windy-viewer-background": colorSetting(settings, "viewer.background"),
    "--windy-viewer-foreground": colorSetting(settings, "viewer.foreground"),
    "--windy-viewer-line-number-foreground": colorSetting(settings, "viewer.lineNumberForeground"),
  };
}

export function applyAppearanceToRoot(root: HTMLElement, settings: AppearanceSettings): void {
  const variables = appearanceCssVariables(settings);
  for (const [key, value] of Object.entries(variables)) {
    if (value) root.style.setProperty(key, value);
  }
}

export function normalizedExtensionColorMap(settings: AppearanceSettings): Record<string, string> {
  const colors: Record<string, string> = {};
  for (const [extension, color] of Object.entries(settings.extensionColors ?? {})) {
    const trimmedExtension = extension.trim().toLocaleLowerCase();
    const normalizedExtension = trimmedExtension.startsWith(".") ? trimmedExtension : `.${trimmedExtension}`;
    const trimmedColor = color.trim();
    if (normalizedExtension.length > 1 && trimmedColor) colors[normalizedExtension] = trimmedColor;
  }
  return colors;
}
