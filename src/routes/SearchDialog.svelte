<script lang="ts">
  import type { SearchDialogForm, SearchHiddenMode, SearchKind, SearchReadonlyMode } from "./types";

  export let form: SearchDialogForm;
  export let running = false;
  export let error = "";
  export let regexInputElement: HTMLInputElement | null = null;
  export let onFormPatch: (patch: Partial<SearchDialogForm>) => void;
  export let onCompositionStart: () => void;
  export let onCompositionEnd: () => void;
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class="confirm-dialog search-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="search-dialog-title"
    aria-describedby="search-dialog-message"
  >
    <header class="confirm-dialog-header">
      <div id="search-dialog-title">Search Source</div>
      <div class="confirm-risk">local</div>
    </header>
    <div id="search-dialog-message" class="confirm-message">
      Create a virtual result source from local entries. Quick filter remains available inside the result.
    </div>
    <div
      class="search-fields"
      oncompositionstart={onCompositionStart}
      oncompositionend={onCompositionEnd}
    >
      <label>
        <span>root</span>
        <input
          value={form.rootPath}
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ rootPath: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>name regex</span>
        <input
          bind:this={regexInputElement}
          value={form.nameRegex}
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ nameRegex: event.currentTarget.value })}
        />
      </label>
      <label class="search-checkbox">
        <span>recursive</span>
        <input
          checked={form.recursive}
          type="checkbox"
          onchange={(event) => onFormPatch({ recursive: event.currentTarget.checked })}
        />
        <span>include child directories</span>
      </label>
      <label>
        <span>kind</span>
        <select
          value={form.kind}
          onchange={(event) => onFormPatch({ kind: event.currentTarget.value as SearchKind })}
        >
          <option value="all">all</option>
          <option value="file">file</option>
          <option value="directory">directory</option>
          <option value="symlink">symlink</option>
          <option value="other">other</option>
        </select>
      </label>
      <label>
        <span>min size</span>
        <input
          value={form.minSizeBytes}
          placeholder="10m"
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ minSizeBytes: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>max size</span>
        <input
          value={form.maxSizeBytes}
          placeholder="1g"
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ maxSizeBytes: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>modified after</span>
        <input
          value={form.modifiedAfter}
          placeholder="YYYYMMDD"
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ modifiedAfter: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>modified before</span>
        <input
          value={form.modifiedBefore}
          placeholder="YYYYMMDD"
          spellcheck="false"
          autocomplete="off"
          oninput={(event) => onFormPatch({ modifiedBefore: event.currentTarget.value })}
        />
      </label>
      <label>
        <span>hidden</span>
        <select
          value={form.hiddenMode}
          onchange={(event) => onFormPatch({ hiddenMode: event.currentTarget.value as SearchHiddenMode })}
        >
          <option value="exclude">exclude</option>
          <option value="include">include</option>
          <option value="only">only</option>
        </select>
      </label>
      <label>
        <span>readonly</span>
        <select
          value={form.readonlyMode}
          onchange={(event) => onFormPatch({ readonlyMode: event.currentTarget.value as SearchReadonlyMode })}
        >
          <option value="any">any</option>
          <option value="readonly">readonly</option>
          <option value="writable">writable</option>
        </select>
      </label>
    </div>
    {#if error}
      <div class="operation-result confirm-result">
        <div class="result-failed">-: {error}</div>
      </div>
    {/if}
    <div class="confirm-shortcuts">
      <span>{running ? "Searching..." : "Search: Enter"}</span>
      <span>Cancel: Esc</span>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 20;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--windy-dialog-backdrop, rgb(0 0 0 / 0.58));
  }

  .confirm-dialog {
    width: min(680px, 100%);
    max-height: min(520px, calc(100vh - 48px));
    overflow-x: hidden;
    overflow-y: auto;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 6px;
    background: var(--windy-dialog-background, #171a20);
    box-shadow: 0 18px 50px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
    color: var(--windy-dialog-foreground, #d1d5db);
  }

  .confirm-dialog-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--windy-pane-border, #343b47);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  .confirm-risk {
    color: var(--windy-dialog-accent, #86efac);
    font-size: 12px;
  }

  .confirm-message {
    min-width: 0;
    padding: 10px 14px 0;
    overflow-wrap: anywhere;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    white-space: pre-wrap;
  }

  .search-fields {
    display: grid;
    gap: 8px;
    padding: 10px 14px 0;
  }

  .search-fields label {
    min-width: 0;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .search-fields input,
  .search-fields select {
    min-width: 0;
    height: 26px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    background: var(--windy-dialog-input-background, #1f242c);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font: inherit;
    user-select: text;
  }

  .search-fields .search-checkbox {
    grid-template-columns: 112px 18px minmax(0, 1fr);
  }

  .search-fields .search-checkbox input {
    width: 14px;
    height: 14px;
  }

  .operation-result {
    margin-top: 6px;
    padding: 0 14px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .result-failed {
    overflow: hidden;
    color: var(--windy-dialog-danger-foreground, #fca5a5);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .confirm-shortcuts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px 48px;
    padding: 16px 14px 14px;
    text-align: center;
  }

  .confirm-shortcuts span {
    min-width: 0;
    color: var(--windy-dialog-header-foreground, #f8fafc);
    overflow-wrap: anywhere;
  }
</style>
