<script lang="ts">
  import type { ExternalCommandDefinition, PaneSourceKind } from "./types";

  export let commands: ExternalCommandDefinition[] = [];
  export let loading = false;
  export let error = "";
  export let cursorIndex = 0;
  export let sourceKind: PaneSourceKind;
  export let targetCount = 0;
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class="confirm-dialog command-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="command-dialog-title"
    aria-describedby="command-dialog-message"
  >
    <header class="confirm-dialog-header">
      <div id="command-dialog-title">External Commands</div>
      <div class="confirm-risk">phase 7-c</div>
    </header>
    <div id="command-dialog-message" class="confirm-message">
      Choose a registered command to run with the active local selection.
    </div>
    {#if error}
      <div class="operation-result confirm-result">
        <div class="result-failed">-: {error}</div>
      </div>
    {/if}
    <div class="command-options" role="listbox" aria-label="External commands">
      {#if loading}
        <div class="command-option cursor" role="option" aria-selected="true">
          <span>Loading...</span>
          <span>Reading commands.json</span>
        </div>
      {:else if commands.length === 0}
        <div class="command-option cursor" role="option" aria-selected="true">
          <span>No commands</span>
          <span>commands.json did not contain runnable entries</span>
        </div>
      {:else}
        {#each commands as command, index (command.id)}
          <div
            class:cursor={cursorIndex === index}
            class="command-option"
            role="option"
            aria-selected={cursorIndex === index}
          >
            <span>{command.name}</span>
            <span>{command.description || command.template}</span>
          </div>
        {/each}
      {/if}
    </div>
    <div class="confirm-details">
      <div>source: {sourceKind}</div>
      <div>targets: {targetCount}</div>
      <div>config: commands.json</div>
    </div>
    <div class="confirm-shortcuts">
      <span>Run: Enter</span>
      <span>Move: Up/Down</span>
      <span>Close: Esc</span>
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

  .confirm-message,
  .confirm-details {
    min-width: 0;
    padding: 10px 14px 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .confirm-message {
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .confirm-details {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .confirm-details div {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .command-options {
    display: grid;
    gap: 6px;
    padding: 10px 14px 0;
  }

  .command-option {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 30px;
    border: 1px solid var(--windy-dialog-item-border, #303946);
    border-radius: 4px;
    background: var(--windy-dialog-item-background, #171c24);
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .command-option.cursor {
    border-color: var(--windy-dialog-accent, #93c5fd);
    background: var(--windy-dialog-item-active-background, #243142);
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .command-option span:last-child {
    overflow: hidden;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .operation-result {
    margin-top: 6px;
    padding: 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .result-failed {
    overflow: hidden;
    color: var(--windy-dialog-danger-foreground, #fca5a5);
    white-space: nowrap;
    text-overflow: ellipsis;
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
