import assert from "node:assert/strict";
import { activityCounts, retainActivities } from "../src/routes/activityModel";
import { createWorkspace } from "../src/routes/workspace/createWorkspace";
import { defaultMessages } from "../src/routes/localization";
import { activityCommandIds } from "../src/routes/activityKeys";

const { state, actions } = createWorkspace();
const key = (key: string) => ({ key, altKey: true, ctrlKey: false, shiftKey: false, metaKey: false, preventDefault() {} }) as KeyboardEvent;
state.terminal.consoleVisible = false;
const first = state.activity.begin({ id: "activity.operation.copy" });
assert.equal(state.activity.view, "activity");
assert.equal(state.terminal.consoleVisible, true);
assert.equal(state.terminal.consoleFocused, false);
state.activity.progress({ jobId: first, phase: "processing", current: "/file", total: 2, items: 1, bytes: 50 });
assert.equal(state.activity.records[0].progress?.bytes, 50);
state.activity.canceling(first);
assert.equal(state.activity.records[0].status, "canceling");
state.activity.resume(first);
assert.equal(state.activity.records[0].status, "running");
state.activity.finish(first, "warning", { id: "activity.operationResult", values: { succeeded: 1, failed: 1 } });
state.activity.canceling(first);
state.activity.progress({ jobId: first, phase: "processing", current: "/late", total: 2, items: 2, bytes: 100 });
assert.equal(state.activity.records[0].status, "warning", "late cancellation cannot overwrite completion");
assert.equal(state.activity.records[0].progress?.bytes, 50, "late progress cannot overwrite completion");
assert.deepEqual(activityCounts(state.activity.records), { running: 0, attention: 1, unread: 1 });

await actions.handleActivityKey(key("ArrowUp"));
assert.equal(state.activity.followLatest, false);
assert.equal(state.activity.records[0].unread, false);
const second = state.activity.begin({ id: "diff.detailedTitle" });
assert.equal(state.activity.selectedId, first, "new tasks preserve history selection");
state.activity.finish(second, "completed", { id: "diff.detailedStatusSummary", values: { changed: 3, identical: 2 } });
assert.equal(state.activity.selectedId, first, "completion preserves history selection");
await actions.handleActivityKey(key("End"));
assert.equal(state.activity.selectedId, second);
assert.equal(state.activity.followLatest, true);
assert.deepEqual(activityCounts(state.activity.records), { running: 0, attention: 0, unread: 0 });

await actions.handleActivityKey({ ...key("†"), code: "KeyT" } as KeyboardEvent);
assert.equal(state.activity.view, "terminal");
assert.equal(state.terminal.consoleFocused, false, "display toggle does not move focus");
state.terminal.consoleFocused = true;
state.app.notify("preferences.statusGeneralSaved");
assert.equal(state.activity.view, "terminal", "notifications never replace the focused console");
assert.equal(await actions.handleActivityKey(key("t")), false, "no activity shortcut while terminal focused");
state.terminal.consoleFocused = false;
state.settings.appSettings = { ...state.settings.appSettings, operationResult: { ...state.settings.appSettings.operationResult, notificationDisplay: "status" } };
state.terminal.consoleVisible = false;
state.app.notify("clipboard.pathsCopied", { count: 2 });
assert.equal(state.activity.view, "terminal");
assert.equal(state.terminal.consoleVisible, false, "status mode leaves lower region visibility alone");
const saved = state.activity.records.at(-1)!;
state.settings.languageSettings = { schemaVersion: 1, locale: "ja", messages: { "clipboard.pathsCopied": "コピー {count} 件" } };
assert.equal(state.settings.t(saved.message.id, saved.message.values), "コピー 2 件", "history translates at display time");
assert.equal(state.app.statusMessage, "コピー 2 件", "status translates at display time");
await actions.handleActivityKey(key("Enter"));
assert.equal(state.activity.detailsId, saved.id);

const running = state.activity.begin({ id: "activity.search", values: { path: "/" } });
for (let i = 0; i < 205; i++) state.activity.notify({ id: "activity.completed" });
assert.equal(state.activity.records.length, 200);
assert.ok(state.activity.records.some(record => record.id === running), "history pruning retains active jobs");
assert.ok(retainActivities(state.activity.records, 1).some(record => record.id === running));
for (const command of activityCommandIds) assert.ok(defaultMessages[`keyHelp.command.${command}`]);
for (const record of state.activity.records) {
  assert.ok(defaultMessages[record.label.id]);
  assert.ok(defaultMessages[record.message.id]);
}
