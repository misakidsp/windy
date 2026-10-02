# Workspace composition

`+page.svelte` renders the panes and dialogs, creates one workspace per mount,
and registers `mountWorkspace` with Svelte's `onMount`.

## Responsibilities

| Module | Responsibility |
| --- | --- |
| `panesController` | Cursor, selection, filtering, virtual list and focus |
| `directoryController` | Local/virtual directory loading, stale-load guards and refresh |
| `navigationController` | Parent/root/home navigation and opening entries |
| `viewerController` | Text/image opening, viewer keyboard input and external editor |
| `searchController` | Search form and large-result confirmation |
| `locationsController` | Favorites, profiles, SFTP connection and session lifecycle |
| `operationsController` | Preview, execution, cancellation, results and undo/redo |
| `inspectionController` | Properties, pane comparison and diff display |
| `commandsController` | External commands, clipboard and terminal insertion |
| `terminalController` | PTY session, focus, input, repeat and copy mode |
| `settingsController` | Preferences, persistence, appearance and language |
| `keyboardController` | Keyboard priority and feature dispatch |
| `messagesController` | Localized backend and clipboard errors |
| `workspaceLifecycle` | Window/backend listeners, startup and listener cleanup |

Controllers keep the existing pure models and backend side-effect adapters.
Each receives only the state slices and action dependencies declared by its
`Pick` types. Add behavior to its feature controller rather than the page.

`createWorkspace` wires all controllers before any actions run. Constructors
must not invoke another feature during wiring. `WorkspaceActions` describes
the shared action port; the `satisfies` check at composition verifies that all
declared actions are supplied.

## Reactivity and identity

State factories use Svelte runes and return live accessors. Keep references to
the state objects instead of destructuring their field values: async actions
must see the current active pane, settings and session after an `await`.

Most fields use `$state.raw` to preserve the existing immutable updates and
object identity. Replace records/arrays/forms when changing them. In particular,
pane entry arrays and selection sets are cache keys and must not become deep
proxies. `listElements` is reactive because DOM action registration changes
the measured virtual-list viewport. `visibleEntriesCache` is deliberately
nonreactive: rendering may populate it without invalidating the render.

The translator is derived from the current language settings. Listener handles
belong to the mounted lifecycle rather than UI state, including handles returned
after an early unmount.

## Verification

- `npm test`: models plus composed-controller integration tests with mocked IPC.
- `npm run check`: Svelte and TypeScript checks.
- `npm run build`: production frontend build.
- `npm run test:browser`: opens the real page with mocked backend data and runs
  DOM checks for panes, keyboard input, filtering, Viewer sizing, preferences,
  runtime errors and remount cleanup. The result banner must show `PASS`.

Keep the corresponding files in `public-release/windy` in sync when preparing
the public source copy. The browser test performs no real file or SFTP operations.

進捗・結果は `activityState.svelte.ts` が言語IDと値、jobId、結果スナップショットを保持し、`activityController.ts` がペインからの表示・履歴操作を担当する。自動切り替え方針は `createWorkspace.ts`、バックエンドの `activity-progress` 購読は `workspaceLifecycle.ts` に集約する。単発結果は `app.notify`、非同期処理は `activity.begin` / `progress` / `finish` を使い、端末出力には書き込まない。
