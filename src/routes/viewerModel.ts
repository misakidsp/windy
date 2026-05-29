import type { ImageViewerState } from "./types";

export function imageViewerTransform(viewer: ImageViewerState): string {
  return `translate(-50%, -50%) translate(${viewer.offsetX}px, ${viewer.offsetY}px) scale(${viewer.zoom})`;
}

export function imageViewerStatus(viewer: ImageViewerState): string {
  const dimensions =
    viewer.naturalWidth && viewer.naturalHeight ? `${viewer.naturalWidth}x${viewer.naturalHeight}` : "loading";
  const mode = viewer.fitToWindow ? "fit" : `${Math.round(viewer.zoom * 100)}%`;
  return `${dimensions} · ${mode}`;
}
