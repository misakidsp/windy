<script lang="ts">
  import type { ActivityRecord } from "./activityModel";
  import type { Translate } from "./localization";
  import { operationResultItemMessage } from "./operationResultModel";
  export let record: ActivityRecord;
  export let t: Translate;
  export let element: HTMLElement | null = null;
</script>
<div class="backdrop" role="presentation">
  <div class="details" role="dialog" aria-modal="true" aria-label={t("activity.details")}>
    <h2>{t(record.label.id, record.label.values)}</h2>
    <p>{t(`activity.${record.status}`)} · {t(record.message.id, record.message.values)}</p>
    {#if record.result?.kind === "operation"}
      <div class="results" bind:this={element}>
        {#if record.result.snapshot.logPath}<p>{t("common.log")}: {record.result.snapshot.logPath}</p>{/if}
        {#each record.result.result.failed as item}<p>{t("activity.failed")}: {item.path} — {operationResultItemMessage(item, t)}</p>{/each}
        {#each record.result.result.succeeded as item}<p>{t("activity.completed")}: {item.path} — {operationResultItemMessage(item, t)}</p>{/each}
      </div>
    {/if}
    <footer>{t("activity.scrollDetails")} · {#if record.result?.kind === "operation" && record.result.snapshot.failedEntries.length}{t("shortcut.showLeftRight")} · {/if}{t("shortcut.closeEnter")} · {t("shortcut.closeEsc")}</footer>
  </div>
</div>
<style>
  .backdrop { position: fixed; inset: 0; z-index: 30; display: grid; place-items: center; background: var(--windy-dialog-backdrop, #0008); }
  .details { width: min(900px, 90vw); max-height: 85vh; padding: 16px; display: flex; flex-direction: column; border: 1px solid var(--windy-pane-border, #555); background: var(--windy-dialog-background, #171a20); color: var(--windy-dialog-foreground, #ddd); }
  h2 { font-size: 14px; }
  .results { overflow: auto; }
  p { overflow-wrap: anywhere; }
  footer { padding-top: 12px; }
</style>
