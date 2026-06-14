# User Guide

[日本語](USER_GUIDE.ja.md)

Windy is a dual-pane file manager built around keyboard operation.

The screen is centered on two file panes. The bottom area is a terminal pane that
can receive selected paths and can be used for command-line work without leaving
the app.

File-pane operations are keyboard-first. Mouse-driven file operations are not
supported, but Preferences/settings UI supports mouse operation for form
controls such as color pickers.

## Navigation

| Key | Action |
| --- | --- |
| `up` / `down` or `k` / `j` | Move the cursor |
| `left` / `right` or `h` / `l` | Move between panes or go to parent directory |
| `enter` | Open focused directory or file |
| `shift+enter` | Open with the operating system default app |
| `space` | Mark or unmark the focused item |
| `ctrl+r` | Reload the current pane |
| `?` | Show key help |

The inward horizontal key moves to the other pane. The outward horizontal key
moves to the parent directory.

## File Operations

Most operations use the marked items. If nothing is marked, the focused item is
used.

| Key | Action |
| --- | --- |
| `c` | Copy to the other pane |
| `m` | Move to the other pane |
| `r` | Rename |
| `e` | Edit the focused local file with the configured text editor |
| `d` / `delete` | Delete |
| `shift+delete` | Permanently delete |
| `n d` | Create a directory |
| `n f` | Create an empty file |
| `u` | Extract selected archive |
| `a` | Change permissions or attributes |

Local delete uses the operating system trash where supported. Permanent delete
and SFTP delete do not use trash.

`e` always targets the focused file only. Marked files are ignored. It works for
entries that resolve to a local regular file, such as local, search, diff,
operation result, and Git status entries. SFTP entries and archive entries are
not edited directly.

## Viewer

`enter` opens supported files in Windy's internal viewer.

Supported viewer types include:

- Text files
- Common image files
- Files inside supported archives

Unsupported files can be opened with the operating system default app using
`shift+enter`.

When the internal viewer is showing a local file, `e` opens that file in the
configured text editor.

## Archives

Windy can browse these archive formats as virtual directories:

- ZIP
- TAR
- TAR.GZ
- TGZ

Inside an archive, `c` extracts selected entries to the opposite local pane.
`u` extracts a selected archive into a new directory.

## Search And Filter

| Key | Action |
| --- | --- |
| `/` | Quick filter in the current pane |
| `ctrl+f` | Open detailed local search |
| `s` | Change sorting |
| `.` | Toggle hidden files |

Detailed search creates a search result pane. Search result entries can be
opened or copied like regular local entries where supported.

## Diff And Git

| Key | Action |
| --- | --- |
| `, d` | Compare the current left and right pane entries |
| `, c` | Compare local panes recursively with MD5 |
| `, g` | Open Git changed files for the current local pane |

Git status creates a source pane containing changed files. Diff sources are
read-only comparison views.

## Location Manager

`ctrl+n` opens the location manager.

It can switch between:

- Local locations
- Saved local favorites
- Saved search profiles
- Saved SFTP profiles
- New SFTP connection form

Use `enter` to open the selected location. Use `esc` to close the manager.

## SFTP

Windy supports basic SFTP browsing and local/SFTP transfer.

In the location manager, create or select an SFTP profile. Profiles can store
host, port, user, initial path, and authentication type. Passwords and key
passphrases are not intended to be stored as long-term secrets.

SFTP pane operations:

| Key | Action |
| --- | --- |
| `enter` | Open remote directory |
| `c` | Copy between SFTP and local pane |
| `r` | Rename remote entry |
| `d` | Permanently delete remote entry |
| `n d` | Create remote directory |
| `n f` | Create remote empty file |
| `x` | Open SSH session in the terminal pane |

Windy uses OpenSSH-compatible `known_hosts` verification. If a host key changes,
Windy refuses the connection until you verify the server and update
`known_hosts` yourself.

## Terminal

`x` moves focus to the bottom terminal pane. `ctrl+x` returns focus from the
bottom terminal pane to the file panes.

Useful path-copy and terminal integration keys:

| Key | Action |
| --- | --- |
| `y y` | Copy selected local paths |
| `y p` | Copy current local directory path |
| `y n` | Copy selected local file names |
| `ctrl+shift+y` | Insert selected local paths into the terminal |
| `:` or `, x` | Open registered external commands |

## Preferences

Open Preferences from the application menu:

- macOS: `Windy > Preferences...`
- Windows/Linux: `Settings > Preferences...`

Preferences can configure:

- Standard text editor used by `e`
- Key bindings
- File-pane font size and UI colors
- Extension colors with a color picker
- Language file preset
- Settings reset
- Safe Mode

The `Language File` menu can apply the bundled `English`, `Japanese`, and
`Quenya Latin` presets to `settings/language.json`.

Safe Mode backs up the current main settings and regenerates default general,
appearance, keybinding, and language settings. It can be entered from
Preferences, or at startup with `WINDY_SAFE_MODE=1` or `--safe-mode`.

## Settings Files

Windy stores user settings in the operating system's app configuration
directory. The exact location depends on the platform.

Typical locations are:

- macOS: `~/Library/Application Support/windy`
- Windows: `%APPDATA%\windy`
- Linux: `$XDG_CONFIG_HOME/windy` or `~/.config/windy`

Windy creates the files when it first needs them. The main files are:

| File | Purpose |
| --- | --- |
| `commands.json` | Registered external command templates |
| `locations.json` | Local favorites, saved searches, and SFTP profiles |
| `operation-failures.log` | Optional log for failed file operations |
| `settings/operation.json` | Delete behavior, operation result display, cancellation behavior |
| `settings/sftp.json` | SFTP session and transfer behavior |
| `settings/appearance.json` | Fonts, UI colors, extension colors |
| `settings/keybind.json` | Editable key bindings |
| `settings/language.json` | UI message overrides and locale |

Example `settings/operation.json`:

```json
{
  "useTrash": true,
  "operationResult": {
    "showStatus": true,
    "showFailureDialog": true,
    "printToTerminal": false,
    "saveFailureLog": true
  },
  "operationCancel": {
    "doubleEscEnabled": true,
    "doubleEscWindowMs": 700
  },
  "externalEditor": {
    "command": "",
    "args": []
  }
}
```

`externalEditor` controls the editor launched by `e`. `command` is an
executable name or path. `args` is an array where each item is passed as one
argument. If an item contains `{path}`, Windy replaces it with the target file
path. If `{path}` is not present, Windy appends the file path as the final
argument.

Example:

```json
{
  "externalEditor": {
    "command": "code",
    "args": ["--reuse-window", "{path}"]
  }
}
```

On macOS, an app-based editor can be configured through `open`:

```json
{
  "externalEditor": {
    "command": "open",
    "args": ["-a", "CotEditor", "{path}"]
  }
}
```

Example `settings/sftp.json`:

```json
{
  "sftpSession": {
    "lifecycle": "keepRecent",
    "maxSessions": 2,
    "idleDisconnectMinutes": 0
  },
  "sftpTransfer": {
    "partFileThresholdBytes": 1048576
  }
}
```

Example `settings/appearance.json` fragment:

```json
{
  "schemaVersion": 1,
  "fonts": {
    "uiFamily": "UDEV Gothic",
    "terminalFamily": "UDEV Gothic",
    "uiSize": 12,
    "terminalSize": 12,
    "viewerSize": 12
  },
  "extensionColors": {
    ".md": "#f9d65c",
    ".rs": "#fb923c",
    ".ts": "#7dd3fc"
  }
}
```

Example `commands.json`:

```json
{
  "commands": [
    {
      "id": "echo-selected-paths",
      "name": "Echo selected paths",
      "description": "Print selected local paths in the terminal.",
      "template": "printf '%s\\n' {args}",
      "returnFocus": false
    }
  ]
}
```

Common external command placeholders include:

| Placeholder | Meaning |
| --- | --- |
| `{args}` | Selected local paths, shell-quoted as command arguments |
| `{cwd}` | Current local directory in the active pane |
| `{otherCwd}` | Current local directory in the opposite pane |
| `{names}` | Selected file names |
| `{first}` | First selected local path |
| `{marked}` | Marked local paths in the active pane |
| `{otherMarked}` | Marked local paths in the opposite pane |

The generated sample external commands are intentionally conservative. When
editing these files by hand, close Windy first or reload the relevant view after
editing.
