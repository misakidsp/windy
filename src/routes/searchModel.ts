import { parentDirectoryFromArchivePath } from "./pathUtils";
import { translateMessage, type Translate } from "./localization";
import type {
  PaneState,
  SearchDialogForm,
  SearchDirectoryRequest,
  SearchPaneSource,
  SearchProfile,
} from "./types";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

export function createEmptySearchForm(): SearchDialogForm {
  return {
    rootPath: "",
    nameRegex: "",
    recursive: false,
    minSizeBytes: "",
    maxSizeBytes: "",
    modifiedAfter: "",
    modifiedBefore: "",
    kind: "all",
    hiddenMode: "exclude",
    readonlyMode: "any",
  };
}

export function searchReturnPathForPane(pane: PaneState, fallbackPath: string): string {
  if (pane.source.kind === "search") return pane.source.returnPath;
  if (pane.source.kind === "local") return pane.currentPath;
  if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
  if (pane.source.kind === "sftp") return pane.source.returnPath;
  if (pane.source.kind === "diff") return pane.source.returnPath;
  if (pane.source.kind === "operationResult") return pane.source.returnPath;
  if (pane.source.kind === "gitStatus") return pane.source.returnPath || pane.source.rootPath;
  return fallbackPath;
}

export function searchRootPathForPane(pane: PaneState): string | null {
  if (pane.source.kind === "sftp") return null;
  if (pane.source.kind === "search") return pane.source.rootPath;
  if (pane.source.kind === "diff") return pane.source.returnPath || pane.source.basePath;
  if (pane.source.kind === "operationResult") return pane.source.returnPath;
  if (pane.source.kind === "gitStatus") return pane.source.rootPath;
  if (pane.source.kind === "archive") return parentDirectoryFromArchivePath(pane.source.archivePath);
  return pane.currentPath;
}

export function searchRequestFromSource(source: SearchPaneSource): SearchDirectoryRequest {
  return {
    rootPath: source.rootPath,
    nameRegex: source.nameRegex,
    recursive: source.recursive,
    minSizeBytes: source.minSizeBytes,
    maxSizeBytes: source.maxSizeBytes,
    modifiedAfter: source.modifiedAfter,
    modifiedBefore: source.modifiedBefore,
    kind: source.searchKind,
    hiddenMode: source.hiddenMode,
    readonlyMode: source.readonlyMode,
  };
}

export function searchRequestFromProfile(profile: SearchProfile): SearchDirectoryRequest {
  return {
    rootPath: profile.rootPath,
    nameRegex: profile.nameRegex,
    recursive: profile.recursive,
    minSizeBytes: profile.minSizeBytes,
    maxSizeBytes: profile.maxSizeBytes,
    modifiedAfter: profile.modifiedAfter,
    modifiedBefore: profile.modifiedBefore,
    kind: profile.kind ?? "all",
    hiddenMode: profile.hiddenMode ?? "exclude",
    readonlyMode: profile.readonlyMode ?? "any",
  };
}

export function searchFormFromRequest(request: SearchDirectoryRequest): SearchDialogForm {
  return {
    rootPath: request.rootPath,
    nameRegex: request.nameRegex,
    recursive: request.recursive,
    minSizeBytes: request.minSizeBytes === null || request.minSizeBytes === undefined ? "" : String(request.minSizeBytes),
    maxSizeBytes: request.maxSizeBytes === null || request.maxSizeBytes === undefined ? "" : String(request.maxSizeBytes),
    modifiedAfter: timestampToDateInput(request.modifiedAfter ?? null),
    modifiedBefore: timestampToDateInput(request.modifiedBefore ?? null),
    kind: request.kind,
    hiddenMode: request.hiddenMode,
    readonlyMode: request.readonlyMode,
  };
}

export function searchRequestFromForm(form: SearchDialogForm, t: Translate = fallbackTranslate): SearchDirectoryRequest {
  const minSizeLabel = t("search.field.minSize");
  const maxSizeLabel = t("search.field.maxSize");
  const modifiedAfterLabel = t("search.field.modifiedAfter");
  const modifiedBeforeLabel = t("search.field.modifiedBefore");
  const minSizeBytes = parseOptionalSizeBytes(minSizeLabel, form.minSizeBytes, t);
  const maxSizeBytes = parseOptionalSizeBytes(maxSizeLabel, form.maxSizeBytes, t);
  if (minSizeBytes !== null && maxSizeBytes !== null && minSizeBytes > maxSizeBytes) {
    throw new Error(t("search.error.sizeRange"));
  }

  const modifiedAfter = parseOptionalDate(modifiedAfterLabel, form.modifiedAfter, false, t);
  const modifiedBefore = parseOptionalDate(modifiedBeforeLabel, form.modifiedBefore, true, t);
  if (modifiedAfter !== null && modifiedBefore !== null && modifiedAfter > modifiedBefore) {
    throw new Error(t("search.error.dateRange"));
  }

  return {
    rootPath: form.rootPath.trim(),
    nameRegex: form.nameRegex.trim(),
    recursive: form.recursive,
    minSizeBytes,
    maxSizeBytes,
    modifiedAfter,
    modifiedBefore,
    kind: form.kind,
    hiddenMode: form.hiddenMode,
    readonlyMode: form.readonlyMode,
  };
}

export function searchProfileNameFromSource(source: SearchPaneSource, t: Translate = fallbackTranslate): string {
  const rootName = localNameFromPath(source.rootPath, t);
  const query = source.nameRegex || "*";
  return `${rootName} ${query}`;
}

export function searchProfileMatchesSource(profile: SearchProfile, source: SearchPaneSource): boolean {
  return (
    profile.rootPath === source.rootPath &&
    profile.nameRegex === source.nameRegex &&
    profile.recursive === source.recursive &&
    profile.minSizeBytes === source.minSizeBytes &&
    profile.maxSizeBytes === source.maxSizeBytes &&
    profile.modifiedAfter === source.modifiedAfter &&
    profile.modifiedBefore === source.modifiedBefore &&
    (profile.kind ?? "all") === source.searchKind &&
    (profile.hiddenMode ?? "exclude") === source.hiddenMode &&
    (profile.readonlyMode ?? "any") === source.readonlyMode
  );
}

export function parseOptionalSizeBytes(label: string, value: string, t: Translate = fallbackTranslate): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^(\d+)([kmgtKMGT]?)$/);
  if (!match) {
    throw new Error(t("search.error.nonNegativeSize", { label }));
  }
  const valuePart = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multiplier =
    unit === "t"
      ? 1024 ** 4
      : unit === "g"
        ? 1024 ** 3
        : unit === "m"
          ? 1024 ** 2
          : unit === "k"
            ? 1024
            : 1;
  const parsed = valuePart * multiplier;
  if (!Number.isSafeInteger(parsed)) {
    throw new Error(t("search.error.sizeTooLarge", { label }));
  }
  return parsed;
}

export function parseOptionalDate(label: string, value: string, endOfDay: boolean, t: Translate = fallbackTranslate): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{8}$/.test(trimmed)) {
    throw new Error(t("search.error.dateFormat", { label }));
  }
  const normalized = `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`;
  const suffix = endOfDay ? "T23:59:59" : "T00:00:00";
  const date = new Date(`${normalized}${suffix}`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(t("search.error.dateInvalid", { label }));
  }
  const seconds = Math.floor(date.getTime() / 1000);
  if (seconds < 0) {
    throw new Error(t("search.error.dateTooEarly", { label }));
  }
  return seconds;
}

function timestampToDateInput(value: number | null): string {
  if (value === null) return "";
  const date = new Date(value * 1000);
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function localNameFromPath(path: string, t: Translate = fallbackTranslate): string {
  const normalized = path.replace(/[/\\]+$/, "");
  if (!normalized || normalized === "/") return t("search.rootLabel");
  return normalized.split(/[/\\]/).filter(Boolean).at(-1) ?? normalized;
}
