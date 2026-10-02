import { tick } from "svelte";
import { commandMatchesSingleKey } from "../keyboardModel";
import type { WorkspaceState } from "./workspaceState.svelte";
import type { WorkspaceActions } from "./workspaceActions";

import { activityCommandIds } from "../activityKeys";

export function createActivityController(state: WorkspaceState, actions: Pick<WorkspaceActions, "applySearchListing">) {
  function showActivity() {
    state.activity.view = "activity";
    state.terminal.consoleVisible = true;
  }
  async function handleActivityKey(event: KeyboardEvent): Promise<boolean> {
    if (state.terminal.consoleFocused) return false;
    // macOS Option+letter can report a composed character (e.g. Option+T = †).
    // Keep explicit character bindings first, then match the physical letter.
    const physicalKey = event.altKey && /^Key[A-Z]$/.test(event.code ?? "")
      ? { key: event.code.slice(3).toLowerCase(), code: event.code, altKey: event.altKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey }
      : null;
    const command = activityCommandIds.find(id => commandMatchesSingleKey(state.settings.keybindSettings, id, event))
      ?? (physicalKey ? activityCommandIds.find(id => commandMatchesSingleKey(state.settings.keybindSettings, id, physicalKey)) : undefined);
    if (!command) return false;
    event.preventDefault();
    if (command === "activity.toggle") {
      state.terminal.consoleVisible = true;
      state.activity.view = state.activity.view === "activity" ? "terminal" : "activity";
      await tick();
      if (state.activity.view === "terminal") state.terminal.terminalFit?.fit();
      else if (state.activity.followLatest && state.activity.listElement) state.activity.listElement.scrollTop = state.activity.listElement.scrollHeight;
      return true;
    }
    showActivity();
    if (command === "activity.details") {
      const record = state.activity.records.find(record => record.id === state.activity.selectedId);
      if (record) {
        state.activity.acknowledge(record.id);
        if (record.result?.kind === "diff") state.inspection.paneDiffDialog = record.result.snapshot;
        else if (record.result?.kind === "search") {
          const result = record.result;
          actions.applySearchListing(result.paneId, result.listing, result.request, result.returnPath);
        } else state.activity.detailsId = record.id;
      }
      return true;
    }
    const records = state.activity.records;
    const index = Math.max(0, records.findIndex(record => record.id === state.activity.selectedId));
    const page = Math.max(1, Math.floor((state.activity.listElement?.clientHeight ?? 200) / 48));
    const delta = command === "activity.previous" ? -1 : command === "activity.next" ? 1 : command === "activity.pageUp" ? -page : page;
    const next = command === "activity.latest" ? records.length - 1 : Math.max(0, Math.min(records.length - 1, index + delta));
    state.activity.followLatest = command === "activity.latest";
    state.activity.selectedId = records[next]?.id ?? null;
    if (state.activity.selectedId) state.activity.acknowledge(state.activity.selectedId);
    await tick();
    state.activity.listElement?.querySelector<HTMLElement>("[aria-selected=true]")?.scrollIntoView({ block: "nearest" });
    return true;
  }
  return { handleActivityKey };
}
