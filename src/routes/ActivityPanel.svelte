<script lang="ts">
  import { tick } from "svelte";
  import { activityRunning, type ActivityRecord } from "./activityModel";
  import type { Translate } from "./localization";
  let { records, selectedId, followLatest, listElement = $bindable(null), t }: {
    records: ActivityRecord[]; selectedId: string | null; followLatest: boolean;
    listElement?: HTMLElement | null; t: Translate;
  } = $props();
  $effect(() => {
    records;
    if (followLatest) void tick().then(() => {
      if (listElement && followLatest) listElement.scrollTop = listElement.scrollHeight;
    });
  });
</script>

<div class="activity-list" bind:this={listElement} role="listbox" aria-label={t("activity.title")}>
  {#if records.length === 0}<div class="empty">{t("activity.empty")}</div>{/if}
  {#each records as record (record.id)}
    <div class="activity-row" class:selected={selectedId === record.id} class:attention={record.status === "failed" || record.status === "warning"} role="option" aria-selected={selectedId === record.id}>
      <div class="heading"><span>{t(`activity.${record.status}`)}</span><strong>{t(record.label.id, record.label.values)}</strong><span>{record.unread ? t("activity.unread") : ""}</span></div>
      <div>{t(record.message.id, record.message.values)}</div>
      {#if activityRunning(record) && record.progress}
        <div>{t(`activity.phase.${record.progress.phase}`)} · {record.progress.total === null ? t("activity.scanned", { count: record.progress.items }) : t("activity.items", { current: record.progress.items, total: record.progress.total })} · {t("activity.bytes", { count: record.progress.bytes })}</div>
        <div class="path" title={record.progress.current}>{record.progress.current}</div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .activity-list { height: 100%; overflow: auto; color: var(--windy-terminal-foreground, #ddd); font-size: var(--windy-ui-font-size, 12px); }
  .activity-row { padding: 5px 10px; min-height: 48px; border-bottom: 1px solid var(--windy-pane-border, #343b47); }
  .heading { display: flex; gap: 14px; }
  .selected { background: var(--windy-entry-cursor-background, #374151); }
  .attention .heading { color: var(--windy-dialog-warning-foreground, #fbbf24); }
  .path { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .empty { padding: 10px; }
</style>
