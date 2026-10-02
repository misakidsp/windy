import type { ViewerState } from "../types";

export function createViewerState() {
  let viewer: ViewerState | null = $state.raw(null);
  let viewerElement: HTMLElement | null = $state.raw(null);
  let viewerPageSizeValue = $state.raw(1);

  return {
    get viewer() { return viewer; },
    set viewer(value: ViewerState | null) { viewer = value; },
    get viewerElement() { return viewerElement; },
    set viewerElement(value: HTMLElement | null) { viewerElement = value; },
    get viewerPageSizeValue() { return viewerPageSizeValue; },
    set viewerPageSizeValue(value) { viewerPageSizeValue = value; },
  };
}
