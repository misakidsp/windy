<script lang="ts">
  import type { PaneDiffSnapshot } from "./diffModel";
  import type { Translate } from "./localization";

  export let snapshot: PaneDiffSnapshot;
  export let listElement: HTMLDivElement | null = null;
  export let t: Translate = (id, values) => {
    if (!values) return id;
    return id.replace(/\{([a-zA-Z0-9_.-]+)\}/g, (match, key) => (
      values[key] === undefined ? match : String(values[key])
    ));
  };

  $: changedCount =
    snapshot.counts.leftOnly +
    snapshot.counts.rightOnly +
    snapshot.counts.kindDifferent +
    snapshot.counts.sizeDifferent +
    snapshot.counts.modifiedDifferent +
    snapshot.counts.hashDifferent +
    snapshot.counts.readError;
</script>

<div class="dialog-backdrop" role="presentation">
  <div class="diff-dialog" role="dialog" aria-modal="true" aria-labelledby="diff-title">
    <header class="diff-header">
      <div id="diff-title">{snapshot.mode === "detailed" ? t("diff.detailedTitle") : t("diff.title")}</div>
      <div class="diff-summary">{t("diff.summary", { changed: changedCount, identical: snapshot.counts.identical })}</div>
    </header>

    <div class="diff-sources">
      <div title={snapshot.leftLabel}>{t("diff.left")}: {snapshot.leftLabel}</div>
      <div title={snapshot.rightLabel}>{t("diff.right")}: {snapshot.rightLabel}</div>
    </div>

    <div class="diff-counts">
      <span>{t("diff.leftOnly")}: {snapshot.counts.leftOnly}</span>
      <span>{t("diff.rightOnly")}: {snapshot.counts.rightOnly}</span>
      <span>{t("diff.kind")}: {snapshot.counts.kindDifferent}</span>
      <span>{t("diff.size")}: {snapshot.counts.sizeDifferent}</span>
      <span>{t("diff.modified")}: {snapshot.counts.modifiedDifferent}</span>
      <span>{t("diff.md5")}: {snapshot.counts.hashDifferent}</span>
      <span>{t("diff.readError")}: {snapshot.counts.readError}</span>
    </div>

    {#if snapshot.mode === "detailed"}
      <div class="diff-options">
        <span>{t("diff.recursive")}: {snapshot.recursive ? t("common.on") : t("common.off")}</span>
        <span>{t("diff.md5")}: {snapshot.hashFiles ? t("common.on") : t("common.off")}</span>
      </div>
    {/if}

    <div class="diff-list" aria-label={t("diff.entries")} bind:this={listElement}>
      {#each snapshot.entries.filter((entry) => entry.status !== "identical") as entry}
        <div class={`diff-row status-${entry.status}`} title={entry.relativePath}>
          <span>{t(`diff.status.${entry.status}`)}</span>
          <span>{entry.relativePath}</span>
        </div>
      {/each}
      {#if changedCount === 0}
        <div class="diff-empty">{t("diff.noDifferences")}</div>
      {/if}
    </div>

    <div class="diff-shortcuts">
      <span>{t("diff.scrollShortcut")}</span>
      <span>{t("shortcut.showLeftRight")}</span>
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

  .diff-dialog {
    display: grid;
    grid-template-rows: auto auto auto auto minmax(0, 1fr) auto;
    width: min(920px, 100%);
    max-height: min(720px, calc(100vh - 48px));
    overflow: hidden;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    background: var(--windy-dialog-background, #171a20);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  .diff-summary,
  .diff-sources,
  .diff-counts,
  .diff-more,
  .diff-empty {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .diff-sources {
    display: grid;
    gap: 4px;
    padding: 10px 14px 0;
  }

  .diff-sources div {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .diff-counts {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 10px 14px 0;
  }

  .diff-options {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding: 8px 14px 0;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .diff-list {
    margin: 12px 14px 0;
    overflow-x: hidden;
    overflow-y: auto;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
  }

  .diff-row {
    display: grid;
    grid-template-columns: 122px minmax(0, 1fr);
    gap: 12px;
    padding: 4px 0;
    border-bottom: 1px solid rgb(255 255 255 / 0.04);
  }

  .diff-row span:last-child {
    min-width: 0;
    overflow-wrap: anywhere;
    white-space: normal;
  }

  .status-leftOnly span:first-child {
    color: var(--windy-diff-left-foreground, #93c5fd);
  }

  .status-rightOnly span:first-child {
    color: var(--windy-diff-right-foreground, #86efac);
  }

  .status-sizeDifferent span:first-child,
  .status-modifiedDifferent span:first-child,
  .status-kindDifferent span:first-child,
  .status-hashDifferent span:first-child,
  .status-readError span:first-child {
    color: var(--windy-dialog-warning-foreground, #fbbf24);
  }

  .diff-more,
  .diff-empty {
    padding: 8px 0;
  }

  .diff-shortcuts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 48px;
    padding: 16px 14px 14px;
    text-align: center;
  }

  .diff-shortcuts span {
    min-width: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    overflow-wrap: anywhere;
  }
</style>
