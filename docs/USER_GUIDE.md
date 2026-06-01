# User Guide

[日本語](USER_GUIDE.ja.md)

Windy is a dual-pane file manager built around keyboard operation.

The screen is centered on two file panes. The bottom area is a terminal pane that
can receive selected paths and can be used for command-line work without leaving
the app.

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
| `d` / `delete` | Delete |
| `shift+delete` | Permanently delete |
| `n d` | Create a directory |
| `n f` | Create an empty file |
| `u` | Extract selected archive |
| `a` | Change permissions or attributes |

Local delete uses the operating system trash where supported. Permanent delete
and SFTP delete do not use trash.

## Viewer

`enter` opens supported files in Windy's internal viewer.

Supported viewer types include:

- Text files
- Common image files
- Files inside supported archives

Unsupported files can be opened with the operating system default app using
`shift+enter`.

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
| `f` | Open detailed local search |
| `s` | Change sorting |
| `.` | Toggle hidden files |

Detailed search creates a search result pane. Search result entries can be
opened or copied like regular local entries where supported.

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
