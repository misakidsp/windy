<script lang="ts">
  import type { AppearanceSettings, AppSettings, KeybindSettings, LanguagePresetInfo, LanguageSettings } from "./types";
  import type { Translate } from "./localization";
  import { keyHelpCommandLabel } from "./keyHelpModel";
  import {
    keybindingEditorText,
    parseKeybindingEditorText,
    validateKeybindingScopes,
    type KeybindingValidationIssue,
  } from "./keybindingEditorModel";
  import { paneKeybindingCommandIds } from "./keyboardModel";
  import { terminalKeybindingCommandIds } from "./terminalKeyHandling";

  type Section = "general" | "keybindings" | "appearance" | "language" | "reset";
  type ResetTarget = "app" | "appearance" | "keybind" | "language";
  type ColorScope = "colors" | "extensionColors";

  export let appSettings: AppSettings;
  export let appearanceSettings: AppearanceSettings;
  export let keybindSettings: KeybindSettings;
  export let languageSettings: LanguageSettings;
  export let languagePresets: LanguagePresetInfo[] = [];
  export let loading = false;
  export let error = "";
  export let onClose: () => void;
  export let onOpenConfigDirectory: () => Promise<void>;
  export let onSaveAppSettings: (settings: AppSettings) => Promise<void>;
  export let onSaveAppearanceSettings: (settings: AppearanceSettings) => Promise<void>;
  export let onSaveKeybindSettings: (settings: KeybindSettings) => Promise<void>;
  export let onApplyLanguagePreset: (locale: string) => Promise<void>;
  export let onReset: (target: ResetTarget) => Promise<void>;
  export let onEnterSafeMode: () => Promise<void>;
  export let t: Translate = (id, values) => {
    if (!values) return id;
    return id.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => (
      values[key] === undefined ? match : String(values[key])
    ));
  };

  let section: Section = "general";
  let editorCommand = appSettings.externalEditor.command;
  let editorArgs = appSettings.externalEditor.args.join("\n");
  let useTrash = appSettings.useTrash;
  let uiFamily = appearanceSettings.fonts.uiFamily;
  let terminalFamily = appearanceSettings.fonts.terminalFamily;
  let uiSize = String(appearanceSettings.fonts.uiSize);
  let terminalSize = String(appearanceSettings.fonts.terminalSize);
  let viewerSize = String(appearanceSettings.fonts.viewerSize);
  let fileRowHeight = String(appearanceSettings.layout.fileRowHeight);
  let colorEntries = Object.entries(appearanceSettings.colors).map(([key, value]) => ({ key, value }));
  let extensionColorEntries = Object.entries(appearanceSettings.extensionColors).map(([key, value]) => ({ key, value }));
  let activeColorScope: ColorScope = "colors";
  let activeColorKey = colorEntries[0]?.key ?? "";
  let selectedColorEntry: { key: string; value: string } | undefined = colorEntries[0];
  let newExtensionKey = "";
  let newExtensionColor = "#94a3b8";
  let keybindingEntries = Object.entries(keybindSettings.bindings).map(([command, keys]) => ({
    command,
    keys: keybindingEditorText(keys),
  }));
  let keybindingValidationError = "";
  let languageLocale = languageSettings.locale;
  let pendingReset: ResetTarget | null = null;
  let safeModeConfirmOpen = false;
  let lastAppSettings = appSettings;
  let lastAppearanceSettings = appearanceSettings;
  let lastKeybindSettings = keybindSettings;
  let lastLanguageSettings = languageSettings;

  $: if (appSettings !== lastAppSettings) {
    editorCommand = appSettings.externalEditor.command;
    editorArgs = appSettings.externalEditor.args.join("\n");
    useTrash = appSettings.useTrash;
    lastAppSettings = appSettings;
  }

  $: if (appearanceSettings !== lastAppearanceSettings) {
    uiFamily = appearanceSettings.fonts.uiFamily;
    terminalFamily = appearanceSettings.fonts.terminalFamily;
    uiSize = String(appearanceSettings.fonts.uiSize);
    terminalSize = String(appearanceSettings.fonts.terminalSize);
    viewerSize = String(appearanceSettings.fonts.viewerSize);
    fileRowHeight = String(appearanceSettings.layout.fileRowHeight);
    colorEntries = Object.entries(appearanceSettings.colors).map(([key, value]) => ({ key, value }));
    extensionColorEntries = Object.entries(appearanceSettings.extensionColors).map(([key, value]) => ({ key, value }));
    if (!activeColorEntry()) {
      activeColorScope = "colors";
      activeColorKey = colorEntries[0]?.key ?? "";
    }
    lastAppearanceSettings = appearanceSettings;
  }

  $: if (keybindSettings !== lastKeybindSettings) {
    keybindingEntries = Object.entries(keybindSettings.bindings).map(([command, keys]) => ({
      command,
      keys: keybindingEditorText(keys),
    }));
    keybindingValidationError = "";
    lastKeybindSettings = keybindSettings;
  }

  $: if (languageSettings !== lastLanguageSettings) {
    languageLocale = languageSettings.locale;
    lastLanguageSettings = languageSettings;
  }

  $: selectedColorEntry = activeColorEntry();

  function splitArgs(value: string): string[] {
    return value
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
  }

  function numberValue(value: string, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
  }

  function entryRecord(entries: { key: string; value: string }[]): Record<string, string> {
    return Object.fromEntries(entries.map((entry) => [entry.key, entry.value.trim() || "#000000"]));
  }

  function colorInputValue(value: string): string {
    return /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  }

  function activeColorEntries(): { key: string; value: string }[] {
    return activeColorScope === "colors" ? colorEntries : extensionColorEntries;
  }

  function languagePresetLabel(preset: LanguagePresetInfo): string {
    const id = `preferences.languagePreset.${preset.locale}`;
    const label = t(id);
    return label === id ? preset.name : label;
  }

  function activeColorEntry(): { key: string; value: string } | undefined {
    return activeColorEntries().find((entry) => entry.key === activeColorKey);
  }

  function selectColor(scope: ColorScope, key: string): void {
    activeColorScope = scope;
    activeColorKey = key;
  }

  function updateActiveColor(value: string): void {
    const entries = activeColorEntries();
    const index = entries.findIndex((entry) => entry.key === activeColorKey);
    if (index < 0) return;
    const next = entries.map((entry, entryIndex) => (
      entryIndex === index ? { ...entry, value } : entry
    ));
    if (activeColorScope === "colors") {
      colorEntries = next;
    } else {
      extensionColorEntries = next;
    }
  }

  function addExtensionColor(): void {
    const key = newExtensionKey.trim().replace(/^\./, "").toLowerCase();
    if (!key) return;
    const value = colorInputValue(newExtensionColor);
    const withoutExisting = extensionColorEntries.filter((entry) => entry.key !== key);
    extensionColorEntries = [...withoutExisting, { key, value }].sort((left, right) => left.key.localeCompare(right.key));
    activeColorScope = "extensionColors";
    activeColorKey = key;
    newExtensionKey = "";
  }

  function removeActiveExtensionColor(): void {
    if (activeColorScope !== "extensionColors" || !activeColorKey) return;
    extensionColorEntries = extensionColorEntries.filter((entry) => entry.key !== activeColorKey);
    activeColorKey = extensionColorEntries[0]?.key ?? colorEntries[0]?.key ?? "";
    activeColorScope = extensionColorEntries.length ? "extensionColors" : "colors";
  }

  async function saveGeneral(): Promise<void> {
    await onSaveAppSettings({
      ...appSettings,
      useTrash,
      externalEditor: {
        command: editorCommand.trim(),
        args: splitArgs(editorArgs),
      },
    });
  }

  async function saveAppearance(): Promise<void> {
    await onSaveAppearanceSettings({
      ...appearanceSettings,
      fonts: {
        uiFamily: uiFamily.trim() || appearanceSettings.fonts.uiFamily,
        terminalFamily: terminalFamily.trim() || appearanceSettings.fonts.terminalFamily,
        uiSize: numberValue(uiSize, appearanceSettings.fonts.uiSize),
        terminalSize: numberValue(terminalSize, appearanceSettings.fonts.terminalSize),
        viewerSize: numberValue(viewerSize, appearanceSettings.fonts.viewerSize),
      },
      layout: {
        fileRowHeight: numberValue(fileRowHeight, appearanceSettings.layout.fileRowHeight),
      },
      colors: entryRecord(colorEntries),
      extensionColors: entryRecord(extensionColorEntries),
    });
  }

  async function saveKeybindings(): Promise<void> {
    const bindings = Object.fromEntries(
      keybindingEntries.map((entry) => [entry.command, parseKeybindingEditorText(entry.keys)]),
    );
    const issue = validateKeybindingScopes(
      bindings,
      keybindSettings.lockedBindings,
      [paneKeybindingCommandIds, terminalKeybindingCommandIds],
    );
    if (issue) {
      keybindingValidationError = keybindingValidationMessage(issue);
      return;
    }
    keybindingValidationError = "";
    await onSaveKeybindSettings({
      ...keybindSettings,
      bindings,
    });
  }

  function keybindingValidationMessage(issue: KeybindingValidationIssue): string {
    if (issue.kind === "unsupportedSequence") {
      return t("preferences.keybindingUnsupportedSequence", {
        binding: issue.binding,
        command: issue.command,
      });
    }
    if (issue.kind === "prefixConflict") {
      return t("preferences.keybindingPrefixConflict", {
        binding: issue.binding,
        first: issue.firstCommand,
        second: issue.secondCommand,
      });
    }
    return t("preferences.keybindingDuplicate", {
      binding: issue.binding,
      first: issue.firstCommand,
      second: issue.secondCommand,
    });
  }

  async function confirmReset(): Promise<void> {
    if (!pendingReset) return;
    const target = pendingReset;
    pendingReset = null;
    await onReset(target);
  }

  async function confirmSafeMode(): Promise<void> {
    safeModeConfirmOpen = false;
    await onEnterSafeMode();
  }

  const presetColors = [
    "#f8fafc",
    "#d1d5db",
    "#94a3b8",
    "#38bdf8",
    "#22c55e",
    "#facc15",
    "#f97316",
    "#f87171",
    "#c084fc",
    "#10131a",
    "#171a20",
    "#334155",
  ];
</script>

<div class="preferences-backdrop" role="presentation" data-windy-interactive>
  <div class="preferences-dialog" role="dialog" aria-modal="true" aria-labelledby="preferences-title">
    <header class="preferences-header">
      <div>
        <div id="preferences-title" class="preferences-title">{t("preferences.title")}</div>
        <div class="preferences-subtitle">{t("preferences.subtitle")}</div>
      </div>
      <button type="button" class="icon-button" aria-label={t("preferences.closeLabel")} onclick={onClose}>x</button>
    </header>

    <div class="preferences-body">
      <nav class="preferences-nav" aria-label={t("preferences.sectionsLabel")}>
        <button class:active={section === "general"} type="button" onclick={() => (section = "general")}>{t("preferences.general")}</button>
        <button class:active={section === "keybindings"} type="button" onclick={() => (section = "keybindings")}>{t("preferences.keybindings")}</button>
        <button class:active={section === "appearance"} type="button" onclick={() => (section = "appearance")}>{t("preferences.appearance")}</button>
        <button class:active={section === "language"} type="button" onclick={() => (section = "language")}>{t("preferences.language")}</button>
        <button class:active={section === "reset"} type="button" onclick={() => (section = "reset")}>{t("preferences.reset")}</button>
      </nav>

      <section class="preferences-panel">
        {#if error}
          <div class="preferences-error">{error}</div>
        {/if}

        {#if section === "general"}
          <div class="section-heading">
            <h2>{t("preferences.general")}</h2>
            <button type="button" onclick={saveGeneral} disabled={loading}>{t("dialog.save")}</button>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" checked={useTrash} onchange={(event) => (useTrash = event.currentTarget.checked)} />
            <span>{t("preferences.useTrash")}</span>
          </label>
          <label>
            <span>{t("preferences.editorCommand")}</span>
            <input bind:value={editorCommand} placeholder={t("preferences.editorCommandPlaceholder")} spellcheck="false" autocomplete="off" />
          </label>
          <label>
            <span>{t("preferences.editorArgs")}</span>
            <textarea bind:value={editorArgs} spellcheck="false" autocomplete="off" rows="5"></textarea>
          </label>
          <button type="button" class="secondary-button" onclick={onOpenConfigDirectory} disabled={loading}>
            {t("preferences.openConfigDirectory")}
          </button>
        {:else if section === "keybindings"}
          <div class="section-heading">
            <h2>{t("preferences.keybindings")}</h2>
            <button type="button" onclick={saveKeybindings} disabled={loading}>{t("dialog.save")}</button>
          </div>
          {#if keybindingValidationError}
            <div class="preferences-error">{keybindingValidationError}</div>
          {/if}
          <div class="scroll-table">
            {#each keybindingEntries as entry, index (entry.command)}
              <label class="table-row">
                <span>
                  {keyHelpCommandLabel(entry.command, t)}
                  <code>{entry.command}</code>
                </span>
                <textarea
                  value={entry.keys}
                  spellcheck="false"
                  autocomplete="off"
                  rows="2"
                  oninput={(event) => (keybindingEntries[index].keys = event.currentTarget.value)}
                ></textarea>
              </label>
            {/each}
          </div>
          <h3>{t("preferences.lockedBindings")}</h3>
          <div class="locked-list">
            {#each Object.entries(keybindSettings.lockedBindings) as [command, keys]}
              <div>
                <span>
                  {keyHelpCommandLabel(command, t)}
                  <code>{command}</code>
                </span>
                <code>{keys.join(", ")}</code>
              </div>
            {/each}
          </div>
        {:else if section === "appearance"}
          <div class="section-heading">
            <h2>{t("preferences.appearance")}</h2>
            <button type="button" onclick={saveAppearance} disabled={loading}>{t("dialog.save")}</button>
          </div>
          <div class="field-grid">
            <label><span>{t("preferences.uiFont")}</span><input bind:value={uiFamily} spellcheck="false" autocomplete="off" /></label>
            <label><span>{t("preferences.terminalFont")}</span><input bind:value={terminalFamily} spellcheck="false" autocomplete="off" /></label>
            <label><span>{t("preferences.uiSize")}</span><input bind:value={uiSize} inputmode="numeric" /></label>
            <label><span>{t("preferences.terminalSize")}</span><input bind:value={terminalSize} inputmode="numeric" /></label>
            <label><span>{t("preferences.viewerSize")}</span><input bind:value={viewerSize} inputmode="numeric" /></label>
            <label><span>{t("preferences.fileRowHeight")}</span><input bind:value={fileRowHeight} inputmode="numeric" /></label>
          </div>
          <h3>{t("preferences.colors")}</h3>
          <div class="color-workspace">
            <div class="color-list" aria-label={t("preferences.colorSettingsLabel")}>
              <div class="color-list-heading">{t("preferences.interfaceColors")}</div>
              {#each colorEntries as entry (entry.key)}
                <button
                  type="button"
                  class:active={activeColorScope === "colors" && activeColorKey === entry.key}
                  class="color-row"
                  onclick={() => selectColor("colors", entry.key)}
                >
                  <span class="swatch" style={`background: ${entry.value}`}></span>
                  <span>{entry.key}</span>
                </button>
              {/each}
              <div class="color-list-heading extension-heading">{t("preferences.extensionColors")}</div>
              {#each extensionColorEntries as entry (entry.key)}
                <button
                  type="button"
                  class:active={activeColorScope === "extensionColors" && activeColorKey === entry.key}
                  class="color-row"
                  onclick={() => selectColor("extensionColors", entry.key)}
                >
                  <span class="swatch" style={`background: ${entry.value}`}></span>
                  <span>.{entry.key}</span>
                </button>
              {/each}
            </div>

            <div class="color-editor">
              {#if selectedColorEntry}
                <div class="selected-color-preview" style={`background: ${selectedColorEntry.value}`}></div>
                <div class="selected-color-title">
                  <span>{activeColorScope === "extensionColors" ? `.${selectedColorEntry.key}` : selectedColorEntry.key}</span>
                  <code>{selectedColorEntry.value}</code>
                </div>
                <label class="picker-row">
                  <span>{t("preferences.colorPicker")}</span>
                  <input
                    type="color"
                    value={colorInputValue(selectedColorEntry.value)}
                    oninput={(event) => updateActiveColor(event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>{t("preferences.hexValue")}</span>
                  <input
                    value={selectedColorEntry.value}
                    spellcheck="false"
                    autocomplete="off"
                    oninput={(event) => updateActiveColor(event.currentTarget.value)}
                  />
                </label>
                <div class="preset-grid" aria-label={t("preferences.presetColorsLabel")}>
                  {#each presetColors as color}
                    <button
                      type="button"
                      class="preset-swatch"
                      style={`background: ${color}`}
                      aria-label={t("preferences.setColor", { color })}
                      title={color}
                      onclick={() => updateActiveColor(color)}
                    ></button>
                  {/each}
                </div>
                {#if activeColorScope === "extensionColors"}
                  <button type="button" class="secondary-button danger-button" onclick={removeActiveExtensionColor}>
                    {t("preferences.removeExtensionColor")}
                  </button>
                {/if}
              {:else}
                <div class="note">{t("preferences.selectColorItem")}</div>
              {/if}

              <div class="extension-add">
                <h3>{t("preferences.addExtensionColor")}</h3>
                <label>
                  <span>{t("preferences.extension")}</span>
                  <input bind:value={newExtensionKey} placeholder={t("preferences.extensionPlaceholder")} spellcheck="false" autocomplete="off" />
                </label>
                <label class="picker-row">
                  <span>{t("preferences.color")}</span>
                  <input type="color" bind:value={newExtensionColor} />
                </label>
                <button type="button" onclick={addExtensionColor}>{t("preferences.addOrUpdate")}</button>
              </div>
            </div>
          </div>
        {:else if section === "language"}
          <div class="section-heading">
            <h2>{t("preferences.languageFile")}</h2>
            <button type="button" onclick={() => onApplyLanguagePreset(languageLocale)} disabled={loading}>{t("dialog.apply")}</button>
          </div>
          <label>
            <span>{t("preferences.preset")}</span>
            <select bind:value={languageLocale}>
              {#each languagePresets as preset}
                <option value={preset.locale}>{languagePresetLabel(preset)}</option>
              {/each}
            </select>
          </label>
          <div class="note">{t("preferences.currentLocale", { locale: languageSettings.locale })}</div>
          <div class="note">{t("preferences.languageCoverageNote")}</div>
        {:else}
          <div class="section-heading">
            <h2>{t("preferences.reset")}</h2>
          </div>
          <div class="reset-actions">
            <button type="button" onclick={() => (pendingReset = "app")} disabled={loading}>{t("preferences.resetGeneral")}</button>
            <button type="button" onclick={() => (pendingReset = "keybind")} disabled={loading}>{t("preferences.resetKeybindings")}</button>
            <button type="button" onclick={() => (pendingReset = "appearance")} disabled={loading}>{t("preferences.resetAppearance")}</button>
            <button type="button" onclick={() => (pendingReset = "language")} disabled={loading}>{t("preferences.resetLanguage")}</button>
          </div>
          <div class="note">{t("preferences.resetNote")}</div>
          <div class="safe-mode-box">
            <h3>{t("preferences.safeMode")}</h3>
            <div class="note">
              {t("preferences.safeModeNote")}
            </div>
            <button type="button" class="danger-button" onclick={() => (safeModeConfirmOpen = true)} disabled={loading}>
              {t("preferences.enterSafeMode")}
            </button>
          </div>
        {/if}
      </section>
    </div>

    <footer class="preferences-footer">
      <span>{loading ? t("dialog.working") : t("preferences.footerHint")}</span>
      <button type="button" onclick={onClose}>{t("dialog.close")}</button>
    </footer>
  </div>

  {#if pendingReset}
    <div class="nested-confirm" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
      <div class="nested-confirm-dialog">
        <h2 id="reset-confirm-title">{t("preferences.resetSettingsTitle")}</h2>
        <p>{t("preferences.resetConfirm")}</p>
        <div class="confirm-actions">
          <button type="button" onclick={() => (pendingReset = null)}>{t("dialog.cancel")}</button>
          <button type="button" class="danger-button" onclick={confirmReset} disabled={loading}>{t("dialog.reset")}</button>
        </div>
      </div>
    </div>
  {/if}

  {#if safeModeConfirmOpen}
    <div class="nested-confirm" role="dialog" aria-modal="true" aria-labelledby="safe-mode-confirm-title">
      <div class="nested-confirm-dialog">
        <h2 id="safe-mode-confirm-title">{t("preferences.enterSafeMode")}</h2>
        <p>{t("preferences.safeModeConfirm")}</p>
        <div class="confirm-actions">
          <button type="button" onclick={() => (safeModeConfirmOpen = false)}>{t("dialog.cancel")}</button>
          <button type="button" class="danger-button" onclick={confirmSafeMode} disabled={loading}>{t("preferences.enterSafeMode")}</button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  :global(.app-shell [data-windy-interactive]),
  :global(.app-shell [data-windy-interactive] *) {
    pointer-events: auto;
  }

  :global(.app-shell [data-windy-interactive] input),
  :global(.app-shell [data-windy-interactive] textarea) {
    user-select: text;
  }

  .preferences-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 20px;
    background: var(--windy-dialog-backdrop, rgb(0 0 0 / 0.58));
  }

  .preferences-dialog {
    width: min(980px, 100%);
    max-height: min(760px, calc(100vh - 40px));
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    overflow: hidden;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    background: var(--windy-dialog-background, #171a20);
    color: var(--windy-dialog-foreground, #d1d5db);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
  }

  .preferences-header,
  .preferences-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
  }

  .preferences-footer {
    border-top: 1px solid var(--windy-pane-border, #343b47);
    border-bottom: 0;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .preferences-title {
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 15px;
    font-weight: 700;
  }

  .preferences-subtitle,
  .note {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    font-size: 12px;
  }

  .preferences-body {
    min-height: 0;
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
  }

  .preferences-nav {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: 10px;
    border-right: 1px solid var(--windy-pane-border, #343b47);
  }

  button,
  input,
  select,
  textarea {
    font: inherit;
  }

  button {
    min-height: 28px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    background: var(--windy-button-background, #20242d);
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  button.active,
  button:hover {
    background: var(--windy-selection-background, #334155);
    color: var(--windy-selection-foreground, #f8fafc);
  }

  button:disabled {
    opacity: 0.55;
  }

  .icon-button {
    width: 30px;
  }

  .secondary-button {
    width: fit-content;
  }

  .preferences-panel {
    min-height: 0;
    overflow: auto;
    padding: 14px;
  }

  .section-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  h2,
  h3 {
    margin: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  h3 {
    margin-top: 18px;
    margin-bottom: 8px;
    font-size: 13px;
  }

  label {
    display: grid;
    gap: 5px;
    margin-bottom: 10px;
  }

  label > span,
  .locked-list span {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    font-size: 12px;
  }

  input,
  select,
  textarea {
    min-width: 0;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    padding: 6px 8px;
    background: var(--windy-input-background, #10131a);
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  textarea {
    resize: vertical;
  }

  .checkbox-row {
    grid-template-columns: auto minmax(0, 1fr);
    align-items: center;
    justify-content: start;
  }

  .field-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px 12px;
  }

  .scroll-table {
    display: grid;
    gap: 6px;
  }

  .table-row {
    grid-template-columns: minmax(180px, 0.65fr) minmax(180px, 1fr);
    align-items: center;
    margin: 0;
  }

  .locked-list {
    display: grid;
    gap: 6px;
  }

  .locked-list div {
    display: grid;
    grid-template-columns: minmax(180px, 0.65fr) minmax(180px, 1fr);
    gap: 8px;
    align-items: center;
  }

  code {
    color: var(--windy-dialog-header-foreground, #f8fafc);
    overflow-wrap: anywhere;
  }

  .reset-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .safe-mode-box {
    margin-top: 16px;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    padding-top: 12px;
  }

  .safe-mode-box .note {
    margin: 8px 0;
  }

  .nested-confirm {
    position: fixed;
    inset: 0;
    z-index: 45;
    display: grid;
    place-items: center;
    padding: 20px;
    background: rgb(0 0 0 / 0.38);
  }

  .nested-confirm-dialog {
    width: min(420px, 100%);
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    padding: 14px;
    background: var(--windy-dialog-background, #171a20);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
  }

  .nested-confirm-dialog p {
    margin: 10px 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }

  .preferences-error {
    margin-bottom: 10px;
    padding: 8px 10px;
    border: 1px solid var(--windy-dialog-danger-foreground, #fca5a5);
    border-radius: 4px;
    color: var(--windy-dialog-danger-foreground, #fca5a5);
  }

  .color-workspace {
    min-height: 360px;
    display: grid;
    grid-template-columns: minmax(230px, 0.85fr) minmax(280px, 1.15fr);
    gap: 14px;
  }

  .color-list {
    min-height: 0;
    max-height: 460px;
    overflow: auto;
    border: 1px solid var(--windy-pane-border, #343b47);
    border-radius: 6px;
    padding: 8px;
    background: rgb(0 0 0 / 0.12);
  }

  .color-list-heading {
    padding: 6px 6px 8px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    font-size: 12px;
    font-weight: 700;
  }

  .extension-heading {
    margin-top: 12px;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    padding-top: 12px;
  }

  .color-row {
    width: 100%;
    display: grid;
    grid-template-columns: 26px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    min-height: 34px;
    margin-bottom: 4px;
    padding: 4px 8px;
    text-align: left;
  }

  .swatch {
    width: 20px;
    height: 20px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.12);
  }

  .color-editor {
    min-width: 0;
    display: grid;
    align-content: start;
    gap: 10px;
  }

  .selected-color-preview {
    height: 86px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.16);
  }

  .selected-color-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .selected-color-title span {
    min-width: 0;
    overflow-wrap: anywhere;
    font-weight: 700;
  }

  .picker-row {
    grid-template-columns: minmax(120px, 1fr) 72px;
    align-items: center;
  }

  .picker-row input[type="color"] {
    width: 72px;
    height: 38px;
    padding: 2px;
  }

  .preset-grid {
    display: grid;
    grid-template-columns: repeat(6, 34px);
    gap: 8px;
  }

  .preset-swatch {
    width: 34px;
    height: 34px;
    min-height: 34px;
    padding: 0;
    border-radius: 6px;
    box-shadow: inset 0 0 0 1px rgb(255 255 255 / 0.18);
  }

  .danger-button {
    color: var(--windy-dialog-danger-foreground, #fca5a5);
  }

  .extension-add {
    margin-top: 10px;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    padding-top: 12px;
  }

  @media (max-width: 760px) {
    .preferences-body {
      grid-template-columns: 1fr;
    }

    .preferences-nav {
      flex-direction: row;
      overflow-x: auto;
      border-right: 0;
      border-bottom: 1px solid var(--windy-pane-border, #343b47);
    }

    .field-grid,
    .color-workspace,
    .table-row,
    .locked-list div {
      grid-template-columns: 1fr;
    }

    .preset-grid {
      grid-template-columns: repeat(4, 34px);
    }
  }
</style>
