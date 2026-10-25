import assert from "node:assert/strict";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { createWorkspace } from "../src/routes/workspace/createWorkspace";
import type { FileOperationJob, PendingKnownHost } from "../src/routes/types";

const saved = new Map<string, PropertyDescriptor | undefined>();
for (const [name, value] of Object.entries({
  window: Object.assign(new EventTarget(), { crypto: globalThis.crypto }),
  HTMLElement: class {},
  document: { documentElement: { style: { setProperty() {} } } },
})) {
  saved.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
}
try {
  const { state, actions } = createWorkspace();
  const calls: { command: string; args: Record<string, unknown> }[] = [];
  let cancelStatus = "accepted";
  mockIPC((command, payload) => {
    const args = payload as Record<string, unknown>;
    calls.push({ command, args });
    if (command === "cancel_file_operation_job") return cancelStatus;
    if (command === "cancel_sftp_host_key_confirmation") return;
    if (command === "test_sftp_connection") {
      const request = args.request as { hostKeyApproval: PendingKnownHost | null };
      if (request.hostKeyApproval) throw "SSH host key approval is stale or does not match this connection. Connect again to confirm the current key.";
      throw "WINDY_UNKNOWN_HOST_KEY\texample.test\t22\tSHA256:A\tconfirmation-1\t/fixture/known_hosts";
    }
    throw new Error(`Unexpected safety test command: ${command}`);
  });
  const job: FileOperationJob = {
    id: "job-safety", kind: "copy", commandId: "file.copy", label: "Copy", status: "running", risk: "safe",
    sourcePaneId: "left", destinationPaneId: "right", sourcePath: "/fixture/source", destinationPath: "/fixture/dest",
    targets: [], plannedActions: [], confirmationMessage: "Copy", requestedName: null, executable: true, createdAt: "test",
  };
  for (const kind of ["delete", "trash", "move", "rename", "chmod", "windowsAttributes", "mkdir", "createFile"] as const) {
    state.operations.operationRunning = true;
    state.operations.operationJob = { ...job, kind };
    await actions.cancelOperationConfirmation();
    await actions.confirmOperationCancel();
    assert.equal(state.operations.operationCancelConfirmOpen, false, kind);
    assert.equal(state.operations.operationCancelRequested, false, kind);
    assert.equal(state.operations.operationJob.status, "running", kind);
    assert.match(state.app.statusMessage, /does not support cancellation/);
  }
  assert.equal(calls.length, 0, "unsupported operations never reach cancel API");
  for (const status of ["accepted", "unsupported", "notRunning"]) {
    cancelStatus = status;
    state.operations.operationJob = { ...job };
    state.operations.operationCancelRequested = false;
    await actions.cancelOperationConfirmation();
    assert.equal(state.operations.operationCancelConfirmOpen, true);
    await actions.confirmOperationCancel();
    assert.equal(state.operations.operationCancelConfirmOpen, false);
    assert.equal(state.operations.operationCancelRequested, status === "accepted");
    assert.equal(state.operations.operationJob.status, status === "accepted" ? "cancelRequested" : "running");
    if (status !== "accepted") assert.doesNotMatch(state.app.statusMessage, /Cancel requested/);
  }
  state.operations.operationRunning = false;
  state.operations.operationJob = null;
  state.locations.sftpForm = {
    profileId: null, name: "test", host: "example.test", port: "22", username: "fixture", authKind: "password",
    password: "dummy", privateKeyPath: "", passphrase: "", remotePath: "/", saveProfile: false,
  };
  await actions.testSftpConnectionFromDialog();
  assert.equal(state.locations.pendingKnownHost?.fingerprint, "SHA256:A");
  assert.equal(state.locations.pendingKnownHost?.token, "confirmation-1");
  await actions.runLocationDialogKeyAction({ type: "trustKnownHost" });
  const request = calls.filter(call => call.command === "test_sftp_connection").at(-1)?.args.request as Record<string, unknown>;
  assert.deepEqual(request.hostKeyApproval, { host: "example.test", port: 22, fingerprint: "SHA256:A", token: "confirmation-1" });
  assert.equal(Object.hasOwn(request, "trustHostKey"), false);
  assert.equal(state.locations.pendingKnownHost, null, "rejected retry cannot reuse approval");
  assert.equal(state.locations.sftpForm.password, "", "failed connection clears credentials");
  assert.match(state.locations.sftpConnectionError, /Connect again/);
  state.locations.sftpForm = { ...state.locations.sftpForm, password: "dummy" };
  await actions.testSftpConnectionFromDialog();
  await actions.runLocationDialogKeyAction({ type: "escapeCancelKnownHost" });
  assert.equal(state.locations.pendingKnownHost, null);
  assert.deepEqual(calls.at(-1), { command: "cancel_sftp_host_key_confirmation", args: { token: "confirmation-1" } });
} finally {
  clearMocks();
  for (const [name, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
}
