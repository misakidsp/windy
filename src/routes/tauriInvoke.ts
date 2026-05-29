export type TauriInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export class WindyInvokeError extends Error {
  command: string;
  cause: unknown;

  constructor(command: string, cause: unknown) {
    super(invokeErrorMessage(cause));
    this.name = "WindyInvokeError";
    this.command = command;
    this.cause = cause;
  }
}

export function invokeErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

export function isWindyInvokeError(error: unknown): error is WindyInvokeError {
  return error instanceof WindyInvokeError;
}

export async function invokeCommand<T>(
  invoke: TauriInvoke,
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    throw new WindyInvokeError(command, error);
  }
}
