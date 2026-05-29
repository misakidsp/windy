<script lang="ts">
  import type { ViewerState } from "./types";
  import { imageViewerStatus, imageViewerTransform } from "./viewerModel";

  export let viewer: ViewerState;
  export let surface: HTMLElement | null = null;
  export let pageSize: number;
  export let onImageLoad: (event: Event) => void;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<section
  bind:this={surface}
  class={`viewer-surface viewer-${viewer.kind}`}
  role="application"
  tabindex="0"
  aria-label={`Internal ${viewer.kind} viewer: ${viewer.title}`}
>
  {#if viewer.kind === "text"}
    <div class="viewer-content">
      {#each viewer.lines.slice(viewer.topLine, viewer.topLine + pageSize) as line, index}
        <div class="viewer-line">
          <span class="viewer-line-number">{viewer.topLine + index + 1}</span>
          <span class="viewer-line-text">{line || " "}</span>
        </div>
      {/each}
    </div>
    <footer class="viewer-status">
      <span>
        {viewer.topLine + 1}/{Math.max(viewer.lines.length, 1)} ·
        {viewer.encoding}
        {viewer.truncated ? " truncated" : ""}
      </span>
      <span>{viewer.searchMode ? viewer.searchMessage : viewer.searchMessage || "j/k, Space/b, g/G, /, n/N, q"}</span>
    </footer>
  {:else}
    <div class:fit={viewer.fitToWindow} class="image-viewer-content">
      <img
        src={viewer.src}
        alt={viewer.title}
        class="image-viewer-image"
        style={viewer.fitToWindow ? "" : `transform: ${imageViewerTransform(viewer)}`}
        onload={onImageLoad}
      />
    </div>
    <footer class="viewer-status">
      <span>{imageViewerStatus(viewer)}</span>
      <span>+/- zoom, 0 fit, 1 actual, h/j/k/l pan, q</span>
    </footer>
  {/if}
</section>

<style>
  .viewer-surface {
    position: fixed;
    inset: 0;
    z-index: 15;
    display: grid;
    grid-template-rows: minmax(0, 1fr) 26px;
    background: var(--windy-viewer-background, #111318);
    color: var(--windy-viewer-foreground, #d8dee9);
    outline: none;
  }

  .viewer-content {
    min-height: 0;
    overflow: hidden;
    padding: 4px 0;
    line-height: 20px;
    font-size: var(--windy-viewer-font-size, 12px);
  }

  .image-viewer-content {
    position: relative;
    box-sizing: border-box;
    min-height: 0;
    overflow: hidden;
    background: var(--windy-viewer-background, #0b0d11);
  }

  .image-viewer-content.fit {
    padding: 12px;
  }

  .image-viewer-image {
    position: absolute;
    top: 50%;
    left: 50%;
    display: block;
    max-width: none;
    max-height: none;
    transform-origin: center center;
    image-rendering: auto;
  }

  .image-viewer-content.fit .image-viewer-image {
    width: calc(100% - 24px);
    height: calc(100% - 24px);
    object-fit: contain;
    object-position: center center;
    transform: translate(-50%, -50%);
  }

  .viewer-line {
    display: grid;
    grid-template-columns: 64px minmax(0, 1fr);
    min-width: 0;
    height: 20px;
  }

  .viewer-line-number {
    padding-right: 10px;
    color: var(--windy-viewer-line-number-foreground, #6b7280);
    text-align: right;
    user-select: none;
  }

  .viewer-line-text {
    overflow: hidden;
    min-width: 0;
    padding-right: 12px;
    white-space: pre;
  }

  .viewer-status {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    overflow: hidden;
    padding: 0 10px;
    border-top: 1px solid var(--windy-pane-border, #343b47);
    background: var(--windy-pane-header-background, #20242d);
    color: var(--windy-viewer-foreground, #cbd5e1);
    font-size: 11px;
    white-space: nowrap;
  }
</style>
