import type { LocationDialogMode } from "./types";
import type { KeyLike } from "./keyboardModel";

export type OperationFailureDialogKeyAction =
  | { type: "close" }
  | { type: "showSide"; side: "left" | "right" };
export type FilePropertiesDialogKeyAction = "close";
export type PaneDiffDialogKeyAction =
  | { type: "close" }
  | { type: "showSide"; side: "left" | "right" }
  | { type: "scroll"; amount: "lineUp" | "lineDown" | "pageUp" | "pageDown" | "top" | "bottom" };
export type ConfirmationDialogKeyAction = "cancel" | "confirm";
export type LargeSearchResultDialogKeyAction = "cancel" | "confirm";
export type ExternalCommandDialogKeyAction = "close" | "moveDown" | "moveUp" | "run";
export type SearchDialogKeyAction = "close" | "run";

export type LocationDialogKeyContext = {
  mode: LocationDialogMode;
  hasPendingDelete: boolean;
  hasPendingKnownHost: boolean;
  composing: boolean;
};

export type LocationDialogKeyAction =
  | { type: "escapeCancelDelete" }
  | { type: "escapeCancelKnownHost" }
  | { type: "backToManager" }
  | { type: "close" }
  | { type: "confirmDelete" }
  | { type: "chooseLocation" }
  | { type: "trustKnownHost" }
  | { type: "connect" }
  | { type: "saveProfile" }
  | { type: "moveCursor"; delta: -1 | 1 }
  | { type: "addCurrentSource" }
  | { type: "disconnectSession" }
  | { type: "deleteSaved" };

export function classifyOperationFailureDialogKey(event: KeyLike): OperationFailureDialogKeyAction | null {
  if (event.key === "Escape" || event.key === "Enter") return { type: "close" };
  if (event.key === "[") return { type: "showSide", side: "left" };
  if (event.key === "]") return { type: "showSide", side: "right" };
  return null;
}

export function classifyFilePropertiesDialogKey(event: KeyLike): FilePropertiesDialogKeyAction | null {
  return event.key === "Escape" || event.key === "Enter" ? "close" : null;
}

export function classifyPaneDiffDialogKey(event: KeyLike): PaneDiffDialogKeyAction | null {
  if (event.key === "Escape" || event.key === "Enter") return { type: "close" };
  if (event.key === "[") return { type: "showSide", side: "left" };
  if (event.key === "]") return { type: "showSide", side: "right" };
  if (event.key === "ArrowUp" || event.key === "k") return { type: "scroll", amount: "lineUp" };
  if (event.key === "ArrowDown" || event.key === "j") return { type: "scroll", amount: "lineDown" };
  if (event.key === "PageUp") return { type: "scroll", amount: "pageUp" };
  if (event.key === "PageDown" || event.key === " ") return { type: "scroll", amount: "pageDown" };
  if (event.key === "Home" || event.key === "g") return { type: "scroll", amount: "top" };
  if (event.key === "End" || event.key === "G") return { type: "scroll", amount: "bottom" };
  return null;
}

export function classifyConfirmationDialogKey(event: KeyLike): ConfirmationDialogKeyAction | null {
  if (event.key === "Escape") return "cancel";
  if (event.key === "Enter") return "confirm";
  return null;
}

export function classifyLargeSearchResultDialogKey(event: KeyLike): LargeSearchResultDialogKeyAction | null {
  if (event.key === "Escape") return "cancel";
  if (event.key === "Enter") return "confirm";
  return null;
}

export function classifyExternalCommandDialogKey(event: KeyLike): ExternalCommandDialogKeyAction | null {
  if (event.key === "Escape") return "close";
  if (event.key === "ArrowDown" || event.key === "j") return "moveDown";
  if (event.key === "ArrowUp" || event.key === "k") return "moveUp";
  if (event.key === "Enter") return "run";
  return null;
}

export function classifySearchDialogKey(event: KeyLike, composing: boolean): SearchDialogKeyAction | null {
  if (event.key === "Escape") return "close";
  if (event.key === "Enter" && !composing) return "run";
  return null;
}

export function classifyLocationDialogKey(
  event: KeyLike,
  context: LocationDialogKeyContext,
): LocationDialogKeyAction | null {
  if (event.key === "Escape") {
    if (context.hasPendingDelete) return { type: "escapeCancelDelete" };
    if (context.mode === "sftpForm") {
      return context.hasPendingKnownHost ? { type: "escapeCancelKnownHost" } : { type: "backToManager" };
    }
    return { type: "close" };
  }

  if (event.key === "Enter" && !context.composing) {
    if (context.mode === "manager" && context.hasPendingDelete) return { type: "confirmDelete" };
    if (context.mode === "manager") return { type: "chooseLocation" };
    if (context.hasPendingKnownHost) return { type: "trustKnownHost" };
    return { type: "connect" };
  }

  if (
    context.mode === "sftpForm" &&
    (event.metaKey || event.ctrlKey) &&
    (event.key.toLowerCase() === "s" || event.code === "KeyS")
  ) {
    return { type: "saveProfile" };
  }

  if (context.mode === "manager" && event.key === "ArrowDown") return { type: "moveCursor", delta: 1 };
  if (context.mode === "manager" && event.key === "ArrowUp") return { type: "moveCursor", delta: -1 };

  const noModifier = !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey;
  if (context.mode === "manager" && noModifier && (event.key.toLowerCase() === "a" || event.code === "KeyA")) {
    return { type: "addCurrentSource" };
  }
  if (context.mode === "manager" && noModifier && (event.key.toLowerCase() === "q" || event.code === "KeyQ")) {
    return { type: "disconnectSession" };
  }
  if (
    context.mode === "manager" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    (event.key.toLowerCase() === "d" || event.code === "KeyD" || event.key === "Delete")
  ) {
    return { type: "deleteSaved" };
  }

  return null;
}
