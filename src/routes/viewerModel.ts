import { translateMessage, type Translate } from "./localization";
import type { ImageViewerState } from "./types";

const fallbackTranslate: Translate = (id, values) => translateMessage(undefined, id, values);

export function imageViewerTransform(viewer: ImageViewerState): string {
  return `translate(-50%, -50%) translate(${viewer.offsetX}px, ${viewer.offsetY}px) scale(${viewer.zoom})`;
}

export function imageViewerStatus(viewer: ImageViewerState, t: Translate = fallbackTranslate): string {
  const dimensions =
    viewer.naturalWidth && viewer.naturalHeight ? `${viewer.naturalWidth}x${viewer.naturalHeight}` : t("viewer.loading");
  const mode = viewer.fitToWindow ? t("viewer.fit") : `${Math.round(viewer.zoom * 100)}%`;
  return `${dimensions} · ${mode}`;
}
