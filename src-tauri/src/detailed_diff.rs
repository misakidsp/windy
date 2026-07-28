use crate::{path_utils::format_io_error, EntryKind};
use md5::{Digest, Md5};
use serde::Serialize;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::UNIX_EPOCH,
};

#[derive(Default)]
pub(crate) struct DetailedDiffCancellationState {
    flags: Mutex<BTreeMap<String, Arc<AtomicBool>>>,
}

impl DetailedDiffCancellationState {
    pub(crate) fn register(&self, job_id: Option<&str>) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let Some(job_id) = job_id else {
            return flag;
        };
        if let Ok(mut flags) = self.flags.lock() {
            flags.insert(job_id.to_string(), Arc::clone(&flag));
        }
        flag
    }

    pub(crate) fn unregister(&self, job_id: Option<&str>) {
        let Some(job_id) = job_id else {
            return;
        };
        if let Ok(mut flags) = self.flags.lock() {
            flags.remove(job_id);
        }
    }

    pub(crate) fn request_cancel(&self, job_id: &str) -> bool {
        let Ok(flags) = self.flags.lock() else {
            return false;
        };
        let Some(flag) = flags.get(job_id) else {
            return false;
        };
        flag.store(true, Ordering::SeqCst);
        true
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailedDiffSnapshot {
    pub(crate) left_path: String,
    pub(crate) right_path: String,
    pub(crate) recursive: bool,
    pub(crate) hash_files: bool,
    pub(crate) entries: Vec<DetailedDiffEntry>,
    pub(crate) counts: DetailedDiffCounts,
}

#[derive(Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailedDiffCounts {
    pub(crate) left_only: usize,
    pub(crate) right_only: usize,
    pub(crate) kind_different: usize,
    pub(crate) size_different: usize,
    pub(crate) modified_different: usize,
    pub(crate) hash_different: usize,
    pub(crate) read_error: usize,
    pub(crate) identical: usize,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailedDiffEntry {
    pub(crate) relative_path: String,
    pub(crate) name: String,
    pub(crate) status: DetailedDiffStatus,
    pub(crate) left: Option<DetailedDiffSide>,
    pub(crate) right: Option<DetailedDiffSide>,
}

#[derive(Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DetailedDiffStatus {
    LeftOnly,
    RightOnly,
    KindDifferent,
    SizeDifferent,
    ModifiedDifferent,
    HashDifferent,
    ReadError,
    Identical,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct DetailedDiffSide {
    pub(crate) kind: EntryKind,
    pub(crate) size: Option<u64>,
    pub(crate) modified_at: Option<u64>,
    pub(crate) md5: Option<String>,
    pub(crate) error: Option<String>,
}

#[cfg(test)]
pub(crate) fn compare_local_directories_detailed_blocking(
    left_path: PathBuf,
    right_path: PathBuf,
    recursive: bool,
    hash_files: bool,
) -> Result<DetailedDiffSnapshot, String> {
    compare_local_directories_detailed_blocking_with_cancellation(
        left_path,
        right_path,
        recursive,
        hash_files,
        Arc::new(AtomicBool::new(false)),
    )
}

pub(crate) fn compare_local_directories_detailed_blocking_with_cancellation(
    left_path: PathBuf,
    right_path: PathBuf,
    recursive: bool,
    hash_files: bool,
    cancellation: Arc<AtomicBool>,
) -> Result<DetailedDiffSnapshot, String> {
    validate_directory_root(&left_path, "left")?;
    validate_directory_root(&right_path, "right")?;

    let left_entries = collect_entries(&left_path, recursive, hash_files, &cancellation)?;
    let right_entries = collect_entries(&right_path, recursive, hash_files, &cancellation)?;
    let relative_paths = left_entries
        .keys()
        .chain(right_entries.keys())
        .cloned()
        .collect::<BTreeSet<_>>();

    let mut counts = DetailedDiffCounts::default();
    let entries = relative_paths
        .into_iter()
        .map(|relative_path| {
            let left = left_entries.get(&relative_path).cloned();
            let right = right_entries.get(&relative_path).cloned();
            let status = detailed_status(left.as_ref(), right.as_ref());
            increment_count(&mut counts, status);
            DetailedDiffEntry {
                name: Path::new(&relative_path)
                    .file_name()
                    .map(|name| name.to_string_lossy().to_string())
                    .unwrap_or_else(|| relative_path.clone()),
                relative_path,
                status,
                left,
                right,
            }
        })
        .collect();
    check_canceled(&cancellation)?;

    Ok(DetailedDiffSnapshot {
        left_path: left_path.to_string_lossy().to_string(),
        right_path: right_path.to_string_lossy().to_string(),
        recursive,
        hash_files,
        entries,
        counts,
    })
}

fn validate_directory_root(path: &Path, label: &str) -> Result<(), String> {
    if !path.exists() {
        return Err(format!("{label} path does not exist: {}", path.display()));
    }
    if !path.is_dir() {
        return Err(format!(
            "{label} path is not a directory: {}",
            path.display()
        ));
    }
    Ok(())
}

fn collect_entries(
    root: &Path,
    recursive: bool,
    hash_files: bool,
    cancellation: &Arc<AtomicBool>,
) -> Result<BTreeMap<String, DetailedDiffSide>, String> {
    let mut entries = BTreeMap::new();
    let _ = collect_directory_children(
        root,
        root,
        recursive,
        hash_files,
        &mut entries,
        cancellation,
    )?;
    Ok(entries)
}

fn collect_directory_children(
    root: &Path,
    directory: &Path,
    recursive: bool,
    hash_files: bool,
    entries: &mut BTreeMap<String, DetailedDiffSide>,
    cancellation: &Arc<AtomicBool>,
) -> Result<u64, String> {
    check_canceled(cancellation)?;
    let read_dir = fs::read_dir(directory)
        .map_err(|error| format_io_error("read directory for detailed diff", directory, error))?;

    let mut directory_size = 0u64;
    for entry in read_dir {
        check_canceled(cancellation)?;
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let relative_path = match relative_path_string(root, &path) {
            Some(relative_path) => relative_path,
            None => continue,
        };
        let side = detailed_side(&path, hash_files, cancellation);
        let should_recurse = recursive
            && side
                .as_ref()
                .map(|side| side.kind == EntryKind::Directory && side.error.is_none())
                .unwrap_or(false);
        let mut side = side.unwrap_or_else(|error| DetailedDiffSide {
            kind: EntryKind::Other,
            size: None,
            modified_at: None,
            md5: None,
            error: Some(error),
        });
        if should_recurse {
            side.size = Some(collect_directory_children(
                root,
                &path,
                recursive,
                hash_files,
                entries,
                cancellation,
            )?);
        }
        directory_size = directory_size.saturating_add(side.size.unwrap_or(0));
        entries.insert(relative_path, side);
    }

    Ok(directory_size)
}

fn detailed_side(
    path: &Path,
    hash_files: bool,
    cancellation: &Arc<AtomicBool>,
) -> Result<DetailedDiffSide, String> {
    check_canceled(cancellation)?;
    let metadata = fs::symlink_metadata(path)
        .map_err(|error| format_io_error("read metadata for detailed diff", path, error))?;
    let file_type = metadata.file_type();
    let kind = if file_type.is_dir() {
        EntryKind::Directory
    } else if file_type.is_file() {
        EntryKind::File
    } else if file_type.is_symlink() {
        EntryKind::Symlink
    } else {
        EntryKind::Other
    };
    let size = if kind == EntryKind::Directory {
        None
    } else {
        Some(metadata.len())
    };
    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs());
    let md5 = if hash_files && kind == EntryKind::File {
        Some(md5_file(path, cancellation)?)
    } else {
        None
    };

    Ok(DetailedDiffSide {
        kind,
        size,
        modified_at,
        md5,
        error: None,
    })
}

fn md5_file(path: &Path, cancellation: &Arc<AtomicBool>) -> Result<String, String> {
    check_canceled(cancellation)?;
    let mut file =
        fs::File::open(path).map_err(|error| format_io_error("read file for md5", path, error))?;
    let mut hasher = Md5::new();
    let mut buffer = [0_u8; 64 * 1024];

    loop {
        check_canceled(cancellation)?;
        let read = file
            .read(&mut buffer)
            .map_err(|error| format_io_error("read file for md5", path, error))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

fn check_canceled(cancellation: &Arc<AtomicBool>) -> Result<(), String> {
    if cancellation.load(Ordering::SeqCst) {
        Err("Detailed diff canceled.".to_string())
    } else {
        Ok(())
    }
}

fn detailed_status(
    left: Option<&DetailedDiffSide>,
    right: Option<&DetailedDiffSide>,
) -> DetailedDiffStatus {
    let Some(left) = left else {
        return DetailedDiffStatus::RightOnly;
    };
    let Some(right) = right else {
        return DetailedDiffStatus::LeftOnly;
    };
    if left.error.is_some() || right.error.is_some() {
        return DetailedDiffStatus::ReadError;
    }
    if left.kind != right.kind {
        return DetailedDiffStatus::KindDifferent;
    }
    if left.size != right.size {
        return DetailedDiffStatus::SizeDifferent;
    }
    if left.md5.is_some() && right.md5.is_some() && left.md5 != right.md5 {
        return DetailedDiffStatus::HashDifferent;
    }
    if left.modified_at != right.modified_at {
        return DetailedDiffStatus::ModifiedDifferent;
    }
    DetailedDiffStatus::Identical
}

fn increment_count(counts: &mut DetailedDiffCounts, status: DetailedDiffStatus) {
    match status {
        DetailedDiffStatus::LeftOnly => counts.left_only += 1,
        DetailedDiffStatus::RightOnly => counts.right_only += 1,
        DetailedDiffStatus::KindDifferent => counts.kind_different += 1,
        DetailedDiffStatus::SizeDifferent => counts.size_different += 1,
        DetailedDiffStatus::ModifiedDifferent => counts.modified_different += 1,
        DetailedDiffStatus::HashDifferent => counts.hash_different += 1,
        DetailedDiffStatus::ReadError => counts.read_error += 1,
        DetailedDiffStatus::Identical => counts.identical += 1,
    }
}

fn relative_path_string(root: &Path, path: &Path) -> Option<String> {
    let relative = path.strip_prefix(root).ok()?;
    let parts = relative
        .components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().to_string()),
            _ => None,
        })
        .collect::<Vec<_>>();
    if parts.is_empty() {
        None
    } else {
        Some(parts.join("/"))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::tempdir;

    #[test]
    fn detailed_diff_detects_recursive_size_and_hash_differences() {
        let temp = tempdir().expect("create tempdir");
        let left = temp.path().join("left");
        let right = temp.path().join("right");
        fs::create_dir_all(left.join("nested")).expect("create left nested");
        fs::create_dir_all(right.join("nested")).expect("create right nested");
        write_file(&left.join("same.txt"), b"same");
        write_file(&right.join("same.txt"), b"same");
        write_file(&left.join("nested").join("changed.txt"), b"left");
        write_file(&right.join("nested").join("changed.txt"), b"rift");
        write_file(&left.join("only-left.txt"), b"left only");

        let snapshot = compare_local_directories_detailed_blocking(left, right, true, true)
            .expect("compare directories");

        assert!(snapshot.entries.iter().any(|entry| {
            entry.relative_path == "nested/changed.txt"
                && entry.status == DetailedDiffStatus::HashDifferent
        }));
        assert!(snapshot.entries.iter().any(|entry| {
            entry.relative_path == "only-left.txt" && entry.status == DetailedDiffStatus::LeftOnly
        }));
        let nested = snapshot
            .entries
            .iter()
            .find(|entry| entry.relative_path == "nested")
            .expect("nested directory entry");
        assert_eq!(nested.left.as_ref().and_then(|side| side.size), Some(4));
        assert_eq!(nested.right.as_ref().and_then(|side| side.size), Some(4));
        assert_eq!(snapshot.counts.hash_different, 1);
        assert_eq!(snapshot.counts.left_only, 1);
    }

    #[test]
    fn detailed_diff_non_recursive_does_not_measure_directory_size() {
        let temp = tempdir().expect("create tempdir");
        let left = temp.path().join("left");
        let right = temp.path().join("right");
        fs::create_dir_all(left.join("nested")).expect("create left nested");
        fs::create_dir_all(right.join("nested")).expect("create right nested");
        write_file(&left.join("nested").join("left.txt"), b"left");
        write_file(&right.join("nested").join("right.txt"), b"right");

        let snapshot = compare_local_directories_detailed_blocking(left, right, false, true)
            .expect("compare directories");
        let nested = snapshot
            .entries
            .iter()
            .find(|entry| entry.relative_path == "nested")
            .expect("nested directory entry");

        assert_eq!(nested.left.as_ref().and_then(|side| side.size), None);
        assert_eq!(nested.right.as_ref().and_then(|side| side.size), None);
        assert!(matches!(nested.status, DetailedDiffStatus::Identical));
        assert!(!snapshot
            .entries
            .iter()
            .any(|entry| entry.relative_path.contains("left.txt")));
        assert!(!snapshot
            .entries
            .iter()
            .any(|entry| entry.relative_path.contains("right.txt")));
    }

    #[test]
    fn detailed_diff_honors_pre_requested_cancellation() {
        let temp = tempdir().expect("create tempdir");
        let left = temp.path().join("left");
        let right = temp.path().join("right");
        fs::create_dir_all(&left).expect("create left");
        fs::create_dir_all(&right).expect("create right");
        write_file(&left.join("a.txt"), b"left");
        write_file(&right.join("a.txt"), b"right");

        let cancellation = Arc::new(AtomicBool::new(true));
        let result = compare_local_directories_detailed_blocking_with_cancellation(
            left,
            right,
            true,
            true,
            cancellation,
        );

        let Err(message) = result else {
            panic!("detailed diff should be canceled");
        };
        assert!(message.contains("canceled"));
    }

    fn write_file(path: &Path, bytes: &[u8]) {
        let mut file = fs::File::create(path).expect("create file");
        file.write_all(bytes).expect("write file");
    }
}
