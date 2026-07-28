<script lang="ts">
  import type { FileOperationJob, FileOperationResult } from "./types";
  import type { Translate } from "./localization";
  import { operationResultItemMessage } from "./operationResultModel";

  export let job: FileOperationJob;
  export let result: FileOperationResult | null = null;
  export let running = false;
  export let cancelRequested = false;
  export let cancelConfirmOpen = false;
  export let doubleEscEnabled = true;
  export let nameInputElement: HTMLInputElement | null = null;
  export let executionMessage: string;
  export let targetSummary: string;
  export let showPaths = true;
  export let nameRequired = false;
  export let previewLimit = 0;
  export let conflictMessages: string[] = [];
  export let safetyMessages: string[] = [];
  export let onNameInput: (value: string) => void;
  export let t: Translate = (id, values) => {
    if (!values) return id;
    return id.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => (
      values[key] === undefined ? match : String(values[key])
    ));
  };

  function windowsAttributeChecked(attribute: "readonly" | "hidden"): boolean {
    return new RegExp(`\\b${attribute}=on\\b`).test(job.requestedName ?? "");
  }

  function updateWindowsAttribute(attribute: "readonly" | "hidden", enabled: boolean): void {
    const readonly = attribute === "readonly" ? enabled : windowsAttributeChecked("readonly");
    const hidden = attribute === "hidden" ? enabled : windowsAttributeChecked("hidden");
    onNameInput(`readonly=${readonly ? "on" : "off"} hidden=${hidden ? "on" : "off"}`);
  }

  function operationInputPlaceholder(): string {
    if (job.kind === "chmod") return t("operation.placeholder.mode");
    if (job.kind === "windowsAttributes") return t("operation.placeholder.windowsAttributes");
    return "";
  }
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class={`confirm-dialog risk-${job.risk}`}
    role="dialog"
    aria-modal="true"
    aria-labelledby="operation-confirm-title"
    aria-describedby="operation-confirm-message"
  >
    <header class="confirm-dialog-header">
      <div id="operation-confirm-title">{t("operation.confirmTitle", { label: job.label })}</div>
      <div class={`confirm-risk risk-${job.risk}`}>{job.risk}</div>
    </header>
    <div id="operation-confirm-message" class="confirm-message">
      {#if cancelConfirmOpen}
        {t("operation.cancelConfirm")}
      {:else}
        {executionMessage}
      {/if}
    </div>
    <div class="confirm-details">
      {#if showPaths}
        <div>{t("common.source")}: {job.sourcePath || "-"}</div>
        <div>{t("common.destination")}: {job.destinationPath || "-"}</div>
      {/if}
      <div>{t("common.targets")}: {targetSummary}</div>
    </div>
    {#if nameRequired && job.kind === "windowsAttributes"}
      <div class="windows-attribute-controls confirm-name">
        <span>{t("operation.field.attributes")}</span>
        <label>
          <input
            bind:this={nameInputElement}
            type="checkbox"
            checked={windowsAttributeChecked("readonly")}
            onchange={(event) => updateWindowsAttribute("readonly", event.currentTarget.checked)}
          />
          {t("operation.field.readonly")}
        </label>
        <label>
          <input
            type="checkbox"
            checked={windowsAttributeChecked("hidden")}
            onchange={(event) => updateWindowsAttribute("hidden", event.currentTarget.checked)}
          />
          {t("operation.field.hidden")}
        </label>
      </div>
    {:else if nameRequired}
      <label class="operation-name confirm-name">
        <span>{t(job.kind === "mkdir" ? "operation.field.directoryName" : job.kind === "createFile" ? "operation.field.fileName" : job.kind === "createArchive" ? "operation.field.archiveName" : job.kind === "chmod" ? "operation.field.mode" : job.kind === "windowsAttributes" ? "operation.field.attributes" : "operation.field.newName")}</span>
        <input
          bind:this={nameInputElement}
          value={job.requestedName ?? ""}
          placeholder={operationInputPlaceholder()}
          spellcheck="false"
          oninput={(event) => onNameInput(event.currentTarget.value)}
        />
      </label>
    {/if}
    {#if job.targets.length > 0}
      <div class="confirm-targets">
        {#each job.targets.slice(0, previewLimit) as target (target.key)}
          <div>{target.name}</div>
        {/each}
        {#if job.targets.length > previewLimit}
          <div>{t("common.andMore", { count: job.targets.length - previewLimit })}</div>
        {/if}
      </div>
    {/if}
    {#if conflictMessages.length > 0}
      <div class="operation-conflicts confirm-conflicts">
        {#each conflictMessages.slice(0, 3) as message}
          <div>{message}</div>
        {/each}
      </div>
    {/if}
    {#if safetyMessages.length > 0}
      <div class="operation-safety-report">
        <div class="operation-safety-title">{t("operation.undoCheck")}</div>
        {#each safetyMessages.slice(0, 5) as message}
          <div>{message}</div>
        {/each}
      </div>
    {/if}
    {#if result?.failed.length}
      <div class="operation-result confirm-result">
        {#each result.failed.slice(0, 3) as item}
          <div class="result-failed">{item.path || "-"}: {operationResultItemMessage(item, t)}</div>
        {/each}
      </div>
    {/if}
    <div class="confirm-shortcuts">
      {#if cancelConfirmOpen}
        <span>{t("operation.stopEnter")}{doubleEscEnabled ? " / Esc Esc" : ""}</span>
        <span>{t("operation.keepRunningEsc")}</span>
      {:else}
        <span>{running ? (cancelRequested ? t("operation.cancelRequested") : t("operation.executing")) : t("shortcut.okEnter")}</span>
        <span>{t("shortcut.cancelEsc")}</span>
      {/if}
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--windy-dialog-backdrop, rgb(0 0 0 / 0.58));
  }

  .confirm-dialog {
    width: min(680px, 100%);
    max-height: min(520px, calc(100vh - 48px));
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    background: var(--windy-dialog-background, #171a20);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .confirm-dialog.risk-danger {
    border-color: var(--windy-dialog-danger-border, #a94444);
  }

  .confirm-dialog.risk-warning {
    border-color: var(--windy-dialog-warning-border, #a9792b);
  }

  .confirm-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  .confirm-risk {
    color: var(--windy-dialog-accent, #86efac);
    font-size: 12px;
  }

  .confirm-risk.risk-warning {
    color: var(--windy-dialog-warning-foreground, #fbbf24);
  }

  .confirm-risk.risk-danger,
  .result-failed,
  .operation-conflicts {
    color: var(--windy-dialog-danger-foreground, #fca5a5);
  }

  .confirm-message,
  .confirm-details,
  .confirm-targets {
    min-width: 0;
    padding: 10px 14px 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .confirm-message {
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .confirm-details,
  .confirm-targets {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .confirm-details div,
  .confirm-targets div,
  .operation-conflicts div,
  .result-failed {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .operation-name {
    display: grid;
    grid-template-columns: 112px minmax(0, 320px);
    align-items: center;
    gap: 8px;
    margin-top: 6px;
    padding: 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .operation-name input {
    min-width: 0;
    height: 24px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    background: var(--windy-dialog-input-background, #1f242c);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font: inherit;
    user-select: text;
  }

  .windows-attribute-controls {
    display: grid;
    grid-template-columns: 112px max-content max-content;
    align-items: center;
    gap: 8px 24px;
    margin-top: 6px;
    padding: 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .windows-attribute-controls label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-height: 28px;
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .windows-attribute-controls input {
    width: 18px;
    height: 18px;
    accent-color: var(--windy-focus-border, #7dd3fc);
  }

  .operation-conflicts {
    max-height: 58px;
    margin: 6px 14px 0;
    overflow: hidden;
  }

  .operation-safety-report {
    margin: 8px 14px 0;
    padding: 8px 10px;
    border: 1px solid var(--windy-dialog-warning-border, #a9792b);
    border-radius: 4px;
    color: var(--windy-dialog-warning-foreground, #fbbf24);
    background: var(--windy-dialog-warning-background, rgb(169 121 43 / 0.12));
  }

  .operation-safety-report div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .operation-safety-title {
    margin-bottom: 4px;
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .operation-result {
    margin-top: 6px;
    padding: 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .confirm-shortcuts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 48px;
    padding: 16px 14px 14px;
    text-align: center;
  }

  .confirm-shortcuts span {
    min-width: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    overflow-wrap: anywhere;
  }
</style>
