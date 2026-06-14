# Beta Notes

Windy is currently published as a beta application.

The beta is intended for people who are comfortable with keyboard-driven file
managers and can tolerate rough edges while the app is still stabilizing.

## Safety Notes

- Keep backups of important files.
- Try delete, move, rename, permission, and remote operations on disposable data
  before using them in daily work.
- Local `d` / `delete` uses the operating system trash where supported.
- `shift+delete` permanently deletes local files.
- SFTP delete is permanent because remote trash is not generally available.
- Undo/redo is intentionally limited to selected safe operations.
- Preferences includes reset actions. Reset backs up current settings under the
  app configuration directory before restoring defaults.
- Safe Mode backs up the current main settings and starts with default general,
  appearance, keybinding, and language settings. Use it when a broken setting
  prevents normal startup.

## Platform Notes

Windy targets macOS, Windows, and Linux through Tauri 2.

Platform-specific behavior can differ in these areas:

- Default app opening
- Terminal shell selection
- Trash behavior
- File permissions and attributes
- SFTP and SSH tool availability
- Code signing and installer packaging
- Native menu placement for Preferences and language file switching

macOS beta builds may be ad-hoc signed or unsigned unless a release explicitly
states otherwise. If macOS blocks a beta build, check the release notes for the
expected signing and quarantine status before running it.

On macOS, Preferences is under `Windy > Preferences...`. On Windows/Linux, it is
under `Settings > Preferences...`. Safe Mode can also be requested at startup
with `WINDY_SAFE_MODE=1` or `--safe-mode`.

## SFTP Notes

Windy's built-in SFTP support is designed for everyday file-manager operations:

- Connecting with a saved profile
- Browsing remote directories
- Uploading and downloading files or directories
- Renaming and deleting remote entries
- Creating remote files and directories
- Opening an SSH session from the same connection information

For large files, long-running transfers, resume requirements, strict integrity
verification, bandwidth control, or complex retry behavior, use dedicated tools
such as `rsync`, `scp`, `sftp`, or `rclone` from the terminal.

## Reporting Issues

When reporting a beta issue, include:

- Operating system and version
- Windy version
- What you were trying to do
- What happened
- Whether the source was local, archive, search, or SFTP
- Any relevant error message shown by Windy
