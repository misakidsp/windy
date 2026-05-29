# Development

Windy is a Tauri 2 app with a Svelte frontend and Rust backend.

## Requirements

- Node.js 22 or newer
- pnpm
- Rust stable toolchain
- Tauri 2 platform prerequisites

Linux builds require WebKitGTK and related system packages. See the Tauri 2
documentation for current platform setup details.

## Commands

Install dependencies:

```sh
pnpm install --frozen-lockfile
```

Run checks:

```sh
pnpm check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

Run the development app:

```sh
pnpm tauri dev
```

Build:

```sh
pnpm tauri build
```

Build without producing platform bundles:

```sh
pnpm tauri build --no-bundle --ci
```

## Project Layout

| Path | Purpose |
| --- | --- |
| `src/routes` | Svelte UI and frontend state models |
| `src-tauri/src` | Rust backend commands and file-system integration |
| `tests` | TypeScript model tests |
| `static/fonts` | Bundled UDEV Gothic font files |
| `docs` | Public beta documentation |

## Testing Policy

Before opening a pull request, run:

```sh
pnpm check
pnpm test
cargo test --manifest-path src-tauri/Cargo.toml
```

For changes that touch Tauri integration, also run a local app build on the
target platform when possible.

## Release Notes

Keep user-facing release notes focused on:

- Added or changed behavior
- Known beta limitations
- Platform-specific packaging notes
- Safety notes for file operations

Avoid publishing local environment details, private project notes, or internal
planning notes.
