<script lang="ts">
  import ActivityPanel from "./ActivityPanel.svelte";
  import { activityCounts } from "./activityModel";
  import type { createActivityState } from "./workspace/activityState.svelte";
  import type { Translate } from "./localization";
  let { activity, focused = false, fullscreen = false, visible = true, terminalElement = $bindable(null), t = (id: string) => id }: {
    activity: ReturnType<typeof createActivityState>;
    focused?: boolean; fullscreen?: boolean; visible?: boolean;
    terminalElement?: HTMLElement | null; t?: Translate;
  } = $props();
  const counts = $derived(activityCounts(activity.records));
</script>

<section
  class:focused
  class:fullscreen
  class="console-placeholder"
  aria-label={t("terminal.consoleAria")}
  aria-hidden={!visible}
>
  <header>{activity.view === "terminal" ? t("activity.terminal") : t("activity.title")} · {t("activity.counts", counts)} {activity.followLatest ? "" : t("activity.historyPosition")}</header>
  <div class="content" class:hidden={activity.view !== "terminal"}>
  <div
    bind:this={terminalElement}
    class="console-output"
    role="application"
    aria-label={t("terminal.ptyAria")}
  ></div>
  </div>
  <div class="content" class:hidden={activity.view !== "activity"}>
    <ActivityPanel records={activity.records} selectedId={activity.selectedId} followLatest={activity.followLatest} bind:listElement={activity.listElement} {t} />
  </div>
</section>

<style>
  header { padding: 3px 8px; font-size: 11px; border-bottom: 1px solid var(--windy-pane-border, #444); }
  .content { min-height: 0; }
  .hidden { display: none; }
  .console-placeholder {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr);
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
