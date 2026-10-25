<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import type { Translate } from "./localization";
  import type { RecoveryRecord, RecoveryHistory } from "./types";
  export let t: Translate;
  export let onChanged: () => Promise<void> = async () => {};
  export let onRestore: (record: RecoveryRecord, direction: "undo" | "redo") => void;
  let records: RecoveryRecord[] = [];
  let issues: RecoveryHistory["issues"] = [];
  let error = "";
  let busy = false;
  let opened = false;
  let forgetId: string | null = null;
  function message(value: unknown) { const text = String(value); return text.startsWith("recovery.") ? t(text) : text; }
  async function refresh() {
    busy = true; error = ""; opened = true;
    try { const history = await invoke<RecoveryHistory>("recovery_history", { includeUsage: true }); records = history.records.reverse(); issues = history.issues; }
    catch (e) { error = message(e); }
    finally { busy = false; }
  }
  async function forget(id: string) {
    try { await invoke("recovery_forget", { id }); forgetId = null; await refresh(); await onChanged(); }
    catch (e) { error = message(e); }
  }
  async function openStorage(path: string) {
    try { await invoke("open_path", { path }); } catch (e) { error = message(e); }
  }
</script>
<div class="recovery-history">
  <button type="button" onclick={refresh} disabled={busy}>{t("recovery.manageHistory")}</button>
  {#if error}<p role="alert">{error}</p>{/if}
  {#if opened}
    {#each issues as issue}
      <p role="alert">{t("recovery.damagedHistory", { path: issue.path })}</p>
      <details><summary>{t("recovery.invalidRecord")}</summary><div class="path">{issue.detail}</div></details>
    {/each}
    <p>{t("recovery.historyCount", { count: records.length })}</p>
    {#each records as record (record.id)}
      <div class="record">
        <strong>{t(`activity.operation.${record.kind}`)}</strong>
        <span>{t("recovery.retainedBytes", { bytes: record.bytes.toLocaleString() })}</span>
        <span>{new Date(record.createdAt).toLocaleString()} · {t(`recovery.state.${record.state}`)}</span>
        {#if !record.items.length}{#each record.sources ?? [] as source}<div class="path">{source[0]}</div>{/each}{/if}
        {#each record.items as item}
          <div class="path">{item.beforePath ? `${item.beforePath} → ` : ""}{item.afterPath} · {t(`recovery.item.${item.state}`)}</div>
          {#if item.staging}<button type="button" onclick={() => openStorage(item.staging!)}>{t("recovery.openStorage")}</button>{/if}
        {/each}
        {#if ["applied", "undone", "partial", "retained"].includes(record.state)}
          {#if record.items.some(i => i.state === "applied")}<button type="button" onclick={() => onRestore(record, "undo")}>{t("recovery.undo")}</button>{/if}
          {#if record.items.some(i => i.state === "undone")}<button type="button" onclick={() => onRestore(record, "redo")}>{t("recovery.redo")}</button>{/if}
        {/if}
        {#if forgetId === record.id}
          <p>{t("recovery.forgetConfirm")}</p>
          <button type="button" onclick={() => forget(record.id)}>{t("dialog.ok")}</button>
          <button type="button" onclick={() => forgetId = null}>{t("dialog.cancel")}</button>
        {:else}<button type="button" onclick={() => forgetId = record.id}>{t("recovery.forget")}</button>{/if}
      </div>
    {/each}
  {/if}
</div>
<style>
  .record { border-top: 1px solid #64748b; padding: 0.6rem 0; display: flex; flex-wrap: wrap; gap: 0.4rem; }
  .path { width: 100%; overflow-wrap: anywhere; user-select: text; }
</style>
