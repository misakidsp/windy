<script lang="ts">
  import type { PendingLargeSearchResult } from "./types";

  export let pending: PendingLargeSearchResult;
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class="confirm-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="large-search-title"
    aria-describedby="large-search-message"
  >
    <header class="confirm-dialog-header">
      <div id="large-search-title">Large Search Result</div>
      <div class="confirm-risk risk-warning">warning</div>
    </header>
    <div id="large-search-message" class="confirm-message">
      Search found {pending.listing.entries.length} item(s). Displaying a large virtual source can still feel heavy on this machine.
    </div>
    <div class="confirm-shortcuts">
      <span>Display: Enter</span>
      <span>Cancel: Esc</span>
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

  .risk-warning {
    color: var(--windy-dialog-warning-foreground, #fbbf24);
  }

  .confirm-message {
    min-width: 0;
    padding: 10px 14px 0;
    overflow-wrap: anywhere;
    white-space: pre-wrap;
  }

  .confirm-message {
    color: var(--windy-dialog-header-foreground, #f8fafc);
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
