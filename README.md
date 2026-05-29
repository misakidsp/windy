# Windy

Windy is a keyboard-first, dual-pane file manager for desktop power users.

It combines two file panes, a built-in terminal, archive browsing, local search,
file previews, and basic SFTP operations in one Tauri desktop app.

> Windy is currently a beta project. Please keep backups of important files and
> try destructive operations on non-critical data first.

## Features

- Dual-pane file browsing with keyboard-focused navigation
- Local copy, move, rename, delete, new folder, and new file operations
- Trash-based delete for local files, plus explicit permanent delete
- Built-in text and image viewer
- ZIP, TAR, TAR.GZ, and TGZ archive browsing and extraction
- Quick filter and detailed local search result panes
- Local directory comparison
- Undo/redo for selected safe operations
- Bottom terminal pane linked to file selections
- Path copy and external command templates
- SFTP connection profiles and local/SFTP transfer basics
- macOS, Windows, and Linux oriented codebase

## Beta Status

This repository is a public beta snapshot of Windy.

Known beta caveats:

- The UI is optimized for keyboard use and intentionally does not support mouse
  driven file operations.
- SFTP support is intended for everyday lightweight transfers. For large or
  long-running transfers, use external tools such as `rsync`, `scp`, `sftp`, or
  `rclone` from the terminal.
- Some archive and remote-source operations are intentionally read-only or
  limited.
- macOS builds may be ad-hoc signed or unsigned unless a release explicitly
  states otherwise.

See [Beta Notes](docs/BETA_NOTES.md) for details.

## Download

Beta builds are published from the repository's Releases page when available.

If no release asset is available for your platform yet, you can build Windy from
source with the steps below.

## Build From Source

Requirements:

- Node.js 22 or newer
- pnpm
- Rust stable toolchain
- Platform prerequisites for Tauri 2

Install dependencies and run checks:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the development app:

```sh
pnpm tauri dev
```

Build the app:

```sh
pnpm tauri build
```

For more contributor-oriented notes, see [Development](docs/DEVELOPMENT.md).

## Basic Operation

Windy is designed around the keyboard.

| Key | Action |
| --- | --- |
| `up` / `down` or `k` / `j` | Move the cursor |
| `left` / `right` or `h` / `l` | Move between panes or go to parent directory |
| `enter` | Open a directory or file |
| `space` | Mark or unmark the focused item |
| `c` | Copy selected items to the other pane |
| `m` | Move selected items to the other pane |
| `r` | Rename |
| `d` / `delete` | Delete, using trash for local files |
| `shift+delete` | Permanently delete |
| `n d` | Create a directory |
| `n f` | Create an empty file |
| `ctrl+n` | Open the location manager |
| `/` | Open quick filter |
| `f` | Open detailed search |
| `tab` | Move focus to the terminal |
| `?` | Show key help |

See the [User Guide](docs/USER_GUIDE.md) for a broader walkthrough.

## Bundled Font

Windy bundles UDEV Gothic for consistent file-manager and terminal display.

- Font: UDEV Gothic
- License: SIL Open Font License 1.1
- License text: [docs/licenses/UDEV-Gothic-OFL-1.1.txt](docs/licenses/UDEV-Gothic-OFL-1.1.txt)

## License

Windy is released under the MIT License. See [LICENSE](LICENSE).
