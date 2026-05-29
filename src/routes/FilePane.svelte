<script lang="ts">
  import type { FileEntry, PaneId, PaneState, VirtualEntryWindow } from "./types";

  type ListAction = (node: HTMLElement, paneId: PaneId) => {
    update?: (paneId: PaneId) => void;
    destroy?: () => void;
  };

  type FilterInputAction = (node: HTMLInputElement, paneId: PaneId) => {
    destroy?: () => void;
  };

  export let pane: PaneState;
  export let active = false;
  export let visibleEntries: FileEntry[] = [];
  export let virtualWindow: VirtualEntryWindow;
  export let headerLabel: string;
  export let meta: string;
  export let showParentEntry = false;
  export let registerList: ListAction;
  export let registerFilterInput: FilterInputAction;
  export let onListScroll: (paneId: PaneId) => void;
  export let onQuickFilterInput: (paneId: PaneId, query: string) => void;
  export let onQuickFilterKeydown: (event: KeyboardEvent, paneId: PaneId) => void;
  export let entryClass: (pane: PaneState, entry: FileEntry) => string;
  export let entryNameStyle: (pane: PaneState, entry: FileEntry) => string | null;
  export let formatSize: (entry: FileEntry) => string;
  export let formatDate: (seconds: number | null) => string;
</script>

<section class:active class="file-pane" aria-label={pane.title}>
  <header class="pane-header">
    <div class="pane-title" title={headerLabel}>
      {headerLabel}
    </div>
    <div class="pane-meta" title={meta}>{meta}</div>
  </header>
  <div class:filter-active={Boolean(pane.quickFilterQuery)} class:filter-editing={pane.quickFilterInputActive} class="pane-divider">
    {#if pane.quickFilterInputActive}
      <span class="filter-label">filter:</span>
      <input
        use:registerFilterInput={pane.id}
        class="filter-input"
        value={pane.quickFilterQuery}
        spellcheck="false"
        aria-label={`${pane.title} quick filter`}
        oninput={(event) => onQuickFilterInput(pane.id, event.currentTarget.value)}
        onkeydown={(event) => onQuickFilterKeydown(event, pane.id)}
      />
    {:else}
      <span>{pane.quickFilterQuery ? `filter: ${pane.quickFilterQuery}` : showParentEntry ? ".. enabled" : "filter ready"}</span>
    {/if}
  </div>
  <div
    use:registerList={pane.id}
    class="file-list"
    role="listbox"
    aria-label={`${pane.title} entries`}
    onscroll={() => onListScroll(pane.id)}
  >
    {#if pane.loading}
      <div class="message-row">Loading...</div>
    {:else if pane.error}
      <div class="message-row error">{pane.error}</div>
    {:else if pane.entries.length === 0}
      <div class="message-row">No entries</div>
    {:else if visibleEntries.length === 0}
      <div class="message-row">No filter matches</div>
    {:else}
      <div class="virtual-spacer" style={`height: ${virtualWindow.topPadding}px`}></div>
      {#each virtualWindow.entries as entry, virtualIndex (entry.key)}
        <div
          class={`file-row ${entryClass(pane, entry)}`}
          role="option"
          aria-selected={pane.cursorKey === entry.key}
          aria-posinset={virtualWindow.start + virtualIndex + 1}
          aria-setsize={visibleEntries.length}
          tabindex={pane.cursorKey === entry.key ? 0 : -1}
        >
          <span class="mark cursor-mark">{pane.cursorKey === entry.key ? ">" : " "}</span>
          <span class="mark select-mark">{pane.selectedKeys.has(entry.key) ? "*" : " "}</span>
          <span class="name" title={entry.path} style={entryNameStyle(pane, entry)}>{entry.name}</span>
          <span class="size">{formatSize(entry)}</span>
          <span class="modified">{formatDate(entry.modifiedAt)}</span>
        </div>
      {/each}
      <div class="virtual-spacer" style={`height: ${virtualWindow.bottomPadding}px`}></div>
    {/if}
  </div>
</section>

<style>
  .file-pane {
    display: grid;
    grid-template-rows: auto 20px minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    border-right: 1px solid var(--windy-pane-border, #4b5563);
    background: var(--windy-pane-background, #202329);
  }

  .file-pane:last-child {
    border-right: none;
  }

  .file-pane.active {
    background: var(--windy-pane-active-background, #242832);
  }

  .pane-header {
    min-width: 0;
    padding: 7px 10px 5px;
    border-bottom: 1px solid var(--windy-pane-border, #3b414d);
    color: var(--windy-entry-foreground, #d7dce5);
  }

  .file-pane.active .pane-header {
    color: var(--windy-app-foreground, #ffffff);
    background: var(--windy-pane-header-background, #303847);
  }

  .pane-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-size: 13px;
  }

  .pane-meta {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    margin-top: 3px;
    color: var(--windy-terminal-foreground, #aeb6c3);
    font-size: 12px;
  }

  .pane-divider {
    display: flex;
    align-items: center;
    gap: 4px;
    padding-left: 8px;
    border-bottom: 1px solid var(--windy-pane-border, #606875);
    color: var(--windy-entry-muted-foreground, #7f8998);
    font-size: 11px;
  }

  .pane-divider.filter-active {
    color: var(--windy-filter-foreground, #c7d2fe);
  }

  .pane-divider.filter-editing {
    color: var(--windy-filter-editing-foreground, #e5e7eb);
    background: var(--windy-filter-editing-background, #1d2530);
  }

  .pane-divider::before,
  .pane-divider::after {
    content: "";
    height: 1px;
    background: var(--windy-pane-border, #606875);
  }

  .pane-divider::before {
    width: 10px;
    margin-right: 4px;
  }

  .pane-divider::after {
    flex: 1;
    margin-left: 4px;
  }

  .filter-label {
    flex: 0 0 auto;
    color: var(--windy-filter-foreground, #c7d2fe);
  }

  .filter-input {
    flex: 1;
    min-width: 0;
    height: 18px;
    border: none;
    outline: none;
    background: transparent;
    color: var(--windy-app-foreground, #f9fafb);
    font: inherit;
  }

  .file-list {
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding: 2px 0;
    font-size: 12px;
    line-height: 20px;
  }

  .file-row {
    display: grid;
    grid-template-columns: 18px 18px minmax(0, 1fr) minmax(54px, 76px) minmax(72px, 116px);
    align-items: center;
    min-width: 0;
    height: 20px;
    padding-right: 8px;
    color: var(--windy-entry-foreground, #d8dee9);
  }

  .virtual-spacer {
    min-height: 0;
    pointer-events: none;
  }

  .file-row.cursor {
    background: var(--windy-entry-cursor-background, #374151);
  }

  .file-pane.active .file-row.cursor {
    background: var(--windy-entry-cursor-background, #475569);
    color: var(--windy-app-foreground, #ffffff);
  }

  .file-row.selected {
    background: var(--windy-entry-selected-background, #263f46);
  }

  .file-row.cursor.selected {
    background: var(--windy-entry-cursor-selected-background, #3f5962);
  }

  .file-row.filter-kept:not(.cursor) {
    background: var(--windy-entry-filter-kept-background, #20262c);
    color: var(--windy-entry-muted-foreground, #858f9e);
  }

  .file-row.filter-kept:not(.cursor) .name,
  .file-row.filter-kept:not(.cursor).directory .name {
    color: var(--windy-entry-muted-foreground, #858f9e);
  }

  .file-row.diff-left-only:not(.cursor) {
    background: var(--windy-entry-diff-left-only-background, #1d3147);
  }

  .file-row.diff-right-only:not(.cursor) {
    background: var(--windy-entry-diff-right-only-background, #1d3a2a);
  }

  .file-row.diff-size-different:not(.cursor),
  .file-row.diff-modified-different:not(.cursor),
  .file-row.diff-kind-different:not(.cursor),
  .file-row.diff-hash-different:not(.cursor),
  .file-row.diff-read-error:not(.cursor) {
    background: var(--windy-entry-diff-changed-background, #3a2f1f);
  }

  .file-row.directory .name {
    color: var(--windy-entry-directory-foreground, #9fd1ff);
  }

  .file-row.hidden {
    color: var(--windy-entry-hidden-foreground, #8d96a7);
  }

  .mark,
  .size,
  .modified {
    color: var(--windy-terminal-foreground, #aeb6c3);
  }

  .mark {
    text-align: center;
  }

  .name {
    overflow: hidden;
    min-width: 0;
    padding-right: 12px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .size,
  .modified {
    overflow: hidden;
    white-space: nowrap;
    text-align: right;
  }

  .modified {
    padding-left: 12px;
  }

  .message-row {
    padding: 8px 10px;
    color: var(--windy-terminal-foreground, #aeb6c3);
  }

  .message-row.error {
    color: var(--windy-entry-error-foreground, #fca5a5);
    white-space: pre-wrap;
  }
</style>
