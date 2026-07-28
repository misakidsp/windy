<script lang="ts">
  import type { Translate } from "./localization";

  export let focused = false;
  export let fullscreen = false;
  export let visible = true;
  export let terminalElement: HTMLElement | null = null;
  export let t: Translate = (id) => id;
</script>

<section
  class:focused
  class:fullscreen
  class="console-placeholder"
  aria-label={t("terminal.consoleAria")}
  aria-hidden={!visible}
>
  <div
    bind:this={terminalElement}
    class="console-output"
    role="application"
    aria-label={t("terminal.ptyAria")}
  ></div>
</section>

<style>
  .console-placeholder {
    min-height: 0;
    overflow: hidden;
    padding: 0;
    border-bottom: 1px solid var(--windy-pane-border, #4b5563);
    background: var(--windy-terminal-background, #111318);
    color: var(--windy-terminal-foreground, #9ca3af);
    font-size: var(--windy-terminal-font-size, 12px);
  }

  :global(.console-hidden) .console-placeholder {
    border-bottom: none;
    visibility: hidden;
  }

  .console-placeholder.focused {
    border-top: 1px solid var(--windy-terminal-foreground, #9ca3af);
    background: var(--windy-terminal-background, #141820);
  }

  .console-placeholder.fullscreen {
    border-top: none;
  }

  .console-output {
    width: 100%;
    height: 100%;
    padding: 6px 8px;
  }

  .console-output:focus {
    outline: 1px solid var(--windy-dialog-accent, #93c5fd);
    outline-offset: 2px;
  }
</style>
