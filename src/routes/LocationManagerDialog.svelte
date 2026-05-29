<script lang="ts">
  import type {
    LocalFavoriteProfile,
    LocationDialogMode,
    LocationOption,
    PendingKnownHost,
    SearchProfile,
    SftpConnectionForm,
    SftpConnectionProfile,
    SftpConnectionTestResult,
  } from "./types";

  export let mode: LocationDialogMode;
  export let locationProfilesLoading = false;
  export let locationProfilesError = "";
  export let locationOptions: LocationOption[] = [];
  export let locationCursorIndex = 0;
  export let pendingDeleteProfile: SftpConnectionProfile | null = null;
  export let pendingDeleteLocalFavorite: LocalFavoriteProfile | null = null;
  export let pendingDeleteSearchProfile: SearchProfile | null = null;
  export let sftpForm: SftpConnectionForm;
  export let sftpConnecting = false;
  export let sftpConnectionResult: SftpConnectionTestResult | null = null;
  export let sftpConnectionError = "";
  export let pendingKnownHost: PendingKnownHost | null = null;
  export let hostInputElement: HTMLInputElement | null = null;
  export let passwordInputElement: HTMLInputElement | null = null;
  export let optionKey: (option: LocationOption) => string;
  export let onSftpFormPatch: (patch: Partial<SftpConnectionForm>) => void;
  export let onAuthKindChange: (authKind: SftpConnectionForm["authKind"]) => void;
  export let onCompositionStart: () => void;
  export let onCompositionEnd: () => void;

  $: dialogTitle = mode === "manager" ? "Location Manager" : sftpForm.profileId ? "SFTP Profile" : "New SFTP Connection";
  $: dialogKind = mode === "manager" ? "source" : sftpForm.profileId ? "saved" : "temporary";
  $: dialogMessage =
    mode === "manager"
      ? "Choose a location source for the active pane."
      : "Test an SFTP connection or save profile changes. Passwords are not saved.";
  $: primaryShortcut =
    mode === "manager"
      ? locationProfilesLoading
        ? "Loading..."
        : "Choose: Enter"
      : sftpConnecting
        ? "Connecting..."
        : pendingKnownHost
          ? "Trust host key: Enter"
          : "Connect: Enter";
</script>

<div class="dialog-backdrop" role="presentation">
  <div
    class="confirm-dialog sftp-dialog"
    role="dialog"
    aria-modal="true"
    aria-labelledby="sftp-dialog-title"
    aria-describedby="sftp-dialog-message"
  >
    <header class="confirm-dialog-header">
      <div id="sftp-dialog-title">{dialogTitle}</div>
      <div class="confirm-risk">{dialogKind}</div>
    </header>
    <div id="sftp-dialog-message" class="confirm-message">
      {dialogMessage}
    </div>

    {#if mode === "manager"}
      {#if locationProfilesError}
        <div class="operation-result confirm-result">
          <div class="result-failed">-: {locationProfilesError}</div>
        </div>
      {/if}
      {#if pendingDeleteProfile}
        <div class="operation-result confirm-result">
          <div class="result-failed">
            Delete SFTP profile "{pendingDeleteProfile.name}"? Press D or Enter to confirm, Esc to cancel.
          </div>
        </div>
      {/if}
      {#if pendingDeleteLocalFavorite}
        <div class="operation-result confirm-result">
          <div class="result-failed">
            Delete local favorite "{pendingDeleteLocalFavorite.name}"? Press D or Enter to confirm, Esc to cancel.
          </div>
        </div>
      {/if}
      {#if pendingDeleteSearchProfile}
        <div class="operation-result confirm-result">
          <div class="result-failed">
            Delete search profile "{pendingDeleteSearchProfile.name}"? Press D or Enter to confirm, Esc to cancel.
          </div>
        </div>
      {/if}
      <div class="location-options" role="listbox" aria-label="Location sources">
        {#each locationOptions as option, index (optionKey(option))}
          <div
            class:cursor={locationCursorIndex === index}
            class="location-option"
            role="option"
            aria-selected={locationCursorIndex === index}
          >
            <span>{option.label}</span>
            <span>{option.detail}</span>
          </div>
        {/each}
      </div>
    {:else}
      <div
        class="sftp-fields"
        oncompositionstart={onCompositionStart}
        oncompositionend={onCompositionEnd}
      >
        <label>
          <span>name</span>
          <input
            value={sftpForm.name}
            spellcheck="false"
            autocomplete="off"
            oninput={(event) => onSftpFormPatch({ name: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>host</span>
          <input
            bind:this={hostInputElement}
            value={sftpForm.host}
            spellcheck="false"
            autocomplete="off"
            oninput={(event) => onSftpFormPatch({ host: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>port</span>
          <input
            value={sftpForm.port}
            inputmode="numeric"
            spellcheck="false"
            autocomplete="off"
            oninput={(event) => onSftpFormPatch({ port: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>user</span>
          <input
            value={sftpForm.username}
            spellcheck="false"
            autocomplete="username"
            oninput={(event) => onSftpFormPatch({ username: event.currentTarget.value })}
          />
        </label>
        <label>
          <span>auth</span>
          <select
            value={sftpForm.authKind}
            onchange={(event) => onAuthKindChange(event.currentTarget.value as SftpConnectionForm["authKind"])}
          >
            <option value="password">password</option>
            <option value="privateKey">private key</option>
          </select>
        </label>
        {#if sftpForm.authKind === "password"}
          <label>
            <span>password</span>
            <input
              bind:this={passwordInputElement}
              value={sftpForm.password}
              type="password"
              autocomplete="current-password"
              oninput={(event) => onSftpFormPatch({ password: event.currentTarget.value })}
            />
          </label>
        {:else}
          <label>
            <span>key path</span>
            <input
              value={sftpForm.privateKeyPath}
              spellcheck="false"
              autocomplete="off"
              oninput={(event) => onSftpFormPatch({ privateKeyPath: event.currentTarget.value })}
            />
          </label>
          <label>
            <span>passphrase</span>
            <input
              bind:this={passwordInputElement}
              value={sftpForm.passphrase}
              type="password"
              autocomplete="off"
              oninput={(event) => onSftpFormPatch({ passphrase: event.currentTarget.value })}
            />
          </label>
        {/if}
        <label>
          <span>remote path</span>
          <input
            value={sftpForm.remotePath}
            spellcheck="false"
            autocomplete="off"
            oninput={(event) => onSftpFormPatch({ remotePath: event.currentTarget.value })}
          />
        </label>
        <label class="sftp-save-profile">
          <span>save</span>
          <input
            checked={sftpForm.saveProfile}
            type="checkbox"
            onchange={(event) => onSftpFormPatch({ saveProfile: event.currentTarget.checked })}
          />
          <span>store this profile without password</span>
        </label>
      </div>
      {#if sftpConnectionResult}
        <div class="operation-result confirm-result">
          <div class="result-summary">
            {sftpConnectionResult.displayName} connected as {sftpConnectionResult.connectionId}
          </div>
          <div>remote path: {sftpConnectionResult.remotePath}</div>
        </div>
      {/if}
      {#if pendingKnownHost}
        <div class="operation-result confirm-result">
          <div class="result-summary">unknown host key</div>
          <div>{pendingKnownHost.host}:{pendingKnownHost.port}</div>
          <div>{pendingKnownHost.fingerprint}</div>
          <div>{pendingKnownHost.knownHostsPath}</div>
        </div>
      {/if}
      {#if sftpConnectionError}
        <div class="operation-result confirm-result">
          <div class="result-failed">-: {sftpConnectionError}</div>
        </div>
      {/if}
    {/if}
    <div class="confirm-shortcuts">
      <span>{primaryShortcut}</span>
      <span>{mode === "manager" ? "Move: Up/Down" : "Back: Esc"}</span>
      {#if mode === "manager"}
        <span>Add current: A</span>
        <span>Delete saved: D</span>
        <span>Disconnect session: Q</span>
        <span>Close: Esc</span>
      {:else}
        <span>Save profile: ctrl+s</span>
      {/if}
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

  .result-summary {
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .location-options {
    display: grid;
    gap: 6px;
    padding: 10px 14px 0;
  }

  .location-option {
    display: grid;
    grid-template-columns: 180px minmax(0, 1fr);
    gap: 10px;
    align-items: center;
    min-height: 30px;
    border: 1px solid var(--windy-dialog-item-border, #303946);
    border-radius: 4px;
    background: var(--windy-dialog-item-background, #171c24);
    color: var(--windy-dialog-foreground, #d1d5db);
    text-align: left;
  }

  .location-option.cursor {
    border-color: var(--windy-dialog-accent, #93c5fd);
    background: var(--windy-dialog-item-active-background, #243142);
    color: var(--windy-dialog-header-foreground, #f8fafc);
  }

  .location-option span:last-child {
    overflow: hidden;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .sftp-fields {
    display: grid;
    gap: 8px;
    padding: 10px 14px 0;
  }

  .sftp-fields label {
    min-width: 0;
    display: grid;
    grid-template-columns: 112px minmax(0, 1fr);
    align-items: center;
    gap: 8px;
    color: var(--windy-dialog-muted-foreground, #aeb6c3);
  }

  .sftp-fields input,
  .sftp-fields select {
    min-width: 0;
    height: 26px;
    border: 1px solid var(--windy-pane-border, #4b5563);
    border-radius: 4px;
    background: var(--windy-dialog-input-background, #1f242c);
    color: var(--windy-dialog-header-foreground, #f8fafc);
    font: inherit;
    user-select: text;
  }

  .sftp-fields .sftp-save-profile {
    grid-template-columns: 112px 18px minmax(0, 1fr);
  }

  .sftp-fields .sftp-save-profile input {
    width: 14px;
    height: 14px;
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
