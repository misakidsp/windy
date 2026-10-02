// Run npm run test:browser to open this harness.
// This mounts the real page and Svelte runtime; every backend command is mocked.
import { mount, tick, unmount } from "svelte";
import { mockIPC } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import Page from "../src/routes/+page.svelte";
import { createWorkspaceState } from "../src/routes/workspace/workspaceState.svelte";

const output = document.querySelector<HTMLOutputElement>("#result")!;
const errors: string[] = [];
window.addEventListener("error", event => errors.push(event.message));
window.addEventListener("unhandledrejection", event => errors.push(String(event.reason)));
const defaults = createWorkspaceState();
let operationId = "";
let finishDiff: (result: unknown) => void = () => {};
let finishOperation: (result: unknown) => void = () => {};
const entries = Array.from({ length: 100 }, (_, i) => ({
  key: `/demo/file-${String(i).padStart(3, "0")}.txt`,
  path: `/demo/file-${String(i).padStart(3, "0")}.txt`,
  name: `file-${String(i).padStart(3, "0")}.txt`,
  kind: "file", size: i, modifiedAt: null, hidden: false, readonly: false, mode: null,
}));
mockIPC((command, payload) => {
  const args = payload as Record<string, unknown>;
  switch (command) {
    case "compare_local_directories_detailed": return new Promise(resolve => { finishDiff = resolve; });
    case "execute_file_operation_job":
      operationId = (args.job as { id: string }).id;
      return new Promise(resolve => { finishOperation = resolve; });
    case "save_app_settings": return args.settings;
    case "start_terminal": return 1;
    case "resize_terminal":
    case "write_terminal": return;
    case "get_app_settings": return defaults.settings.appSettings;
    case "get_appearance_settings": return defaults.settings.appearanceSettings;
    case "get_keybind_settings": return defaults.settings.keybindSettings;
    case "get_language_settings": return defaults.settings.languageSettings;
    case "get_safe_mode_status": return { active: false, backupPaths: [], message: "" };
    case "get_terminal_shell_kind": return "posix";
    case "home_directory": return "/demo";
    case "list_local_roots": return ["/"];
    case "list_directory": return { path: args.path, entries };
    case "list_language_presets":
    case "list_local_favorite_profiles":
    case "list_search_profiles":
    case "list_sftp_connection_profiles":
    case "list_active_sftp_sessions": return [];
    case "read_text_file": return { path: args.path, content: Array.from({ length: 500 }, (_, i) => `Line ${i + 1}`).join("\n"), encoding: "utf-8", truncated: false };
    case "stop_terminal": return;
    default: throw new Error(`Unexpected backend command: ${command}`);
  }
}, { shouldMockEvents: true });

async function settle() {
  await tick();
  await new Promise(resolve => setTimeout(resolve, 100));
  await tick();
}
async function key(key: string, modifiers: KeyboardEventInit = {}) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...modifiers }));
  await settle();
}
const checks: string[] = [];
function check(condition: unknown, label: string) {
  if (!condition) throw new Error(label);
  checks.push(label);
}

let app: ReturnType<typeof mount> | undefined;
try {
  app = mount(Page, { target: document.querySelector("#app")! });
  await settle();
  check(document.querySelectorAll(".file-pane").length === 2, "two panes mount");
  check(document.querySelectorAll(".file-pane.active .file-row").length > 1, "directory load renders");
  await key("ArrowDown");
  check(document.querySelector(".file-pane.active .cursor .name")?.textContent === "file-001.txt", "cursor updates rendered rows");
  await key("Tab");
  check(document.querySelectorAll(".file-pane")[1].classList.contains("active"), "active pane updates");
  await key("/");
  const filter = document.querySelector<HTMLInputElement>(".filter-input")!;
  check(document.activeElement === filter, "quick filter receives focus");
  filter.value = "file-099";
  filter.dispatchEvent(new Event("input", { bubbles: true }));
  await settle();
  check(document.querySelectorAll(".file-pane.active .file-row").length === 1, "filter updates rendered rows");
  filter.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  await settle();
  await key("Escape");
  await key("Enter");
  check(document.querySelector(".viewer-content"), "viewer opens from pane keyboard");
  const initialLines = document.querySelectorAll(".viewer-line").length;
  await key("PageDown");
  check(Number(document.querySelector(".viewer-line-number")?.textContent) === initialLines + 1, "viewer paging matches rendered rows");
  document.documentElement.style.setProperty("--windy-viewer-font-size", "24px");
  await settle();
  const largeLines = document.querySelectorAll(".viewer-line").length;
  check(largeLines < initialLines, "font change recalculates page size");
  const beforeResize = largeLines;
  const surface = document.querySelector<HTMLElement>(".viewer-surface")!;
  surface.style.bottom = "200px";
  await settle();
  check(document.querySelectorAll(".viewer-line").length < beforeResize, "viewport resize recalculates page size");
  const lastLine = document.querySelector(".viewer-line:last-child")!.getBoundingClientRect();
  check(lastLine.bottom <= document.querySelector(".viewer-status")!.getBoundingClientRect().top, "text stays above status bar");
  await key("Escape");
  check(!document.querySelector(".viewer-surface"), "viewer closes");
  await emit("preferences-open");
  await settle();
  check(document.querySelector("[role=dialog]"), "backend preferences event opens dialog");
  await key("Escape");
  check(!document.querySelector("[role=dialog]"), "preferences escape closes dialog");
  const terminalElement = document.querySelector(".console-output");
  async function rename() {
    await key("r");
    const input = document.querySelector<HTMLInputElement>(".operation-name input")!;
    input.value = "renamed.txt";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await key("Enter");
  }
  await rename();
  check(!!operationId, "file operation starts");
  check(!document.querySelector("[role=dialog]"), "running operation uses activity instead of modal");
  check(document.querySelector(".activity-list")?.closest(".content")?.classList.contains("hidden") === false, "pane task automatically reveals activity");
  check(document.activeElement?.classList.contains("app-shell"), "operation starts with pane focus");
  await emit("activity-progress", { jobId: operationId, phase: "processing", current: "/demo/file.txt", items: 1, total: 3, bytes: 1024 });
  await settle();
  check(document.querySelector(".activity-list")?.textContent?.includes("1/3"), "backend progress renders in activity");
  check(document.querySelector(".activity-summary")?.textContent?.includes("1/3"), "status bar renders compact progress");
  finishOperation({ succeeded: [{ path: "/demo/file.txt", message: "Renamed" }], failed: [] });
  await settle();
  check(!document.querySelector("[role=dialog]"), "completion does not force result dialog");
  await key("Enter", { altKey: true });
  check(document.querySelector(".details")?.textContent?.includes("Renamed"), "selected activity opens result details");
  await key("Escape");
  await key("t", { altKey: true });
  check(document.querySelector(".console-output") === terminalElement, "display switches preserve terminal element");
  check(document.querySelector(".console-output")?.closest(".content")?.classList.contains("hidden") === false, "pane shortcut switches display without focus");
  await key("t", { altKey: true });
  for (let i = 0; i < 12; i++) { await rename(); finishOperation({ succeeded: [], failed: [] }); await settle(); }
  await key("PageUp", { altKey: true });
  const list = document.querySelector<HTMLElement>(".activity-list")!;
  const scrollTop = list.scrollTop;
  await rename();
  finishOperation({ succeeded: [], failed: [] });
  await settle();
  check(Math.abs(list.scrollTop - scrollTop) < 1, "new result preserves history scroll position");
  await key("End", { altKey: true });
  check(list.scrollTop > scrollTop, "latest shortcut resumes following history");
  await emit("preferences-open");
  await settle();
  const select = [...document.querySelectorAll<HTMLSelectElement>("select")].find(select => select.querySelector('option[value="status"]'))!;
  select.value = "status";
  select.dispatchEvent(new Event("change", { bubbles: true }));
  document.querySelector<HTMLButtonElement>(".section-heading button")!.click();
  await settle();
  await key("Escape");
  await key("t", { altKey: true });
  await rename();
  check(document.querySelector(".console-output")?.closest(".content")?.classList.contains("hidden") === false, "saved compact setting prevents automatic activity display");
  finishOperation({ succeeded: [], failed: [] });
  await settle();
  await key(",");
  await key("c");
  await key("x");
  check(document.querySelector(".console-output")?.closest(".content")?.classList.contains("hidden") === false, "console focus automatically restores terminal");
  check(!!document.querySelector(".xterm"), "terminal stays mounted");
  const terminalFocus = document.activeElement;
  finishDiff({ leftPath: "/demo", rightPath: "/demo", recursive: true, hashFiles: true, entries: [], counts: { leftOnly: 0, rightOnly: 0, kindDifferent: 0, sizeDifferent: 0, modifiedDifferent: 0, hashDifferent: 0, readError: 0, identical: 0 } });
  await settle();
  check(document.activeElement === terminalFocus, "background completion keeps terminal focus");
  check(!document.querySelector("[role=dialog]"), "background diff completion does not open a modal");
  await unmount(app);
  app = undefined;
  await settle();
  app = mount(Page, { target: document.querySelector("#app")! });
  await settle();
  await key("ArrowDown");
  check(document.querySelector(".file-pane.active .cursor .name")?.textContent === "file-001.txt", "remount has isolated state and one keyboard listener");
  check(errors.length === 0, `no runtime errors: ${errors.join("; ")}`);
  output.textContent = `PASS: ${checks.length} workspace browser checks`;
  output.style.background = "#164e35";
} catch (error) {
  output.textContent = `FAIL after ${checks.length} checks: ${error}\n${errors.join("\n")}`;
  output.style.background = "#7f1d1d";
  console.error(error);
}
