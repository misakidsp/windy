<script lang="ts">
  import type { AppearanceSettings, AppSettings, KeybindSettings, LanguagePresetInfo, LanguageSettings } from "./types";

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
    keys: keys.join(", "),
  }));
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
      keys: keys.join(", "),
    }));
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

  function splitKeys(value: string): string[] {
    return value
      .split(",")
      .map((key) => key.trim())
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
    await onSaveKeybindSettings({
      ...keybindSettings,
      bindings: Object.fromEntries(
        keybindingEntries.map((entry) => [entry.command, splitKeys(entry.keys)]),
      ),
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
        <div id="preferences-title" class="preferences-title">Preferences</div>
        <div class="preferences-subtitle">Windy settings</div>
      </div>
      <button type="button" class="icon-button" aria-label="Close preferences" onclick={onClose}>x</button>
    </header>

    <div class="preferences-body">
      <nav class="preferences-nav" aria-label="Preference sections">
        <button class:active={section === "general"} type="button" onclick={() => (section = "general")}>General</button>
        <button class:active={section === "keybindings"} type="button" onclick={() => (section = "keybindings")}>Keybindings</button>
        <button class:active={section === "appearance"} type="button" onclick={() => (section = "appearance")}>Appearance</button>
        <button class:active={section === "language"} type="button" onclick={() => (section = "language")}>Language</button>
        <button class:active={section === "reset"} type="button" onclick={() => (section = "reset")}>Reset</button>
      </nav>

      <section class="preferences-panel">
        {#if error}
          <div class="preferences-error">{error}</div>
        {/if}

        {#if section === "general"}
          <div class="section-heading">
            <h2>General</h2>
            <button type="button" onclick={saveGeneral} disabled={loading}>Save</button>
          </div>
          <label class="checkbox-row">
            <input type="checkbox" checked={useTrash} onchange={(event) => (useTrash = event.currentTarget.checked)} />
            <span>Use Trash for local delete</span>
          </label>
          <label>
            <span>Default text editor command</span>
            <input bind:value={editorCommand} placeholder="code, vim, notepad.exe" spellcheck="false" autocomplete="off" />
          </label>
          <label>
            <span>Editor arguments, one per line</span>
            <textarea bind:value={editorArgs} spellcheck="false" autocomplete="off" rows="5"></textarea>
          </label>
          <button type="button" class="secondary-button" onclick={onOpenConfigDirectory} disabled={loading}>
            Open Config Directory
          </button>
        {:else if section === "keybindings"}
          <div class="section-heading">
            <h2>Keybindings</h2>
            <button type="button" onclick={saveKeybindings} disabled={loading}>Save</button>
          </div>
          <div class="scroll-table">
            {#each keybindingEntries as entry, index (entry.command)}
              <label class="table-row">
                <span>{entry.command}</span>
                <input
                  value={entry.keys}
                  spellcheck="false"
                  autocomplete="off"
                  oninput={(event) => (keybindingEntries[index].keys = event.currentTarget.value)}
                />
              </label>
            {/each}
          </div>
          <h3>Locked Bindings</h3>
          <div class="locked-list">
            {#each Object.entries(keybindSettings.lockedBindings) as [command, keys]}
              <div><span>{command}</span><code>{keys.join(", ")}</code></div>
            {/each}
          </div>
        {:else if section === "appearance"}
          <div class="section-heading">
            <h2>Appearance</h2>
            <button type="button" onclick={saveAppearance} disabled={loading}>Save</button>
          </div>
          <div class="field-grid">
            <label><span>UI font</span><input bind:value={uiFamily} spellcheck="false" autocomplete="off" /></label>
            <label><span>Terminal font</span><input bind:value={terminalFamily} spellcheck="false" autocomplete="off" /></label>
            <label><span>UI size</span><input bind:value={uiSize} inputmode="numeric" /></label>
            <label><span>Terminal size</span><input bind:value={terminalSize} inputmode="numeric" /></label>
            <label><span>Viewer size</span><input bind:value={viewerSize} inputmode="numeric" /></label>
            <label><span>File row height</span><input bind:value={fileRowHeight} inputmode="numeric" /></label>
          </div>
          <h3>Colors</h3>
          <div class="color-workspace">
            <div class="color-list" aria-label="Color settings">
              <div class="color-list-heading">Interface</div>
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
              <div class="color-list-heading extension-heading">Extensions</div>
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
                  <span>Color picker</span>
                  <input
                    type="color"
                    value={colorInputValue(selectedColorEntry.value)}
                    oninput={(event) => updateActiveColor(event.currentTarget.value)}
                  />
                </label>
                <label>
                  <span>Hex value</span>
                  <input
                    value={selectedColorEntry.value}
                    spellcheck="false"
                    autocomplete="off"
                    oninput={(event) => updateActiveColor(event.currentTarget.value)}
                  />
                </label>
                <div class="preset-grid" aria-label="Preset colors">
                  {#each presetColors as color}
                    <button
                      type="button"
                      class="preset-swatch"
                      style={`background: ${color}`}
                      aria-label={`Set ${color}`}
                      title={color}
                      onclick={() => updateActiveColor(color)}
                    ></button>
                  {/each}
                </div>
                {#if activeColorScope === "extensionColors"}
                  <button type="button" class="secondary-button danger-button" onclick={removeActiveExtensionColor}>
                    Remove Extension Color
                  </button>
                {/if}
              {:else}
                <div class="note">Select a color item from the list.</div>
              {/if}

              <div class="extension-add">
                <h3>Add Extension Color</h3>
                <label>
                  <span>Extension</span>
                  <input bind:value={newExtensionKey} placeholder="md" spellcheck="false" autocomplete="off" />
                </label>
                <label class="picker-row">
                  <span>Color</span>
                  <input type="color" bind:value={newExtensionColor} />
                </label>
                <button type="button" onclick={addExtensionColor}>Add or Update</button>
              </div>
            </div>
          </div>
        {:else if section === "language"}
          <div class="section-heading">
            <h2>Language File</h2>
            <button type="button" onclick={() => onApplyLanguagePreset(languageLocale)} disabled={loading}>Apply</button>
          </div>
          <label>
            <span>Preset</span>
            <select bind:value={languageLocale}>
              {#each languagePresets as preset}
                <option value={preset.locale}>{preset.name}</option>
              {/each}
            </select>
          </label>
          <div class="note">Current locale: {languageSettings.locale}</div>
          <div class="note">Language files currently cover extracted message strings only.</div>
        {:else}
          <div class="section-heading">
            <h2>Reset</h2>
          </div>
          <div class="reset-actions">
            <button type="button" onclick={() => (pendingReset = "app")} disabled={loading}>Reset General</button>
            <button type="button" onclick={() => (pendingReset = "keybind")} disabled={loading}>Reset Keybindings</button>
            <button type="button" onclick={() => (pendingReset = "appearance")} disabled={loading}>Reset Appearance</button>
            <button type="button" onclick={() => (pendingReset = "language")} disabled={loading}>Reset Language</button>
          </div>
          <div class="note">Reset backs up current config files, then writes defaults for the selected area.</div>
          <div class="safe-mode-box">
            <h3>Safe Mode</h3>
            <div class="note">
              Safe Mode backs up current config files and reloads defaults for General, Appearance,
              Keybindings, and Language.
            </div>
            <button type="button" class="danger-button" onclick={() => (safeModeConfirmOpen = true)} disabled={loading}>
              Enter Safe Mode
            </button>
          </div>
        {/if}
      </section>
    </div>

    <footer class="preferences-footer">
      <span>{loading ? "Working..." : "Esc closes preferences"}</span>
      <button type="button" onclick={onClose}>Close</button>
    </footer>
  </div>

  {#if pendingReset}
    <div class="nested-confirm" role="dialog" aria-modal="true" aria-labelledby="reset-confirm-title">
      <div class="nested-confirm-dialog">
        <h2 id="reset-confirm-title">Reset Settings</h2>
        <p>Back up current config files and reset this setting group to defaults?</p>
        <div class="confirm-actions">
          <button type="button" onclick={() => (pendingReset = null)}>Cancel</button>
          <button type="button" class="danger-button" onclick={confirmReset} disabled={loading}>Reset</button>
        </div>
      </div>
    </div>
  {/if}

  {#if safeModeConfirmOpen}
    <div class="nested-confirm" role="dialog" aria-modal="true" aria-labelledby="safe-mode-confirm-title">
      <div class="nested-confirm-dialog">
        <h2 id="safe-mode-confirm-title">Enter Safe Mode</h2>
        <p>Back up current config files and reload default settings now?</p>
        <div class="confirm-actions">
          <button type="button" onclick={() => (safeModeConfirmOpen = false)}>Cancel</button>
          <button type="button" class="danger-button" onclick={confirmSafeMode} disabled={loading}>Enter Safe Mode</button>
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
