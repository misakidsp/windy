import type { Translate } from "../localization";
import type { ActivityMessage, ActivityStatus } from "../activityModel";
import type { createActivityState } from "./activityState.svelte";
import type { PrefixKey } from "../types";

export function createAppState(translate: () => Translate, activity: ReturnType<typeof createActivityState>) {
  let keyHelpVisible = $state.raw(false);
  let lastCommandId = $state.raw("app.start");
  let lastKey = $state.raw("");
  let statusMessage = $state.raw("");
  let statusNotice: ActivityMessage | null = $state.raw({ id: "status.ready" });
  let prefixMode: PrefixKey | null = $state.raw(null);
  let appShellElement: HTMLElement | null = $state.raw(null);
  let imeComposing = $state.raw(false);

  return {
    get keyHelpVisible() { return keyHelpVisible; },
    set keyHelpVisible(value) { keyHelpVisible = value; },
    get lastCommandId() { return lastCommandId; },
    set lastCommandId(value) { lastCommandId = value; },
    get lastKey() { return lastKey; },
    set lastKey(value) { lastKey = value; },
    get statusMessage() { return statusNotice ? translate()(statusNotice.id, statusNotice.values) : statusMessage; },
    set statusMessage(value: string) { statusNotice = null; statusMessage = value; },
    notify(id: string, values?: Record<string, string | number>, status: ActivityStatus = "completed", record = true) {
      statusNotice = { id, values };
      if (record) activity.notify(statusNotice, status);
    },
    get prefixMode() { return prefixMode; },
    set prefixMode(value: PrefixKey | null) { prefixMode = value; },
    get appShellElement() { return appShellElement; },
    set appShellElement(value: HTMLElement | null) { appShellElement = value; },
    get imeComposing() { return imeComposing; },
    set imeComposing(value) { imeComposing = value; },
  };
}
