use crate::path_utils::path_to_string;
use crate::{build_file_entry, sort_entries, EntryKind, FileEntry};
use serde::Serialize;
use std::{
    path::{Path, PathBuf},
    process::Command,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GitStatusListing {
    pub(crate) root_path: String,
    pub(crate) display_path: String,
    pub(crate) entries: Vec<FileEntry>,
}

pub(crate) fn list_git_status_directory_blocking(
    path: PathBuf,
) -> Result<GitStatusListing, String> {
    let root_path = git_root_path(&path)?;
    let output = Command::new("git")
        .arg("-C")
        .arg(&root_path)
        .args(["status", "--porcelain=v1", "-z", "--untracked-files=all"])
        .output()
        .map_err(|error| format!("Run git status failed: {error}"))?;

    if !output.status.success() {
        return Err(git_command_error("git status", &output.stderr));
    }

    let relative_paths = parse_porcelain_z_paths(&output.stdout);
    let mut entries = Vec::new();
    for relative_path in relative_paths {
        let entry_path = root_path.join(&relative_path);
        let name = leaf_name(&relative_path);
        let entry = build_file_entry(entry_path.clone(), name.clone())
            .unwrap_or_else(|_| missing_git_entry(entry_path, name));
        entries.push(entry);
    }
    sort_entries(&mut entries);

    Ok(GitStatusListing {
        root_path: path_to_string(&root_path),
        display_path: format!(
            "git:{} [{} changed]",
            path_to_string(&root_path),
            entries.len()
        ),
        entries,
    })
}

fn git_root_path(path: &Path) -> Result<PathBuf, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(path)
        .args(["rev-parse", "--show-toplevel"])
        .output()
        .map_err(|error| format!("Run git rev-parse failed: {error}"))?;

    if !output.status.success() {
        return Err(git_command_error("git rev-parse", &output.stderr));
    }

    let root = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if root.is_empty() {
        return Err(format!(
            "Git root could not be resolved for {}.",
            path.display()
        ));
    }
    Ok(PathBuf::from(root))
}

fn parse_porcelain_z_paths(output: &[u8]) -> Vec<String> {
    let mut paths = Vec::new();
    let mut index = 0;
    while index < output.len() {
        let Some(end) = output[index..].iter().position(|byte| *byte == 0) else {
            break;
        };
        let record = &output[index..index + end];
        index += end + 1;
        if record.len() < 4 || record[2] != b' ' {
            continue;
        }

        let x = record[0] as char;
        let y = record[1] as char;
        let path = String::from_utf8_lossy(&record[3..]).to_string();
        if !path.is_empty() {
            paths.push(path);
        }

        if matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C') {
            let Some(old_end) = output[index..].iter().position(|byte| *byte == 0) else {
                break;
            };
            index += old_end + 1;
        }
    }
    paths
}

fn missing_git_entry(path: PathBuf, name: String) -> FileEntry {
    FileEntry {
        key: path_to_string(&path),
        name: name.clone(),
        path: path_to_string(&path),
        kind: EntryKind::File,
        size: None,
        modified_at: None,
        hidden: name.starts_with('.'),
        readonly: false,
        mode: None,
    }
}

fn leaf_name(path: &str) -> String {
    path.rsplit(['/', '\\'])
        .find(|part| !part.is_empty())
        .unwrap_or(path)
        .to_string()
}

fn git_command_error(command: &str, stderr: &[u8]) -> String {
    let message = String::from_utf8_lossy(stderr).trim().to_string();
    if message.is_empty() {
        format!("{command} failed.")
    } else {
        format!("{command} failed: {message}")
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn porcelain_z_parser_reads_normal_untracked_and_renamed_paths() {
        let output = b" M src/main.rs\0?? docs/new file.md\0R  src/new.rs\0src/old.rs\0";
        assert_eq!(
            parse_porcelain_z_paths(output),
            vec!["src/main.rs", "docs/new file.md", "src/new.rs"]
        );
    }

    #[test]
    fn missing_git_entry_points_to_the_original_path() {
        let entry = missing_git_entry(
            PathBuf::from("/repo/deleted.txt"),
            "deleted.txt".to_string(),
        );
        assert_eq!(entry.path, "/repo/deleted.txt");
        assert_eq!(entry.name, "deleted.txt");
        assert_eq!(entry.kind, EntryKind::File);
        assert_eq!(entry.size, None);
    }
}
