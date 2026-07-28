import type { ImageViewerState, TextViewerState, ViewerState } from "./types";

export type ViewerActionResult = {
  viewer: ViewerState | null;
  commandId?: string;
};

export function viewerPageSizeForElement(element: HTMLElement | null): number {
  return Math.max(1, Math.floor(((element?.clientHeight ?? 360) - 64) / 20));
}

function clampTopLine(viewer: TextViewerState, line: number, pageSize: number): number {
  const maxTopLine = Math.max(0, viewer.lines.length - pageSize);
  return Math.min(Math.max(line, 0), maxTopLine);
}

function scrollTextViewer(viewer: TextViewerState, delta: number, pageSize: number, commandId: string): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      topLine: clampTopLine(viewer, viewer.topLine + delta, pageSize),
    },
    commandId,
  };
}

function scrollTextViewerTo(viewer: TextViewerState, line: number, pageSize: number, commandId: string): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      topLine: clampTopLine(viewer, line, pageSize),
    },
    commandId,
  };
}

function enterTextViewerSearch(viewer: TextViewerState): ViewerActionResult {
  return {
    viewer: { ...viewer, searchMode: true, searchQuery: "", searchMessage: "/", searchMessageId: undefined, searchMessageValues: undefined },
    commandId: "viewer.searchPrompt",
  };
}

function updateTextViewerSearch(viewer: TextViewerState, key: string): ViewerActionResult {
  if (key === "Backspace") {
    const nextQuery = viewer.searchQuery.slice(0, -1);
    return { viewer: { ...viewer, searchQuery: nextQuery, searchMessage: `/${nextQuery}`, searchMessageId: undefined, searchMessageValues: undefined } };
  }
  if (key.length === 1) {
    const nextQuery = `${viewer.searchQuery}${key}`;
    return { viewer: { ...viewer, searchQuery: nextQuery, searchMessage: `/${nextQuery}`, searchMessageId: undefined, searchMessageValues: undefined } };
  }
  return { viewer };
}

function findTextViewerMatch(viewer: TextViewerState, query: string, direction: 1 | -1): ViewerActionResult {
  const notFoundMessage = {
    searchMessage: "",
    searchMessageId: "viewer.searchNotFound",
    searchMessageValues: { query },
  };
  const needle = query.toLowerCase();
  const lineCount = viewer.lines.length;
  if (lineCount === 0) {
    return {
      viewer: { ...viewer, searchMode: false, ...notFoundMessage },
      commandId: "viewer.searchNotFound",
    };
  }

  const start = Math.min(Math.max(viewer.topLine + direction, 0), lineCount - 1);
  let match: number | null = null;
  for (let step = 0; step < lineCount; step += 1) {
    const index = direction > 0 ? (start + step) % lineCount : (start - step + lineCount) % lineCount;
    if (viewer.lines[index].toLowerCase().includes(needle)) {
      match = index;
      break;
    }
  }

  if (match === null) {
    return {
      viewer: { ...viewer, searchMode: false, ...notFoundMessage },
      commandId: "viewer.searchNotFound",
    };
  }

  return {
    viewer: {
      ...viewer,
      topLine: match,
      searchMode: false,
      searchQuery: query,
      searchMessage: "",
      searchMessageId: "viewer.searchFound",
      searchMessageValues: { query },
    },
    commandId: direction > 0 ? "viewer.searchNext" : "viewer.searchPrevious",
  };
}

function commitTextViewerSearch(viewer: TextViewerState, direction: 1 | -1): ViewerActionResult {
  const query = viewer.searchQuery.trim();
  if (!query) {
    return {
      viewer: {
        ...viewer,
        searchMode: false,
        searchMessage: "",
        searchMessageId: "viewer.searchEmpty",
        searchMessageValues: undefined,
      },
    };
  }
  return findTextViewerMatch(viewer, query, direction);
}

function zoomImageViewer(viewer: ImageViewerState, multiplier: number): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      fitToWindow: false,
      zoom: Math.min(Math.max(viewer.zoom * multiplier, 0.1), 8),
    },
    commandId: multiplier > 1 ? "viewer.imageZoomIn" : "viewer.imageZoomOut",
  };
}

function setImageViewerFit(viewer: ImageViewerState): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      fitToWindow: true,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
    commandId: "viewer.imageFit",
  };
}

function setImageViewerActualSize(viewer: ImageViewerState): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      fitToWindow: false,
      zoom: 1,
      offsetX: 0,
      offsetY: 0,
    },
    commandId: "viewer.imageActualSize",
  };
}

function panImageViewer(viewer: ImageViewerState, deltaX: number, deltaY: number): ViewerActionResult {
  return {
    viewer: {
      ...viewer,
      fitToWindow: false,
      offsetX: viewer.offsetX + deltaX,
      offsetY: viewer.offsetY + deltaY,
    },
    commandId: "viewer.imagePan",
  };
}

export function recordImageNaturalSize(viewer: ViewerState | null, width: number, height: number): ViewerState | null {
  if (!viewer || viewer.kind !== "image") return viewer;
  return {
    ...viewer,
    naturalWidth: width,
    naturalHeight: height,
  };
}

export function handleViewerKey(viewer: ViewerState, key: string, pageSize: number): ViewerActionResult {
  if (viewer.kind === "image") {
    if (key === "Escape" || key === "q") return { viewer: null, commandId: "viewer.close" };
    if (key === "+" || key === "=") return zoomImageViewer(viewer, 1.25);
    if (key === "-") return zoomImageViewer(viewer, 0.8);
    if (key === "0") return setImageViewerFit(viewer);
    if (key === "1") return setImageViewerActualSize(viewer);
    if (key === "ArrowLeft" || key === "h") return panImageViewer(viewer, -48, 0);
    if (key === "ArrowRight" || key === "l") return panImageViewer(viewer, 48, 0);
    if (key === "ArrowUp" || key === "k") return panImageViewer(viewer, 0, -48);
    if (key === "ArrowDown" || key === "j") return panImageViewer(viewer, 0, 48);
    return { viewer };
  }

  if (viewer.searchMode) {
    if (key === "Escape") {
      return {
        viewer: {
          ...viewer,
          searchMode: false,
          searchMessage: "",
          searchMessageId: undefined,
          searchMessageValues: undefined,
        },
      };
    }
    if (key === "Enter") return commitTextViewerSearch(viewer, 1);
    return updateTextViewerSearch(viewer, key);
  }

  if (key === "Escape" || key === "q") return { viewer: null, commandId: "viewer.close" };
  if (key === "ArrowDown" || key === "j") return scrollTextViewer(viewer, 1, pageSize, "viewer.lineDown");
  if (key === "ArrowUp" || key === "k") return scrollTextViewer(viewer, -1, pageSize, "viewer.lineUp");
  if (key === "PageDown" || key === " ") return scrollTextViewer(viewer, pageSize, pageSize, "viewer.pageDown");
  if (key === "PageUp" || key === "b") return scrollTextViewer(viewer, -pageSize, pageSize, "viewer.pageUp");
  if (key === "g") return scrollTextViewerTo(viewer, 0, pageSize, "viewer.goTop");
  if (key === "G") return scrollTextViewerTo(viewer, viewer.lines.length - 1, pageSize, "viewer.goBottom");
  if (key === "/") return enterTextViewerSearch(viewer);
  if (key === "n") return findTextViewerMatch(viewer, viewer.searchQuery, 1);
  if (key === "N") return findTextViewerMatch(viewer, viewer.searchQuery, -1);
  return { viewer };
}
