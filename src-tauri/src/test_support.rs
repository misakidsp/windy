use std::{fmt::Display, path::Path};

pub(crate) fn temp_dir() -> tempfile::TempDir {
    tempfile::tempdir().context("create temporary test directory")
}

pub(crate) trait TestResultExt<T> {
    fn context(self, message: impl Into<String>) -> T;
}

impl<T, E: Display> TestResultExt<T> for Result<T, E> {
    fn context(self, message: impl Into<String>) -> T {
        match self {
            Ok(value) => value,
            Err(error) => panic!("{}: {error}", message.into()),
        }
    }
}

pub(crate) trait TestOptionExt<T> {
    fn context(self, message: impl Into<String>) -> T;
}

impl<T> TestOptionExt<T> for Option<T> {
    fn context(self, message: impl Into<String>) -> T {
        match self {
            Some(value) => value,
            None => panic!("{}", message.into()),
        }
    }
}

pub(crate) fn read_to_string(path: &Path) -> String {
    std::fs::read_to_string(path).context(format!("read test file '{}'", path.display()))
}
