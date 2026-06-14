<script lang="ts">
  import { onMount } from "svelte";
  import type { KeyHelpGroup } from "./keyHelpModel";

  export let groups: KeyHelpGroup[] = [];

  let scrollContainer: HTMLDivElement | null = null;

  onMount(() => {
    scrollContainer?.focus({ preventScroll: true });
  });
</script>

<div class="key-help-backdrop" aria-label="Key help">
  <section class="key-help-panel">
    <header>
      <div>
        <span class="eyebrow">Key Help</span>
        <h2>Current bindings</h2>
      </div>
      <span class="hint">? / Esc closes</span>
    </header>

    <div bind:this={scrollContainer} aria-label="Current key bindings" class="group-grid" role="region" tabindex="-1">
      {#each groups as group}
        <section class="help-group">
          <h3>{group.title}</h3>
          <div class="help-items">
            {#each group.items as item}
              <div class="help-item">
                <div class="keys">
                  {#each item.keys as key}
                    <kbd>{key}</kbd>
                  {/each}
                </div>
                <span class="label">{item.label}</span>
                {#if item.locked}
                  <span class="locked">fixed</span>
                {/if}
              </div>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  </section>
</div>

<style>
  .key-help-backdrop {
    position: fixed;
    inset: 0;
    z-index: 30;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--windy-dialog-backdrop, rgb(0 0 0 / 0.58));
  }

  .key-help-panel {
    width: min(1040px, 96vw);
    max-height: min(760px, 88vh);
    overflow: hidden;
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
    gap: 14px;
    padding: 18px;
    border: 1px solid var(--windy-dialog-item-border, #303946);
    background: var(--windy-dialog-background, #151922);
    color: var(--windy-dialog-foreground, #e5e7eb);
    box-shadow: 0 18px 60px var(--windy-dialog-shadow, rgb(0 0 0 / 0.42));
  }

  header {
    display: flex;
    align-items: end;
    justify-content: space-between;
    gap: 20px;
  }

  .eyebrow,
  .hint,
  .locked {
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    font-size: 12px;
  }

  h2,
  h3 {
    margin: 0;
    font-weight: 700;
  }

  h2 {
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 20px;
  }

  h3 {
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font-size: 14px;
  }

  .group-grid {
    overflow-x: hidden;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 12px;
    padding-right: 4px;
  }

  .help-group {
    border: 1px solid var(--windy-dialog-item-border, #303946);
    background: var(--windy-dialog-item-background, #171c24);
    padding: 12px;
  }

  .help-items {
    display: grid;
    gap: 6px;
    margin-top: 10px;
  }

  .help-item {
    display: grid;
    grid-template-columns: minmax(90px, auto) 1fr auto;
    align-items: center;
    gap: 10px;
    min-height: 24px;
  }

  .keys {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  kbd {
    min-width: 22px;
    padding: 2px 6px;
    border: 1px solid var(--windy-dialog-item-border, #303946);
    background: var(--windy-dialog-input-background, #1f242c);
    color: var(--windy-dialog-accent, #8fb8ff);
    text-align: center;
    font: inherit;
  }

  .label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
