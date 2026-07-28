<script lang="ts">
  import { formatByteCount, formatDate } from "./displayModel";
  import type { Translate } from "./localization";
  import { formatPropertyBoolean, formatPropertyEntryKind, formatPropertyMode, formatPropertySourceKind, type FilePropertySnapshot } from "./propertyModel";
  import type { EntryKind } from "./types";

  export let snapshot: FilePropertySnapshot;
  export let t: Translate = (id, values) => {
    if (!values) return id;
    return id.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => (
      values[key] === undefined ? match : String(values[key])
    ));
  };

  $: primaryItem = snapshot.items[0];
  $: kindSummary = Object.entries(snapshot.kindCounts)
    .filter(([, count]) => count > 0)
    .map(([kind, count]) => `${formatPropertyEntryKind(kind as EntryKind, t)}: ${count}`)
    .join(" / ");
</script>

<div class="dialog-backdrop" role="presentation">
  <div class="property-dialog" role="dialog" aria-modal="true" aria-labelledby="property-title">
    <header class="property-header">
      <div id="property-title">{t("properties.title")}</div>
      <div class="property-source">{snapshot.sourceLabel}</div>
    </header>

    {#if snapshot.totalCount === 1 && primaryItem}
      <dl class="property-grid">
        <dt>{t("properties.name")}</dt>
        <dd title={primaryItem.name}>{primaryItem.name}</dd>
        <dt>{t("properties.path")}</dt>
        <dd title={primaryItem.path}>{primaryItem.path}</dd>
        <dt>{t("properties.source")}</dt>
        <dd>{formatPropertySourceKind(snapshot.sourceKind, t)}</dd>
        <dt>{t("properties.kind")}</dt>
        <dd>{formatPropertyEntryKind(primaryItem.kind, t)}</dd>
        <dt>{t("properties.size")}</dt>
        <dd>{primaryItem.kind === "directory" && primaryItem.size === null ? t("properties.directoryMarker") : formatByteCount(primaryItem.size) || t("properties.unknown")}</dd>
        <dt>{t("properties.modified")}</dt>
        <dd>{formatDate(primaryItem.modifiedAt) || "-"}</dd>
        <dt>{t("properties.hidden")}</dt>
        <dd>{formatPropertyBoolean(primaryItem.hidden, t)}</dd>
        <dt>{t("properties.readonly")}</dt>
        <dd>{formatPropertyBoolean(primaryItem.readonly, t)}</dd>
        <dt>{t("properties.mode")}</dt>
        <dd>{formatPropertyMode(primaryItem.mode)}</dd>
      </dl>
    {:else}
      <dl class="property-grid">
        <dt>{t("properties.items")}</dt>
        <dd>{snapshot.totalCount}</dd>
        <dt>{t("properties.source")}</dt>
        <dd>{formatPropertySourceKind(snapshot.sourceKind, t)}</dd>
        <dt>{t("properties.totalSize")}</dt>
        <dd>
          {formatByteCount(snapshot.knownSizeBytes)}
          {#if snapshot.unknownSizeCount > 0}
            <span class="muted"> / {t("properties.unknownCount", { count: snapshot.unknownSizeCount })}</span>
          {/if}
        </dd>
        <dt>{t("properties.kinds")}</dt>
        <dd>{kindSummary || "-"}</dd>
      </dl>

      <div class="property-list" aria-label={t("properties.selectedItems")}>
        {#each snapshot.items.slice(0, 10) as item}
          <div class="property-list-row" title={item.path}>
            <span>{item.name}</span>
            <span>{formatPropertyEntryKind(item.kind, t)}</span>
          </div>
        {/each}
        {#if snapshot.items.length > 10}
          <div class="property-more">{t("common.andMore", { count: snapshot.items.length - 10 })}</div>
        {/if}
      </div>
    {/if}

    <div class="property-shortcuts">
      <span>{t("shortcut.closeEnter")}</span>
      <span>{t("shortcut.closeEsc")}</span>
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
