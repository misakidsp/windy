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

## Platform Notes

Windy targets macOS, Windows, and Linux through Tauri 2.

Platform-specific behavior can differ in these areas:

- Default app opening
- Terminal shell selection
- Trash behavior
- File permissions and attributes
- SFTP and SSH tool availability
- Code signing and installer packaging

macOS beta builds may be ad-hoc signed or unsigned unless a release explicitly
states otherwise. If macOS blocks a beta build, check the release notes for the
expected signing and quarantine status before running it.

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
