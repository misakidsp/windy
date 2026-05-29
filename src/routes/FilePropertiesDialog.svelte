<script lang="ts">
  import { formatByteCount, formatDate } from "./displayModel";
  import { formatPropertyBoolean, formatPropertyMode, type FilePropertySnapshot } from "./propertyModel";

  export let snapshot: FilePropertySnapshot;

  $: primaryItem = snapshot.items[0];
  $: kindSummary = Object.entries(snapshot.kindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${kind}: ${count}`)
    .join(" / ");
</script>

<div class="dialog-backdrop" role="presentation">
  <div class="property-dialog" role="dialog" aria-modal="true" aria-labelledby="property-title">
    <header class="property-header">
      <div id="property-title">Properties</div>
      <div class="property-source">{snapshot.sourceLabel}</div>
    </header>

    {#if snapshot.totalCount === 1 && primaryItem}
      <dl class="property-grid">
        <dt>Name</dt>
        <dd title={primaryItem.name}>{primaryItem.name}</dd>
        <dt>Path</dt>
        <dd title={primaryItem.path}>{primaryItem.path}</dd>
        <dt>Source</dt>
        <dd>{snapshot.sourceKind}</dd>
        <dt>Kind</dt>
        <dd>{primaryItem.kind}</dd>
        <dt>Size</dt>
        <dd>{primaryItem.kind === "directory" && primaryItem.size === null ? "<DIR>" : formatByteCount(primaryItem.size) || "unknown"}</dd>
        <dt>Modified</dt>
        <dd>{formatDate(primaryItem.modifiedAt) || "-"}</dd>
        <dt>Hidden</dt>
        <dd>{formatPropertyBoolean(primaryItem.hidden)}</dd>
        <dt>Readonly</dt>
        <dd>{formatPropertyBoolean(primaryItem.readonly)}</dd>
        <dt>Mode</dt>
        <dd>{formatPropertyMode(primaryItem.mode)}</dd>
      </dl>
    {:else}
      <dl class="property-grid">
        <dt>Items</dt>
        <dd>{snapshot.totalCount}</dd>
        <dt>Source</dt>
        <dd>{snapshot.sourceKind}</dd>
        <dt>Total size</dt>
        <dd>
          {formatByteCount(snapshot.knownSizeBytes)}
          {#if snapshot.unknownSizeCount > 0}
            <span class="muted"> / {snapshot.unknownSizeCount} unknown</span>
          {/if}
        </dd>
        <dt>Kinds</dt>
        <dd>{kindSummary || "-"}</dd>
      </dl>

      <div class="property-list" aria-label="Selected items">
        {#each snapshot.items.slice(0, 10) as item}
          <div class="property-list-row" title={item.path}>
            <span>{item.name}</span>
            <span>{item.kind}</span>
          </div>
        {/each}
        {#if snapshot.items.length > 10}
          <div class="property-more">...and {snapshot.items.length - 10} more</div>
        {/if}
      </div>
    {/if}

    <div class="property-shortcuts">
      <span>Close: Enter</span>
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

  .property-dialog {
    width: min(720px, 100%);
    max-height: min(560px, calc(100vh - 48px));
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    background: var(--windy-dialog-background, #171a20);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .property-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  .property-source {
    min-width: 0;
    overflow: hidden;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    font-size: 12px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .property-grid {
    display: grid;
    grid-template-columns: minmax(92px, max-content) minmax(0, 1fr);
    gap: 8px 16px;
    margin: 0;
    padding: 14px;
  }

  .property-grid dt {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .property-grid dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .muted,
  .property-more {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .property-list {
    margin: 0 14px;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
  }

  .property-list-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    gap: 16px;
    padding: 4px 0;
    border-bottom: 1px solid rgb(255 255 255 / 0.04);
  }

  .property-list-row span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .property-more {
    padding: 6px 0;
  }

  .property-shortcuts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 48px;
    padding: 16px 14px 14px;
    text-align: center;
  }

  .property-shortcuts span {
    min-width: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    overflow-wrap: anywhere;
  }
</style>
