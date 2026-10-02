import { ShellQuoteError } from "../externalCommandModel";
import { invokeErrorMessage } from "../tauriInvoke";
import { operationResultItemMessage } from "../operationResultModel";
import type { SafeModeStatus, SftpConnectionTestResult } from "../types";
import type { WorkspaceState } from "./workspaceState.svelte";


export function createMessagesController(state: Pick<WorkspaceState, "settings">) {
  function localizedSftpConnectionMessage(result: SftpConnectionTestResult): string {
    return operationResultItemMessage({
      path: "",
      message: result.message,
      messageId: result.messageId,
      messageValues: result.messageValues,
    }, state.settings.t);
  }

  function localizedSafeModeMessage(status: SafeModeStatus): string {
    return operationResultItemMessage({
      path: "",
      message: status.message,
      messageId: status.messageId,
      messageValues: status.messageValues,
    }, state.settings.t);
  }

  function localizedBackendError(error: unknown): string {
    return operationResultItemMessage({ path: "", message: invokeErrorMessage(error) }, state.settings.t);
  }

  function localizedClipboardError(error: unknown): string {
    if (error instanceof ShellQuoteError) return localizedShellQuoteError(error);
    return state.settings.t("clipboard.copyFailedWithError", { error: invokeErrorMessage(error) });
  }

  function localizedShellQuoteError(error: ShellQuoteError): string {
    return error.code === "cmdUnsafePath"
      ? state.settings.t("shell.cmdUnsafePath", { path: error.value })
      : state.settings.t("shell.unknownShell");
  }

  return {
    localizedSftpConnectionMessage,
    localizedSafeModeMessage,
    localizedBackendError,
    localizedClipboardError,
    localizedShellQuoteError,
  };
}
