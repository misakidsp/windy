<script lang="ts">
  import type { OperationResultSnapshot } from "./types";

  export let snapshot: OperationResultSnapshot;
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class="confirm-dialog operation-result-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="operation-result-title"
    aria-describedby="operation-result-message"
  >
    <header class="confirm-dialog-header">
      <div id="operation-result-title">{snapshot.label} Failed</div>
      <div class="confirm-risk risk-danger">{snapshot.result.failed.length} failed</div>
    </header>
    <div id="operation-result-message" class="confirm-message">
      {snapshot.result.succeeded.length} succeeded / {snapshot.result.failed.length} failed
      {#if snapshot.logPath}
        <br />log: {snapshot.logPath}
      {/if}
    </div>
    <div class="operation-result confirm-result">
      {#each snapshot.result.failed.slice(0, 12) as item}
        <div class="result-failed" title={`${item.path || "-"}: ${item.message}`}>{item.path || "-"}: {item.message}</div>
      {/each}
      {#if snapshot.result.failed.length > 12}
        <div class="result-failed">...and {snapshot.result.failed.length - 12} more</div>
      {/if}
    </div>
    <div class="confirm-shortcuts">
      <span>Close: Enter</span>
      <span>Close: Esc</span>
      {#if snapshot.failedEntries.length}
        <span>Show: [ left / ] right</span>
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
    font-size: 12px;
  }

  .risk-danger,
  .result-failed {
    color: var(--windy-dialog-danger-foreground, #fca5a5);
  }

  .confirm-message {
    min-width: 0;
    padding: 10px 14px 0;
    overflow-wrap: anywhere;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    white-space: pre-wrap;
  }

  .operation-result {
    margin-top: 6px;
    padding: 10px 14px 0;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .result-failed {
    overflow: hidden;
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
