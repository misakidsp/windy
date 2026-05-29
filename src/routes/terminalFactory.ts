import { colorSetting, fontFamilySetting } from "./appearanceModel";
import type { AppearanceSettings } from "./types";

export type XtermTerminal = import("@xterm/xterm").Terminal;
export type XtermFitAddon = import("@xterm/addon-fit").FitAddon;

type CreateTerminalOptions = {
  element: HTMLElement;
  onData: (data: string) => void;
  customKeyHandler: (event: KeyboardEvent) => boolean;
  appearance: AppearanceSettings;
};

export async function createTerminalInstance({
  element,
  onData,
  customKeyHandler,
  appearance,
}: CreateTerminalOptions): Promise<{ terminal: XtermTerminal; fit: XtermFitAddon }> {
  const [{ Terminal }, { FitAddon }] = await Promise.all([
    import("@xterm/xterm"),
    import("@xterm/addon-fit"),
  ]);
  const fit = new FitAddon();
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: true,
    fontFamily: fontFamilySetting(appearance.fonts.terminalFamily),
    fontSize: appearance.fonts.terminalSize,
    lineHeight: 1.2,
    scrollback: 4000,
    theme: {
      background: colorSetting(appearance, "terminal.background"),
      foreground: colorSetting(appearance, "terminal.foreground"),
      cursor: colorSetting(appearance, "terminal.cursor"),
      selectionBackground: colorSetting(appearance, "terminal.selectionBackground"),
    },
  });

  terminal.loadAddon(fit);
  terminal.open(element);
  fit.fit();
  terminal.writeln("Terminal not started. Press x to focus and start the shell.");
  terminal.onData(onData);
  terminal.attachCustomKeyEventHandler(customKeyHandler);

  return { terminal, fit };
}
