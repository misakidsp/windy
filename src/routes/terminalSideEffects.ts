import { invokeCommand, type TauriInvoke } from "./tauriInvoke";

export type TerminalSize = {
  cols: number;
  rows: number;
};

export function resizeTerminal(invoke: TauriInvoke, size: TerminalSize): Promise<void> {
  return invokeCommand<void>(invoke, "resize_terminal", size);
}

export function startLocalTerminal(invoke: TauriInvoke, cwd: string, size: TerminalSize): Promise<number> {
  return invokeCommand<number>(invoke, "start_terminal", {
    cwd,
    ...size,
  });
}

export function startSftpTerminal(invoke: TauriInvoke, connectionId: string, size: TerminalSize): Promise<number> {
  return invokeCommand<number>(invoke, "start_sftp_ssh_terminal", {
    connectionId,
    ...size,
  });
}

export function stopTerminal(invoke: TauriInvoke): Promise<void> {
  return invokeCommand<void>(invoke, "stop_terminal");
}

export function writeTerminalInput(invoke: TauriInvoke, input: string): Promise<void> {
  return invokeCommand<void>(invoke, "write_terminal", { input });
}
