import type { TauriInvoke } from "../src/routes/tauriInvoke";

export type InvokeCall = {
  command: string;
  args?: Record<string, unknown>;
};

type InvokeMockHandler = (
  command: string,
  args?: Record<string, unknown>,
) => unknown | Promise<unknown>;

export function createTauriInvokeMock(
  calls: InvokeCall[],
  handler: InvokeMockHandler,
): TauriInvoke {
  return async <T>(command: string, args?: Record<string, unknown>): Promise<T> => {
    calls.push({ command, args });
    return (await handler(command, args)) as T;
  };
}
