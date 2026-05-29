use std::{
    io,
    path::{Path, PathBuf},
};

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
