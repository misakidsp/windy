import { activityRunning, retainActivities, type ActivityMessage, type ActivityProgress, type ActivityRecord, type ActivityResult, type ActivityStatus } from "../activityModel";

export function createActivityState() {
  let records: ActivityRecord[] = $state.raw([]);
  let view: "terminal" | "activity" = $state.raw("terminal");
  let selectedId: string | null = $state.raw(null);
  let followLatest = $state.raw(true);
  let listElement: HTMLElement | null = $state.raw(null);
  let detailsElement: HTMLElement | null = $state.raw(null);
  let detailsId: string | null = $state.raw(null);
  let reveal: () => void = () => {};

  function patch(id: string, update: Partial<ActivityRecord>) {
    records = records.map(record => record.id === id ? { ...record, ...update } : record);
  }
  function begin(label: ActivityMessage, id: string = crypto.randomUUID()) {
    if (records.some(record => record.id === id)) id = crypto.randomUUID();
    records = retainActivities([...records, { id, label, message: { id: "activity.running" }, status: "running", startedAt: Date.now(), unread: false }]);
    if (detailsId && !records.some(record => record.id === detailsId)) detailsId = null;
    if (followLatest || !records.some(record => record.id === selectedId)) selectedId = id;
    reveal();
    return id;
  }
  function finish(id: string, status: ActivityStatus, message: ActivityMessage, result?: ActivityResult) {
    const record = records.find(record => record.id === id);
    if (!record || !activityRunning(record)) return;
    patch(id, { status, message, result, finishedAt: Date.now(), unread: true });
  }
  function notify(message: ActivityMessage, status: ActivityStatus = "completed") {
    const id = begin(message);
    finish(id, status, message);
  }
  return {
    get records() { return records; },
    get view() { return view; }, set view(value) { view = value; },
    get selectedId() { return selectedId; }, set selectedId(value: string | null) { selectedId = value; },
    get followLatest() { return followLatest; }, set followLatest(value) { followLatest = value; },
    get listElement() { return listElement; }, set listElement(value: HTMLElement | null) { listElement = value; },
    get detailsElement() { return detailsElement; }, set detailsElement(value: HTMLElement | null) { detailsElement = value; },
    get detailsId() { return detailsId; }, set detailsId(value: string | null) { detailsId = value; },
    configureReveal(callback: () => void) { reveal = callback; },
    begin, finish, notify,
    acknowledge(id: string) { patch(id, { unread: false }); },
    canceling(id: string) { if (records.some(record => record.id === id && activityRunning(record))) patch(id, { status: "canceling", message: { id: "activity.canceling" } }); },
    resume(id: string) { if (records.some(record => record.id === id && record.status === "canceling")) patch(id, { status: "running", message: { id: "activity.running" } }); },
    progress(progress: ActivityProgress) {
      if (records.some(record => record.id === progress.jobId && activityRunning(record))) patch(progress.jobId, { progress });
    },
  };
}
