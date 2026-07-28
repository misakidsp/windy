use std::{
    fs,
    io::{self, Write},
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub(crate) fn home_path() -> Option<PathBuf> {
    dirs::home_dir()
}

pub(crate) fn path_to_string(path: impl AsRef<Path>) -> String {
    path.as_ref().to_string_lossy().to_string()
}

pub(crate) fn expand_user_path(path: &str) -> PathBuf {
    if path == "~" {
        return home_path().unwrap_or_else(|| PathBuf::from(path));
    }
    if let Some(rest) = path.strip_prefix("~/") {
        if let Some(home) = home_path() {
            return home.join(rest);
        }
    }
    PathBuf::from(path)
}

pub(crate) fn format_io_error(action: &str, path: &Path, error: io::Error) -> String {
    format!("Failed to {action} '{}': {error}", path.display())
}

pub(crate) fn write_file_atomically(
    path: &Path,
    content: &[u8],
    action: &str,
) -> Result<(), String> {
    let parent = path.parent().ok_or_else(|| {
        format!(
            "Cannot {action} a path without a parent: '{}'",
            path.display()
        )
    })?;
    fs::create_dir_all(parent).map_err(|error| format_io_error(action, parent, error))?;

    let mut temporary =
        NamedTempFile::new_in(parent).map_err(|error| format_io_error(action, path, error))?;
    temporary
        .write_all(content)
        .map_err(|error| format_io_error(action, path, error))?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|error| format_io_error(action, path, error))?;
    temporary
        .persist(path)
        .map(|_| ())
        .map_err(|error| format_io_error(action, path, error.error))
}
