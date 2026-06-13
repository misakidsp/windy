use serde::Serialize;
use std::{
    fs, io,
    path::{Path, PathBuf},
    process::Command,
    time::UNIX_EPOCH,
};

mod archive;
mod config;
mod detailed_diff;
mod file_ops;
mod git_status;
mod location_profiles;
mod path_utils;
mod search;
mod sftp;
mod terminal;
#[cfg(test)]
mod test_support;
mod viewer;

use archive::list_archive_directory_blocking;
use config::{
    load_app_settings, load_appearance_settings, load_external_commands, load_keybind_settings,
    save_app_settings as save_app_settings_file,
    save_operation_failure_log as save_operation_failure_log_file, AppSettings, AppearanceSettings,
    ExternalCommandDefinition, KeybindSettings,
};
use detailed_diff::{
    compare_local_directories_detailed_blocking_with_cancellation, DetailedDiffCancellationState,
    DetailedDiffSnapshot,
};
use file_ops::{
    cancel_file_operation_job, execute_file_operation_job, FileOperationResultItem,
    OperationCancellationState,
};
use git_status::{list_git_status_directory_blocking, GitStatusListing};
use location_profiles::{
    delete_local_favorite_profile, delete_search_profile, delete_sftp_connection_profile,
    list_local_favorite_profiles, list_search_profiles, list_sftp_connection_profiles,
    save_local_favorite_profile, save_search_profile, save_sftp_connection_profile,
};

#[cfg(test)]
use file_ops::{
    execute_file_operation_job_blocking, execute_file_operation_job_blocking_with_cancellation,
    FileOperationJob, FileOperationKind, FileOperationTarget,
};

#[cfg(test)]
use location_profiles::{
    delete_local_favorite_profile_from_path, delete_search_profile_from_path,
    delete_sftp_connection_profile_from_path, load_location_profiles_from_path,
    save_location_profiles_to_path, LocalFavoriteProfile, LocationProfilesFile, SearchProfile,
};
#[cfg(test)]
use sftp::{normalized_sftp_remote_path, validate_sftp_connection_request, SftpConnectionProfile};

#[cfg(all(test, target_os = "windows"))]
use file_ops::validate_file_name;

#[cfg(test)]
use config::{
    load_app_settings_from_dir, load_app_settings_from_path, load_external_commands_from_path,
    save_app_settings_to_dir, save_external_commands_to_path, save_operation_failure_log_to_path,
    ExternalCommandsFile, OperationResultSettings, SftpSessionSettings,
};
#[cfg(test)]
use path_utils::expand_user_path;
use path_utils::{format_io_error, home_path, path_to_string};
use search::search_directory;
use sftp::{
    disconnect_sftp_connection, list_active_sftp_sessions, list_sftp_directory,
    test_sftp_connection, SftpState,
};
use terminal::{
    resize_terminal, start_sftp_ssh_terminal, start_terminal, stop_terminal, write_terminal,
    TerminalState,
};

use viewer::{read_archive_image_file, read_archive_text_file, read_image_file, read_text_file};

#[cfg(test)]
use sftp::{join_sftp_remote_path, parse_sftp_uri, sftp_parent_remote_path, sftp_remote_leaf_name};

#[cfg(test)]
use archive::{parse_archive_entry_path, read_archive_entry_bytes};

#[cfg(test)]
use search::{search_directory_blocking, SearchDirectoryRequest};

#[cfg(test)]
use terminal::terminal_cwd;

#[cfg(test)]
use viewer::{
    encode_base64, read_archive_image_file_blocking, read_archive_text_file_blocking,
    read_image_file_blocking, read_text_file_blocking, IMAGE_VIEWER_MAX_BYTES,
    TEXT_VIEWER_MAX_BYTES,
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileEntry {
    pub(crate) key: String,
    pub(crate) name: String,
    pub(crate) path: String,
    pub(crate) kind: EntryKind,
    pub(crate) size: Option<u64>,
    pub(crate) modified_at: Option<u64>,
    pub(crate) hidden: bool,
    pub(crate) readonly: bool,
    pub(crate) mode: Option<u32>,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "camelCase")]
pub(crate) enum EntryKind {
    Directory,
    File,
    Symlink,
    Other,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DirectoryListing {
    path: String,
    entries: Vec<FileEntry>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveDirectoryListing {
    pub(crate) archive_path: String,
    pub(crate) inner_path: String,
    pub(crate) display_path: String,
    pub(crate) entries: Vec<FileEntry>,
}

#[tauri::command]
fn home_directory() -> Result<String, String> {
    home_path()
        .map(path_to_string)
        .ok_or_else(|| "Home directory could not be resolved.".to_string())
}

#[tauri::command]
fn list_local_roots() -> Vec<String> {
    local_roots()
}

#[cfg(target_os = "windows")]
fn local_roots() -> Vec<String> {
    (b'A'..=b'Z')
        .filter_map(|letter| {
            let path = format!("{}:\\", letter as char);
            PathBuf::from(&path).is_dir().then_some(path)
        })
        .collect()
}

#[cfg(not(target_os = "windows"))]
fn local_roots() -> Vec<String> {
    vec!["/".to_string()]
}

#[tauri::command]
fn get_app_settings() -> Result<AppSettings, String> {
    load_app_settings()
}

#[tauri::command]
fn get_appearance_settings() -> Result<AppearanceSettings, String> {
    load_appearance_settings()
}

#[tauri::command]
fn get_keybind_settings() -> Result<KeybindSettings, String> {
    load_keybind_settings()
}

#[tauri::command]
fn save_app_settings(settings: AppSettings) -> Result<AppSettings, String> {
    save_app_settings_file(&settings)?;
    Ok(settings)
}

#[tauri::command]
fn save_operation_failure_log(
    label: String,
    failed: Vec<FileOperationResultItem>,
) -> Result<String, String> {
    save_operation_failure_log_file(&label, &failed)
}

#[tauri::command]
fn parent_directory(path: String) -> Result<Option<String>, String> {
    let path = PathBuf::from(path);
    Ok(path.parent().map(path_to_string))
}

#[tauri::command]
fn root_directory(path: String) -> Result<String, String> {
    let mut current = if path.is_empty() {
        home_path().ok_or_else(|| "Home directory could not be resolved.".to_string())?
    } else {
        PathBuf::from(path)
    };

    while let Some(parent) = current.parent() {
        current = parent.to_path_buf();
    }

    Ok(path_to_string(&current))
}

#[tauri::command]
fn list_directory(path: String) -> Result<DirectoryListing, String> {
    let path = PathBuf::from(path);
    let mut entries = Vec::new();

    let read_dir =
        fs::read_dir(&path).map_err(|error| format_io_error("read directory", &path, error))?;

    for entry in read_dir {
        let Ok(entry) = entry else {
            continue;
        };
        if let Ok(file_entry) = build_file_entry(
            entry.path(),
            entry.file_name().to_string_lossy().to_string(),
        ) {
            entries.push(file_entry);
        }
    }

    sort_entries(&mut entries);

    Ok(DirectoryListing {
        path: path_to_string(&path),
        entries,
    })
}

#[tauri::command]
fn list_archive_directory(
    archive_path: String,
    inner_path: String,
) -> Result<ArchiveDirectoryListing, String> {
    list_archive_directory_blocking(PathBuf::from(archive_path), inner_path)
}

#[tauri::command]
async fn list_git_status_directory(path: String) -> Result<GitStatusListing, String> {
    tauri::async_runtime::spawn_blocking(move || {
        list_git_status_directory_blocking(PathBuf::from(path))
    })
    .await
    .map_err(|error| format!("Git status task failed: {error}"))?
}

#[tauri::command]
async fn compare_local_directories_detailed(
    cancellation_state: tauri::State<'_, DetailedDiffCancellationState>,
    job_id: Option<String>,
    left_path: String,
    right_path: String,
    recursive: bool,
    hash_files: bool,
) -> Result<DetailedDiffSnapshot, String> {
    let cancellation = cancellation_state.register(job_id.as_deref());
    let cleanup_job_id = job_id.clone();
    let result = match tauri::async_runtime::spawn_blocking(move || {
        compare_local_directories_detailed_blocking_with_cancellation(
            PathBuf::from(left_path),
            PathBuf::from(right_path),
            recursive,
            hash_files,
            cancellation,
        )
    })
    .await
    {
        Ok(result) => result,
        Err(error) => {
            cancellation_state.unregister(cleanup_job_id.as_deref());
            return Err(format!("Detailed diff task failed: {error}"));
        }
    };
    cancellation_state.unregister(cleanup_job_id.as_deref());
    result
}

#[tauri::command]
fn cancel_detailed_diff(
    cancellation_state: tauri::State<'_, DetailedDiffCancellationState>,
    job_id: String,
) -> Result<bool, String> {
    Ok(cancellation_state.request_cancel(&job_id))
}

#[tauri::command]
fn list_external_commands() -> Result<Vec<ExternalCommandDefinition>, String> {
    Ok(load_external_commands()?.commands)
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    open_path_blocking(PathBuf::from(path))
}

fn open_path_blocking(path: PathBuf) -> Result<(), String> {
    let path = prepare_open_path(path)?;
    spawn_open_command(&path).map_err(|error| format_io_error("open path", &path, error))
}

fn prepare_open_path(path: PathBuf) -> Result<PathBuf, String> {
    if path.as_os_str().is_empty() {
        return Err("Path is empty.".to_string());
    }

    let canonical_path = path
        .canonicalize()
        .map_err(|error| format_io_error("resolve path", &path, error))?;
    if !canonical_path.is_absolute() {
        return Err(format!(
            "Path must resolve to a local absolute path: {}",
            path_to_string(&path)
        ));
    }
    Ok(canonical_path)
}

#[cfg(target_os = "macos")]
fn spawn_open_command(path: &Path) -> io::Result<()> {
    Command::new("open").arg("--").arg(path).spawn().map(|_| ())
}

#[cfg(target_os = "windows")]
fn spawn_open_command(path: &Path) -> io::Result<()> {
    Command::new("explorer").arg(path).spawn().map(|_| ())
}

#[cfg(all(unix, not(target_os = "macos")))]
fn spawn_open_command(path: &Path) -> io::Result<()> {
    Command::new("xdg-open").arg(path).spawn().map(|_| ())
}

pub(crate) fn build_file_entry(entry_path: PathBuf, name: String) -> Result<FileEntry, String> {
    let metadata = fs::symlink_metadata(&entry_path)
        .map_err(|error| format_io_error("read metadata", &entry_path, error))?;
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

    Ok(FileEntry {
        key: path_to_string(&entry_path),
        name: name.clone(),
        path: path_to_string(&entry_path),
        kind,
        size: if metadata.is_file() {
            Some(metadata.len())
        } else {
            None
        },
        modified_at: metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_secs()),
        hidden: is_hidden(&entry_path, &metadata, &name),
        readonly: metadata.permissions().readonly(),
        mode: local_file_mode(&metadata),
    })
}

#[cfg(target_os = "windows")]
fn is_hidden(_path: &Path, metadata: &fs::Metadata, name: &str) -> bool {
    use std::os::windows::fs::MetadataExt;

    const FILE_ATTRIBUTE_HIDDEN: u32 = 0x2;

    name.starts_with('.') || metadata.file_attributes() & FILE_ATTRIBUTE_HIDDEN != 0
}

#[cfg(not(target_os = "windows"))]
fn is_hidden(_path: &Path, _metadata: &fs::Metadata, name: &str) -> bool {
    name.starts_with('.')
}

#[cfg(unix)]
fn local_file_mode(metadata: &fs::Metadata) -> Option<u32> {
    use std::os::unix::fs::PermissionsExt;

    Some(metadata.permissions().mode() & 0o777)
}

#[cfg(not(unix))]
fn local_file_mode(_metadata: &fs::Metadata) -> Option<u32> {
    None
}

pub(crate) fn sort_entries(entries: &mut [FileEntry]) {
    entries.sort_by(|left, right| {
        let left_dir = left.kind == EntryKind::Directory;
        let right_dir = right.kind == EntryKind::Directory;
        right_dir
            .cmp(&left_dir)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
            .then_with(|| left.name.cmp(&right.name))
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(TerminalState::default())
        .manage(SftpState::default())
        .manage(OperationCancellationState::default())
        .manage(DetailedDiffCancellationState::default())
        .invoke_handler(tauri::generate_handler![
            home_directory,
            list_local_roots,
            get_app_settings,
            get_appearance_settings,
            get_keybind_settings,
            save_app_settings,
            parent_directory,
            root_directory,
            list_directory,
            list_archive_directory,
            list_git_status_directory,
            compare_local_directories_detailed,
            cancel_detailed_diff,
            search_directory,
            test_sftp_connection,
            list_active_sftp_sessions,
            disconnect_sftp_connection,
            list_sftp_directory,
            list_local_favorite_profiles,
            save_local_favorite_profile,
            delete_local_favorite_profile,
            list_search_profiles,
            save_search_profile,
            delete_search_profile,
            list_sftp_connection_profiles,
            save_sftp_connection_profile,
            delete_sftp_connection_profile,
            list_external_commands,
            open_path,
            read_image_file,
            read_archive_image_file,
            read_text_file,
            read_archive_text_file,
            start_terminal,
            start_sftp_ssh_terminal,
            write_terminal,
            resize_terminal,
            stop_terminal,
            execute_file_operation_job,
            cancel_file_operation_job,
            save_operation_failure_log
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::sync::{atomic::AtomicBool, Arc};
    use test_support::{read_to_string, temp_dir, TestOptionExt, TestResultExt};

    fn target(path: &Path) -> FileOperationTarget {
        FileOperationTarget {
            path: path_to_string(path),
        }
    }

    fn write_sample_tar_archive(path: &Path, gzip: bool) {
        use flate2::{write::GzEncoder, Compression};

        fn append_sample_entries<W: Write>(writer: W) {
            let mut builder = tar::Builder::new(writer);
            append_tar_file(&mut builder, "docs/readme.txt", b"readme");
            append_tar_file(&mut builder, "root.txt", b"root");
            append_tar_file(&mut builder, "pixel.png", &[137, 80, 78, 71]);
            builder.finish().context("finish sample tar archive");
        }

        let archive_file =
            fs::File::create(path).context(format!("create sample archive '{}'", path.display()));
        if gzip {
            let encoder = GzEncoder::new(archive_file, Compression::default());
            append_sample_entries(encoder);
        } else {
            append_sample_entries(archive_file);
        }
    }

    fn append_tar_file<W: Write>(builder: &mut tar::Builder<W>, path: &str, bytes: &[u8]) {
        let mut header = tar::Header::new_gnu();
        header.set_size(bytes.len() as u64);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, path, bytes)
            .context(format!("append tar test file '{path}'"));
    }

    fn append_tar_symlink<W: Write>(builder: &mut tar::Builder<W>, path: &str, target: &str) {
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Symlink);
        header.set_size(0);
        header.set_mode(0o777);
        header
            .set_link_name(target)
            .context(format!("set tar symlink target '{target}'"));
        header.set_cksum();
        builder
            .append_data(&mut header, path, io::empty())
            .context(format!("append tar test symlink '{path}'"));
    }

    fn append_tar_fifo<W: Write>(builder: &mut tar::Builder<W>, path: &str) {
        let mut header = tar::Header::new_gnu();
        header.set_entry_type(tar::EntryType::Fifo);
        header.set_size(0);
        header.set_mode(0o644);
        header.set_cksum();
        builder
            .append_data(&mut header, path, io::empty())
            .context(format!("append tar test fifo '{path}'"));
    }

    #[test]
    fn list_directory_sorts_directories_first_then_names() {
        let root = temp_dir();
        let root = root.path();
        fs::create_dir(root.join("z-dir")).unwrap();
        fs::create_dir(root.join("a-dir")).unwrap();
        fs::write(root.join("b.txt"), "b").unwrap();
        fs::write(root.join("a.txt"), "a").unwrap();

        let listing = list_directory(path_to_string(&root)).unwrap();
        let names: Vec<_> = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();

        assert_eq!(names, vec!["a-dir", "z-dir", "a.txt", "b.txt"]);
    }

    #[test]
    fn list_directory_marks_dotfiles_hidden() {
        let root = temp_dir();
        let root = root.path();
        fs::write(root.join(".hidden"), "hidden").unwrap();

        let listing = list_directory(path_to_string(&root)).unwrap();
        let hidden = listing
            .entries
            .iter()
            .find(|entry| entry.name == ".hidden")
            .context("hidden file should be listed");

        assert!(hidden.hidden);
    }

    #[test]
    fn list_archive_directory_returns_immediate_children() {
        use zip::{write::SimpleFileOptions, ZipWriter};

        let root = temp_dir();
        let archive_path = root.path().join("sample.zip");
        let archive_file =
            fs::File::create(&archive_path).context("create sample.zip for archive listing");
        let mut writer = ZipWriter::new(archive_file);
        let options = SimpleFileOptions::default();
        writer
            .add_directory("docs/", options)
            .context("add docs directory to sample.zip");
        writer
            .start_file("docs/readme.txt", options)
            .context("start docs/readme.txt in sample.zip");
        writer
            .write_all(b"readme")
            .context("write docs/readme.txt in sample.zip");
        writer
            .start_file("root.txt", options)
            .context("start root.txt in sample.zip");
        writer
            .write_all(b"root")
            .context("write root.txt in sample.zip");
        writer.finish().context("finish sample.zip");

        let root_listing = list_archive_directory_blocking(archive_path.clone(), String::new())
            .context("list sample.zip root");
        let root_names: Vec<_> = root_listing
            .entries
            .iter()
            .map(|entry| (entry.name.as_str(), &entry.kind))
            .collect();
        assert_eq!(
            root_names,
            vec![
                ("docs", &EntryKind::Directory),
                ("root.txt", &EntryKind::File)
            ]
        );

        let docs_listing = list_archive_directory_blocking(archive_path, "docs".to_string())
            .context("list sample.zip docs/");
        let docs_names: Vec<_> = docs_listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(docs_names, vec!["readme.txt"]);
    }

    #[test]
    fn list_tar_archives_returns_immediate_children() {
        let root = temp_dir();
        let archive_path = root.path().join("sample.tar");
        write_sample_tar_archive(&archive_path, false);

        let root_listing = list_archive_directory_blocking(archive_path.clone(), String::new())
            .context("list sample.tar root");
        let root_names: Vec<_> = root_listing
            .entries
            .iter()
            .map(|entry| (entry.name.as_str(), &entry.kind))
            .collect();
        assert_eq!(
            root_names,
            vec![
                ("docs", &EntryKind::Directory),
                ("pixel.png", &EntryKind::File),
                ("root.txt", &EntryKind::File)
            ]
        );

        let docs_listing = list_archive_directory_blocking(archive_path, "docs".to_string())
            .context("list sample.tar docs/");
        let docs_names: Vec<_> = docs_listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();
        assert_eq!(docs_names, vec!["readme.txt"]);
    }

    #[test]
    fn list_tgz_archives_returns_immediate_children() {
        let root = temp_dir();
        let archive_path = root.path().join("sample.tgz");
        write_sample_tar_archive(&archive_path, true);

        let listing = list_archive_directory_blocking(archive_path, String::new())
            .context("list sample.tgz root");
        let names: Vec<_> = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect();

        assert_eq!(names, vec!["docs", "pixel.png", "root.txt"]);
    }

    #[test]
    fn list_empty_archives_returns_no_entries() {
        use zip::ZipWriter;

        let root = temp_dir();
        let zip_path = root.path().join("empty.zip");
        ZipWriter::new(fs::File::create(&zip_path).context("create empty.zip"))
            .finish()
            .context("finish empty.zip");

        let tar_path = root.path().join("empty.tar");
        tar::Builder::new(fs::File::create(&tar_path).context("create empty.tar"))
            .finish()
            .context("finish empty.tar");

        assert!(list_archive_directory_blocking(zip_path, String::new())
            .context("list empty.zip")
            .entries
            .is_empty());
        assert!(list_archive_directory_blocking(tar_path, String::new())
            .context("list empty.tar")
            .entries
            .is_empty());
    }

    #[test]
    fn list_archive_directory_handles_deep_implicit_directories() {
        let root = temp_dir();
        let archive_path = root.path().join("deep.tar");
        let archive_file = fs::File::create(&archive_path).context("create deep.tar");
        let mut builder = tar::Builder::new(archive_file);
        append_tar_file(&mut builder, "a/b/c/d/file.txt", b"deep");
        builder.finish().context("finish deep.tar");

        let root_listing = list_archive_directory_blocking(archive_path.clone(), String::new())
            .context("list deep.tar root");
        assert_eq!(root_listing.entries[0].name, "a");
        assert_eq!(root_listing.entries[0].kind, EntryKind::Directory);

        let c_listing = list_archive_directory_blocking(archive_path, "a/b/c".to_string())
            .context("list deep.tar a/b/c");
        let names: Vec<_> = c_listing
            .entries
            .iter()
            .map(|entry| (entry.name.as_str(), &entry.kind))
            .collect();
        assert_eq!(names, vec![("d", &EntryKind::Directory)]);
    }

    #[test]
    fn extract_archive_creates_archive_named_directory() {
        use zip::{write::SimpleFileOptions, ZipWriter};

        let root = temp_dir();
        let archive_path = root.path().join("sample.zip");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();

        let archive_file = fs::File::create(&archive_path).unwrap();
        let mut writer = ZipWriter::new(archive_file);
        let options = SimpleFileOptions::default();
        writer.add_directory("docs/", options).unwrap();
        writer.start_file("docs/readme.txt", options).unwrap();
        writer.write_all(b"readme").unwrap();
        writer.finish().unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::ExtractArchive,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&archive_path)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 0);
        assert_eq!(
            fs::read_to_string(destination.join("sample").join("docs").join("readme.txt")).unwrap(),
            "readme"
        );
    }

    #[test]
    fn extract_tar_gz_archive_creates_archive_named_directory() {
        let root = temp_dir();
        let archive_path = root.path().join("sample.tar.gz");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();
        write_sample_tar_archive(&archive_path, true);

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::ExtractArchive,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&archive_path)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 0);
        assert_eq!(
            fs::read_to_string(destination.join("sample").join("docs").join("readme.txt")).unwrap(),
            "readme"
        );
    }

    #[test]
    fn extract_tar_archive_rejects_symlink_entries() {
        let root = temp_dir();
        let archive_path = root.path().join("links.tar");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();

        let archive_file = fs::File::create(&archive_path).unwrap();
        let mut builder = tar::Builder::new(archive_file);
        append_tar_file(&mut builder, "safe.txt", b"safe");
        append_tar_symlink(&mut builder, "link.txt", "safe.txt");
        builder.finish().unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::ExtractArchive,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&archive_path)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0].message.contains("links are not allowed"));
        assert!(!destination.join("links").exists());
    }

    #[test]
    fn extract_tar_archive_rejects_special_entries() {
        let root = temp_dir();
        let archive_path = root.path().join("special.tar");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();

        let archive_file = fs::File::create(&archive_path).unwrap();
        let mut builder = tar::Builder::new(archive_file);
        append_tar_file(&mut builder, "safe.txt", b"safe");
        append_tar_fifo(&mut builder, "pipe");
        builder.finish().unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::ExtractArchive,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&archive_path)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0]
            .message
            .contains("special entries are not allowed"));
        assert!(!destination.join("special").exists());
    }

    #[test]
    fn copy_archive_entries_extracts_selected_members() {
        use zip::{write::SimpleFileOptions, ZipWriter};

        let root = temp_dir();
        let archive_path = root.path().join("sample.zip");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();

        let archive_file = fs::File::create(&archive_path).unwrap();
        let mut writer = ZipWriter::new(archive_file);
        let options = SimpleFileOptions::default();
        writer.add_directory("docs/", options).unwrap();
        writer.start_file("docs/readme.txt", options).unwrap();
        writer.write_all(b"readme").unwrap();
        writer.start_file("root.txt", options).unwrap();
        writer.write_all(b"root").unwrap();
        writer.finish().unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![
                FileOperationTarget {
                    path: format!("{}::/root.txt", path_to_string(&archive_path)),
                },
                FileOperationTarget {
                    path: format!("{}::/docs/", path_to_string(&archive_path)),
                },
            ],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 2);
        assert_eq!(result.failed.len(), 0);
        assert_eq!(
            fs::read_to_string(destination.join("root.txt")).unwrap(),
            "root"
        );
        assert_eq!(
            fs::read_to_string(destination.join("docs").join("readme.txt")).unwrap(),
            "readme"
        );
    }

    #[test]
    fn copy_tar_archive_entries_extracts_selected_members() {
        let root = temp_dir();
        let archive_path = root.path().join("sample.tar");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();
        write_sample_tar_archive(&archive_path, false);

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![
                FileOperationTarget {
                    path: format!("{}::/root.txt", path_to_string(&archive_path)),
                },
                FileOperationTarget {
                    path: format!("{}::/docs/", path_to_string(&archive_path)),
                },
            ],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 2);
        assert_eq!(result.failed.len(), 0);
        assert_eq!(
            fs::read_to_string(destination.join("root.txt")).unwrap(),
            "root"
        );
        assert_eq!(
            fs::read_to_string(destination.join("docs").join("readme.txt")).unwrap(),
            "readme"
        );
    }

    #[test]
    fn copy_tar_archive_entry_rejects_symlinks() {
        let root = temp_dir();
        let archive_path = root.path().join("links.tar");
        let destination = root.path().join("destination");
        fs::create_dir(&destination).unwrap();

        let archive_file = fs::File::create(&archive_path).unwrap();
        let mut builder = tar::Builder::new(archive_file);
        append_tar_symlink(&mut builder, "link.txt", "safe.txt");
        builder.finish().unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![FileOperationTarget {
                path: format!("{}::/link.txt", path_to_string(&archive_path)),
            }],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0].message.contains("links are not allowed"));
        assert!(!destination.join("link.txt").exists());
    }

    #[test]
    fn archive_viewer_readers_return_text_and_image_content() {
        use zip::{write::SimpleFileOptions, ZipWriter};

        let root = temp_dir();
        let archive_path = root.path().join("viewer.zip");
        let archive_file = fs::File::create(&archive_path).context("create viewer.zip");
        let mut writer = ZipWriter::new(archive_file);
        let options = SimpleFileOptions::default();
        writer
            .start_file("note.txt", options)
            .context("start note.txt in viewer.zip");
        writer
            .write_all(b"hello archive")
            .context("write note.txt in viewer.zip");
        writer
            .start_file("pixel.png", options)
            .context("start pixel.png in viewer.zip");
        writer
            .write_all(&[137, 80, 78, 71])
            .context("write pixel.png in viewer.zip");
        writer.finish().context("finish viewer.zip");

        let text = read_archive_text_file_blocking(format!(
            "{}::/note.txt",
            path_to_string(&archive_path)
        ))
        .context("read text member from viewer.zip");
        assert_eq!(text.content, "hello archive");
        assert_eq!(text.encoding, "UTF-8");

        let image = read_archive_image_file_blocking(format!(
            "{}::/pixel.png",
            path_to_string(&archive_path)
        ))
        .context("read image member from viewer.zip");
        assert_eq!(image.mime_type, "image/png");
        assert!(image.data_url.ends_with("iVBORw=="));
    }

    #[test]
    fn tar_archive_viewer_readers_return_text_and_image_content() {
        let root = temp_dir();
        let archive_path = root.path().join("viewer.tar");
        write_sample_tar_archive(&archive_path, false);

        let text = read_archive_text_file_blocking(format!(
            "{}::/docs/readme.txt",
            path_to_string(&archive_path)
        ))
        .context("read text member from viewer.tar");
        assert_eq!(text.content, "readme");
        assert_eq!(text.encoding, "UTF-8");

        let image = read_archive_image_file_blocking(format!(
            "{}::/pixel.png",
            path_to_string(&archive_path)
        ))
        .context("read image member from viewer.tar");
        assert_eq!(image.mime_type, "image/png");
        assert!(image.data_url.ends_with("iVBORw=="));
    }

    #[test]
    fn archive_entry_readers_report_missing_entries_and_size_limits() {
        let root = temp_dir();
        let archive_path = root.path().join("viewer.tar");
        write_sample_tar_archive(&archive_path, false);

        let missing =
            read_archive_entry_bytes(&archive_path, "missing.txt", IMAGE_VIEWER_MAX_BYTES)
                .unwrap_err();
        assert!(missing.contains("was not found"));

        let too_large = read_archive_entry_bytes(&archive_path, "root.txt", 2).unwrap_err();
        assert!(too_large.contains("too large"));
    }

    #[test]
    fn parse_archive_entry_path_rejects_invalid_paths() {
        assert!(parse_archive_entry_path("plain/path.txt").is_none());
        assert!(parse_archive_entry_path("archive.zip:/inner.txt").is_none());
        assert_eq!(
            parse_archive_entry_path("archive.zip::/inner.txt"),
            Some((PathBuf::from("archive.zip"), "inner.txt".to_string()))
        );
    }

    #[test]
    fn search_directory_filters_by_regex_and_kind() {
        let root = temp_dir();
        let root_path = root.path();
        fs::write(root_path.join("alpha.txt"), "alpha").unwrap();
        fs::write(root_path.join("beta.md"), "beta").unwrap();
        fs::create_dir(root_path.join("docs")).unwrap();

        let listing = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root_path),
            name_regex: r"\.txt$".to_string(),
            recursive: false,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: Some("all".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        })
        .unwrap();

        assert_eq!(listing.entries.len(), 1);
        assert_eq!(listing.entries[0].name, "alpha.txt");

        let directories = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root_path),
            name_regex: "docs".to_string(),
            recursive: false,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: Some("directory".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        })
        .unwrap();

        assert_eq!(directories.entries.len(), 1);
        assert_eq!(directories.entries[0].name, "docs");
    }

    #[test]
    fn search_directory_rejects_invalid_regex() {
        let root = temp_dir();
        let result = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root.path()),
            name_regex: "[".to_string(),
            recursive: false,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: Some("all".to_string()),
            hidden_mode: Some("exclude".to_string()),
            readonly_mode: Some("any".to_string()),
        });

        assert!(result.is_err());
        let error = result.err().unwrap();
        assert!(error.contains("Invalid name regex"));
    }

    #[test]
    fn search_directory_does_not_recurse_when_recursive_is_false() {
        let root = temp_dir();
        let root_path = root.path();
        fs::write(root_path.join("alpha.txt"), "alpha").unwrap();
        fs::create_dir(root_path.join("child")).unwrap();
        fs::write(root_path.join("child").join("nested.txt"), "nested").unwrap();

        let listing = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root_path),
            name_regex: r"\.txt$".to_string(),
            recursive: false,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: Some("all".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        })
        .unwrap();

        assert_eq!(listing.entries.len(), 1);
        assert_eq!(listing.entries[0].name, "alpha.txt");
    }

    #[test]
    fn search_directory_recurses_when_requested() {
        let root = temp_dir();
        let root_path = root.path();
        fs::write(root_path.join("alpha.txt"), "alpha").unwrap();
        fs::create_dir(root_path.join("child")).unwrap();
        fs::write(root_path.join("child").join("nested.txt"), "nested").unwrap();

        let listing = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root_path),
            name_regex: r"\.txt$".to_string(),
            recursive: true,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: Some("file".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        })
        .unwrap();

        let names = listing
            .entries
            .iter()
            .map(|entry| entry.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["alpha.txt", "nested.txt"]);
        let nested_path = root_path.join("child").join("nested.txt");
        assert!(listing
            .entries
            .iter()
            .any(|entry| PathBuf::from(&entry.path) == nested_path));
        assert!(listing.query_label.contains("recursive"));
    }

    #[test]
    fn search_directory_filters_by_size_and_modified_range() {
        let root = temp_dir();
        let root_path = root.path();
        fs::write(root_path.join("small.txt"), "123").unwrap();
        fs::write(root_path.join("large.txt"), "1234567890").unwrap();

        let now = std::time::SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_secs();
        let listing = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root_path),
            name_regex: r"\.txt$".to_string(),
            recursive: false,
            min_size_bytes: Some(4),
            max_size_bytes: Some(20),
            modified_after: Some(now - 60),
            modified_before: Some(now + 60),
            kind: Some("file".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        })
        .unwrap();

        assert_eq!(listing.entries.len(), 1);
        assert_eq!(listing.entries[0].name, "large.txt");
    }

    #[test]
    fn search_directory_rejects_invalid_ranges() {
        let root = temp_dir();
        let result = search_directory_blocking(SearchDirectoryRequest {
            root_path: path_to_string(root.path()),
            name_regex: "".to_string(),
            recursive: false,
            min_size_bytes: Some(20),
            max_size_bytes: Some(4),
            modified_after: None,
            modified_before: None,
            kind: Some("all".to_string()),
            hidden_mode: Some("include".to_string()),
            readonly_mode: Some("any".to_string()),
        });

        assert!(result.is_err());
        assert!(result.err().unwrap().contains("min size"));
    }

    #[test]
    fn read_text_file_returns_content_and_truncation_state() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("note.txt");
        fs::write(&file, "line 1\nline 2").context("write text viewer sample");

        let content = read_text_file_blocking(file).context("read text viewer sample");

        assert_eq!(content.content, "line 1\nline 2");
        assert_eq!(content.encoding, "UTF-8");
        assert!(!content.truncated);
    }

    #[test]
    fn read_text_file_decodes_utf8_bom_content() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("utf8-bom.txt");
        fs::write(&file, [0xef, 0xbb, 0xbf, b'h', b'e', b'l', b'l', b'o'])
            .context("write UTF-8 BOM sample");

        let content = read_text_file_blocking(file).context("read UTF-8 BOM sample");

        assert_eq!(content.content, "hello");
        assert_eq!(content.encoding, "UTF-8");
    }

    #[test]
    fn read_text_file_decodes_shift_jis_content() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("sjis.txt");
        fs::write(&file, [0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea]).context("write Shift_JIS sample");

        let content = read_text_file_blocking(file).context("read Shift_JIS sample");

        assert_eq!(content.content, "日本語");
        assert_eq!(content.encoding, "Shift_JIS");
    }

    #[test]
    fn read_text_file_decodes_euc_jp_content() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("euc.txt");
        fs::write(&file, [0xc6, 0xfc, 0xcb, 0xdc, 0xb8, 0xec]).context("write EUC-JP sample");

        let content = read_text_file_blocking(file).context("read EUC-JP sample");

        assert_eq!(content.content, "日本語");
        assert_eq!(content.encoding, "EUC-JP");
    }

    #[test]
    fn read_text_file_decodes_iso_2022_jp_content() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("jis.txt");
        fs::write(
            &file,
            [
                0x1b, 0x24, 0x42, 0x46, 0x7c, 0x4b, 0x5c, 0x38, 0x6c, 0x1b, 0x28, 0x42,
            ],
        )
        .context("write ISO-2022-JP sample");

        let content = read_text_file_blocking(file).context("read ISO-2022-JP sample");

        assert_eq!(content.content, "日本語");
        assert_eq!(content.encoding, "ISO-2022-JP");
    }

    #[test]
    fn read_text_file_truncates_large_content() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("large.log");
        fs::write(&file, vec![b'a'; TEXT_VIEWER_MAX_BYTES as usize + 1])
            .context("write large text viewer sample");

        let content = read_text_file_blocking(file).context("read large text viewer sample");

        assert_eq!(content.content.len(), TEXT_VIEWER_MAX_BYTES as usize);
        assert!(content.truncated);
    }

    #[test]
    fn open_path_rejects_missing_paths() {
        let root = temp_dir();
        let missing = root.path().join("missing.txt");

        let result = open_path_blocking(missing);

        assert!(result.is_err());
    }

    #[test]
    fn prepare_open_path_resolves_url_like_file_names_as_local_paths() {
        let root = temp_dir();
        let target = root.path().join("javascript:alert(1)");
        fs::write(&target, "local").context("write url-like local file");

        let resolved = prepare_open_path(target).context("prepare url-like local file");

        assert!(resolved.is_absolute());
        assert_eq!(
            resolved.file_name().and_then(|name| name.to_str()),
            Some("javascript:alert(1)")
        );
    }

    #[test]
    fn read_image_file_returns_data_url() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("pixel.png");
        fs::write(&file, [137, 80, 78, 71]).context("write image viewer sample");

        let content = read_image_file_blocking(file).context("read image viewer sample");

        assert_eq!(content.mime_type, "image/png");
        assert!(content.data_url.starts_with("data:image/png;base64,"));
        assert!(content.data_url.ends_with("iVBORw=="));
    }

    #[test]
    fn encode_base64_pads_short_inputs() {
        assert_eq!(encode_base64(b""), "");
        assert_eq!(encode_base64(b"f"), "Zg==");
        assert_eq!(encode_base64(b"fo"), "Zm8=");
        assert_eq!(encode_base64(b"foo"), "Zm9v");
    }

    #[test]
    fn terminal_cwd_accepts_existing_directories() {
        let root = temp_dir();
        let root = root.path();

        let result = terminal_cwd(&path_to_string(root)).context("resolve terminal cwd");

        assert_eq!(result, root);
    }

    #[test]
    fn terminal_cwd_rejects_missing_directories() {
        let root = temp_dir();
        let missing = root.path().join("missing");

        let result = terminal_cwd(&path_to_string(&missing));

        assert!(result.is_err());
    }

    #[test]
    fn sftp_connection_request_validation_rejects_missing_required_fields() {
        assert!(
            validate_sftp_connection_request("", 22, "user", "password", "password", None)
                .unwrap_err()
                .contains("host")
        );
        assert!(validate_sftp_connection_request(
            "example.com",
            0,
            "user",
            "password",
            "password",
            None
        )
        .unwrap_err()
        .contains("port"));
        assert!(validate_sftp_connection_request(
            "example.com",
            22,
            "",
            "password",
            "password",
            None
        )
        .unwrap_err()
        .contains("username"));
        assert!(
            validate_sftp_connection_request("example.com", 22, "user", "password", "", None)
                .unwrap_err()
                .contains("password")
        );
        assert!(validate_sftp_connection_request(
            "example.com",
            22,
            "user",
            "privateKey",
            "",
            None
        )
        .unwrap_err()
        .contains("private key"));
    }

    #[test]
    fn sftp_remote_path_defaults_to_absolute_root() {
        assert_eq!(normalized_sftp_remote_path(None), "/");
        assert_eq!(normalized_sftp_remote_path(Some("")), "/");
        assert_eq!(normalized_sftp_remote_path(Some("var/log")), "/var/log");
        assert_eq!(
            normalized_sftp_remote_path(Some("/home/user")),
            "/home/user"
        );
    }

    #[test]
    fn sftp_remote_path_helpers_build_child_paths() {
        assert_eq!(join_sftp_remote_path("/", "logs"), "/logs");
        assert_eq!(join_sftp_remote_path("/var", "logs"), "/var/logs");
    }

    #[test]
    fn sftp_uri_helpers_parse_connection_and_parent_paths() {
        assert_eq!(
            parse_sftp_uri("sftp://sftp-1/home/user").context("parse SFTP URI"),
            ("sftp-1".to_string(), "/home/user".to_string())
        );
        assert_eq!(
            sftp_remote_leaf_name("/home/user/file.txt").as_deref(),
            Some("file.txt")
        );
        assert_eq!(
            sftp_parent_remote_path("/home/user/file.txt").as_deref(),
            Some("/home/user")
        );
        assert_eq!(sftp_parent_remote_path("/"), None);
    }

    #[test]
    fn expand_user_path_expands_tilde_prefix() {
        let expanded = expand_user_path("~/.ssh/id_ed25519");
        assert!(expanded.ends_with(".ssh/id_ed25519"));
        assert_ne!(expanded, PathBuf::from("~/.ssh/id_ed25519"));
    }

    #[test]
    fn location_profiles_round_trip_sftp_profiles() {
        let root = temp_dir();
        let path = root.path().join("locations.json");
        let profiles = LocationProfilesFile {
            local_favorites: vec![LocalFavoriteProfile {
                id: "local-1".to_string(),
                name: "work".to_string(),
                path: path_to_string(root.path()),
            }],
            search_profiles: vec![SearchProfile {
                id: "search-1".to_string(),
                name: "text files".to_string(),
                root_path: path_to_string(root.path()),
                name_regex: "\\.txt$".to_string(),
                recursive: true,
                min_size_bytes: Some(1024),
                max_size_bytes: Some(1024 * 1024),
                modified_after: None,
                modified_before: None,
                kind: Some("file".to_string()),
                hidden_mode: Some("exclude".to_string()),
                readonly_mode: Some("any".to_string()),
            }],
            sftp_profiles: vec![SftpConnectionProfile {
                id: "profile-1".to_string(),
                name: "example".to_string(),
                host: "example.com".to_string(),
                port: 22,
                username: "user".to_string(),
                remote_path: "/home/user".to_string(),
                auth_kind: "privateKey".to_string(),
                private_key_path: Some("/Users/user/.ssh/id_ed25519".to_string()),
            }],
        };

        save_location_profiles_to_path(&path, &profiles).context("save location profiles fixture");
        let loaded =
            load_location_profiles_from_path(&path).context("load saved location profiles fixture");
        assert_eq!(loaded.local_favorites.len(), 1);
        assert_eq!(loaded.local_favorites[0].name, "work");
        assert_eq!(loaded.search_profiles.len(), 1);
        assert_eq!(loaded.search_profiles[0].name, "text files");
        assert_eq!(loaded.search_profiles[0].name_regex, "\\.txt$");
        assert!(loaded.search_profiles[0].recursive);
        assert_eq!(loaded.sftp_profiles.len(), 1);
        assert_eq!(loaded.sftp_profiles[0].name, "example");
        assert_eq!(loaded.sftp_profiles[0].remote_path, "/home/user");
        assert_eq!(loaded.sftp_profiles[0].auth_kind, "privateKey");
        assert_eq!(
            loaded.sftp_profiles[0].private_key_path.as_deref(),
            Some("/Users/user/.ssh/id_ed25519")
        );

        delete_local_favorite_profile_from_path(&path, "local-1")
            .context("delete local favorite profile");
        let loaded = load_location_profiles_from_path(&path)
            .context("reload profiles after local favorite delete");
        assert!(loaded.local_favorites.is_empty());
        assert_eq!(loaded.search_profiles.len(), 1);

        delete_search_profile_from_path(&path, "search-1").context("delete search profile");
        let loaded = load_location_profiles_from_path(&path)
            .context("reload profiles after search profile delete");
        assert!(loaded.search_profiles.is_empty());

        delete_sftp_connection_profile_from_path(&path, "profile-1").context("delete SFTP profile");
        let loaded = load_location_profiles_from_path(&path)
            .context("reload profiles after SFTP profile delete");
        assert!(loaded.sftp_profiles.is_empty());
    }

    #[test]
    fn app_settings_create_default_and_round_trip() {
        let root = temp_dir();

        let loaded = load_app_settings_from_dir(root.path()).context("create default settings");
        assert!(loaded.use_trash);
        assert!(loaded.operation_result.show_status);
        assert!(loaded.operation_result.show_failure_dialog);
        assert!(!loaded.operation_result.print_to_terminal);
        assert!(loaded.operation_result.save_failure_log);
        assert!(root.path().join("settings/operation.json").exists());
        assert!(root.path().join("settings/sftp.json").exists());
        assert!(root.path().join("settings/appearance.json").exists());
        assert!(root.path().join("settings/keybind.json").exists());
        assert!(root.path().join("settings/language.json").exists());

        let settings = AppSettings {
            use_trash: false,
            operation_result: OperationResultSettings {
                print_to_terminal: true,
                ..OperationResultSettings::default()
            },
            operation_cancel: Default::default(),
            sftp_session: SftpSessionSettings::default(),
            sftp_transfer: Default::default(),
        };
        save_app_settings_to_dir(root.path(), &settings).context("save operation settings");
        let loaded = load_app_settings_from_dir(root.path()).context("reload operation settings");
        assert!(!loaded.use_trash);
        assert!(loaded.operation_result.print_to_terminal);
    }

    #[test]
    fn app_settings_migrates_legacy_settings_json_to_split_files() {
        let root = temp_dir();
        let legacy_path = root.path().join("settings.json");
        fs::write(
            &legacy_path,
            "{\n  \"useTrash\": false,\n  \"operationResult\": { \"printToTerminal\": true }\n}",
        )
        .context("write legacy settings.json fixture");

        let loaded =
            load_app_settings_from_dir(root.path()).context("migrate legacy settings.json");
        assert!(!loaded.use_trash);
        assert!(loaded.operation_result.show_status);
        assert!(loaded.operation_result.show_failure_dialog);
        assert!(loaded.operation_result.print_to_terminal);
        assert!(loaded.operation_result.save_failure_log);
        assert!(root.path().join("settings/operation.json").exists());
        assert!(root.path().join("settings/sftp.json").exists());
        assert!(root.path().join("settings/appearance.json").exists());
        assert!(root.path().join("settings/keybind.json").exists());
        assert!(root.path().join("settings/language.json").exists());

        let content = read_to_string(&root.path().join("settings/operation.json"));
        assert!(content.contains("operationResult"));
        assert!(content.contains("printToTerminal"));
    }

    #[test]
    fn customization_settings_create_defaults() {
        let root = temp_dir();

        load_app_settings_from_dir(root.path()).context("create split customization settings");

        let appearance = read_to_string(&root.path().join("settings/appearance.json"));
        assert!(appearance.contains("uiFamily"));
        assert!(appearance.contains("terminal.background"));
        assert!(appearance.contains("dialog.inputBackground"));
        assert!(appearance.contains("entry.filterKeptBackground"));
        assert!(appearance.contains("terminal.selectionBackground"));
        assert!(appearance.contains("extensionColors"));
        assert!(appearance.contains(".svelte"));

        let keybind = read_to_string(&root.path().join("settings/keybind.json"));
        assert!(keybind.contains("bindings"));
        assert!(keybind.contains("lockedBindings"));
        assert!(keybind.contains("pane.moveUpAlternative"));
        assert!(keybind.contains("dialog.confirm"));

        let language = read_to_string(&root.path().join("settings/language.json"));
        assert!(language.contains("\"locale\""));
        assert!(language.contains("operation.confirmTitle"));
    }

    #[test]
    fn legacy_app_settings_path_still_normalizes_missing_defaults() {
        let root = temp_dir();
        let path = root.path().join("settings.json");
        fs::write(&path, "{\n  \"useTrash\": true\n}")
            .context("write legacy settings with missing defaults");

        let loaded =
            load_app_settings_from_path(&path).context("normalize legacy settings defaults");
        assert!(loaded.operation_result.show_status);
        assert!(loaded.operation_result.show_failure_dialog);
        assert!(!loaded.operation_result.print_to_terminal);
        assert!(loaded.operation_result.save_failure_log);

        let content = read_to_string(&path);
        assert!(content.contains("operationResult"));
        assert!(content.contains("sftpSession"));
    }

    #[test]
    fn operation_failure_log_appends_failed_items() {
        let root = temp_dir();
        let path = root.path().join("operation-failures.log");
        let items = vec![FileOperationResultItem {
            path: "/tmp/example.txt".to_string(),
            message: "permission denied".to_string(),
        }];

        save_operation_failure_log_to_path(&path, "Delete", &items)
            .context("append operation failure log");
        let content = read_to_string(&path);
        assert!(content.contains("Delete: 1 failed"));
        assert!(content.contains("/tmp/example.txt: permission denied"));
    }

    #[test]
    fn external_commands_create_defaults_and_validate() {
        let root = temp_dir();
        let path = root.path().join("commands.json");

        let loaded =
            load_external_commands_from_path(&path).context("create default commands.json");
        assert_eq!(loaded.commands.len(), 10);
        assert_eq!(loaded.commands[0].id, "echo-selected-paths");
        assert!(loaded
            .commands
            .iter()
            .any(|command| command.template.contains("{otherMarked}")));
        assert!(loaded
            .commands
            .iter()
            .any(|command| command.argument_mode.as_deref() == Some("repeat")));
        assert!(loaded
            .commands
            .iter()
            .any(|command| command.argument_mode.as_deref() == Some("join")));
        assert!(path.exists());

        let invalid = ExternalCommandsFile {
            commands: vec![ExternalCommandDefinition {
                id: "invalid".to_string(),
                name: "Invalid".to_string(),
                description: String::new(),
                template: String::new(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: None,
            }],
        };
        assert!(save_external_commands_to_path(&path, &invalid).is_err());
    }

    #[test]
    fn external_commands_accept_list_format_and_missing_description() {
        let root = temp_dir();
        let path = root.path().join("commands.json");
        fs::write(
            &path,
            r#"[
  {
    "id": "sample",
    "name": "Sample",
    "template": "printf '%s\n' {args}"
  }
]"#,
        )
        .context("write list-format commands.json fixture");

        let loaded =
            load_external_commands_from_path(&path).context("load list-format commands.json");
        assert_eq!(loaded.commands.len(), 1);
        assert_eq!(loaded.commands[0].id, "sample");
        assert_eq!(loaded.commands[0].description, "");
    }

    #[cfg(target_os = "windows")]
    #[test]
    fn validate_file_name_rejects_windows_reserved_names() {
        assert!(validate_file_name("CON").is_err());
        assert!(validate_file_name("COM1.txt").is_err());
        assert!(validate_file_name("LPT9").is_err());
    }

    #[test]
    fn parent_directory_returns_parent_path() {
        let root = temp_dir();
        let root = root.path();
        let child = root.join("child");
        fs::create_dir(&child).unwrap();

        assert_eq!(
            parent_directory(path_to_string(&child)).unwrap(),
            Some(path_to_string(&root))
        );
    }

    #[test]
    fn root_directory_returns_top_level_path() {
        let root = temp_dir();
        let child = root.path().join("child");
        fs::create_dir(&child).unwrap();

        let mut expected = child.as_path();
        while let Some(parent) = expected.parent() {
            expected = parent;
        }

        assert_eq!(
            root_directory(path_to_string(&child)).unwrap(),
            path_to_string(expected)
        );
    }

    #[cfg(unix)]
    #[test]
    fn list_directory_classifies_symlinks() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let root = root.path();
        let target_file = root.join("target.txt");
        let link_file = root.join("link.txt");
        fs::write(&target_file, "target").unwrap();
        symlink(&target_file, &link_file).unwrap();

        let listing = list_directory(path_to_string(&root)).unwrap();
        let symlink_entry = listing
            .entries
            .iter()
            .find(|entry| entry.name == "link.txt")
            .expect("symlink should be listed");

        assert!(matches!(symlink_entry.kind, EntryKind::Symlink));
    }

    #[test]
    fn copy_skips_existing_destination_names() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join("new.txt"), "new").unwrap();
        fs::write(source.join("existing.txt"), "source").unwrap();
        fs::write(destination.join("existing.txt"), "destination").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![
                target(&source.join("new.txt")),
                target(&source.join("existing.txt")),
            ],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 1);
        assert_eq!(
            fs::read_to_string(destination.join("new.txt")).unwrap(),
            "new"
        );
        assert_eq!(
            fs::read_to_string(destination.join("existing.txt")).unwrap(),
            "destination"
        );
    }

    #[test]
    fn copy_job_honors_pre_requested_cancellation_at_item_boundary() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join("a.txt"), "a").unwrap();
        fs::write(source.join("b.txt"), "b").unwrap();

        let cancellation = Arc::new(AtomicBool::new(true));
        let result = execute_file_operation_job_blocking_with_cancellation(
            FileOperationJob {
                id: None,
                kind: FileOperationKind::Copy,
                destination_path: Some(path_to_string(&destination)),
                targets: vec![target(&source.join("a.txt")), target(&source.join("b.txt"))],
                requested_name: None,
                sftp_safe_transfer_part_threshold_bytes: None,
            },
            cancellation,
        );

        assert!(result.canceled);
        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 0);
        assert!(!destination.join("a.txt").exists());
        assert!(!destination.join("b.txt").exists());
    }

    #[test]
    fn copy_directory_into_own_descendant_is_blocked() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let child = source.join("child");
        fs::create_dir_all(&child).unwrap();
        fs::write(source.join("payload.txt"), "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&child)),
            targets: vec![target(&source)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0]
            .message
            .contains("Cannot copy a directory into itself"));
        assert!(!child.join("source").exists());
    }

    #[test]
    fn create_archive_writes_zip_tar_and_targz() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(source.join("docs")).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join("docs/readme.txt"), "readme").unwrap();
        fs::write(source.join("root.txt"), "root").unwrap();

        for archive_name in ["created.zip", "created.tar", "created.tar.gz"] {
            let result = execute_file_operation_job_blocking(FileOperationJob {
                id: None,
                kind: FileOperationKind::CreateArchive,
                destination_path: Some(path_to_string(&destination)),
                targets: vec![target(&source)],
                requested_name: Some(archive_name.to_string()),
                sftp_safe_transfer_part_threshold_bytes: None,
            });

            assert_eq!(result.succeeded.len(), 1, "{archive_name}");
            assert_eq!(result.failed.len(), 0, "{archive_name}");
            assert!(destination.join(archive_name).is_file());
        }

        let zip_file = fs::File::open(destination.join("created.zip")).unwrap();
        let mut zip = zip::ZipArchive::new(zip_file).unwrap();
        let mut readme = String::new();
        zip.by_name("source/docs/readme.txt")
            .unwrap()
            .read_to_string(&mut readme)
            .unwrap();
        assert_eq!(readme, "readme");

        let listing = list_archive_directory(
            path_to_string(destination.join("created.tar.gz")),
            "".to_string(),
        )
        .unwrap();
        assert!(listing.entries.iter().any(|entry| entry.name == "source"));
    }

    #[test]
    fn create_archive_rejects_unsupported_names_and_self_containment() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        fs::create_dir_all(&source).unwrap();
        fs::write(source.join("payload.txt"), "payload").unwrap();

        let unsupported = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::CreateArchive,
            destination_path: Some(path_to_string(root)),
            targets: vec![target(&source.join("payload.txt"))],
            requested_name: Some("payload.rar".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(unsupported.succeeded.len(), 0);
        assert_eq!(unsupported.failed.len(), 1);
        assert!(unsupported.failed[0].message.contains(".zip"));

        let self_contained = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::CreateArchive,
            destination_path: Some(path_to_string(&source)),
            targets: vec![target(&source)],
            requested_name: Some("inside.zip".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(self_contained.succeeded.len(), 0);
        assert_eq!(self_contained.failed.len(), 1);
        assert!(self_contained.failed[0]
            .message
            .contains("inside a selected source directory"));
    }

    #[cfg(unix)]
    #[test]
    fn copy_preserves_symlink_entries() {
        use std::os::unix::fs::symlink;

        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        fs::write(source.join("target.txt"), "target").unwrap();
        symlink("target.txt", source.join("link.txt")).unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Copy,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&source.join("link.txt"))],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 0);
        assert!(fs::symlink_metadata(destination.join("link.txt"))
            .unwrap()
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_link(destination.join("link.txt")).unwrap(),
            PathBuf::from("target.txt")
        );
    }

    #[test]
    fn move_transfers_file_to_destination() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let destination = root.join("destination");
        fs::create_dir_all(&source).unwrap();
        fs::create_dir_all(&destination).unwrap();
        let source_file = source.join("move-me.txt");
        fs::write(&source_file, "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Move,
            destination_path: Some(path_to_string(&destination)),
            targets: vec![target(&source_file)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 0);
        assert!(!source_file.exists());
        assert_eq!(
            fs::read_to_string(destination.join("move-me.txt")).unwrap(),
            "payload"
        );
    }

    #[test]
    fn move_directory_into_own_descendant_is_blocked() {
        let root = temp_dir();
        let root = root.path();
        let source = root.join("source");
        let child = source.join("child");
        fs::create_dir_all(&child).unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Move,
            destination_path: Some(path_to_string(&child)),
            targets: vec![target(&source)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0]
            .message
            .contains("Cannot move a directory into itself"));
        assert!(source.exists());
    }

    #[test]
    fn rename_and_mkdir_use_requested_name() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("before.txt");
        fs::write(&file, "payload").unwrap();

        let mkdir_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Mkdir,
            destination_path: Some(path_to_string(&root)),
            targets: vec![],
            requested_name: Some("created".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(mkdir_result.succeeded.len(), 1);
        assert!(root.join("created").is_dir());

        let rename_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Rename,
            destination_path: Some(path_to_string(&root)),
            targets: vec![target(&file)],
            requested_name: Some("after.txt".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(rename_result.succeeded.len(), 1);
        assert!(!file.exists());
        assert_eq!(
            fs::read_to_string(root.join("after.txt")).unwrap(),
            "payload"
        );

        let create_file_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::CreateFile,
            destination_path: Some(path_to_string(&root)),
            targets: vec![],
            requested_name: Some("empty.txt".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(create_file_result.succeeded.len(), 1);
        assert!(root.join("empty.txt").is_file());
        assert_eq!(fs::read_to_string(root.join("empty.txt")).unwrap(), "");
    }

    #[test]
    fn rename_mkdir_and_create_file_reject_path_like_names() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("before.txt");
        fs::write(&file, "payload").unwrap();

        let rename_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Rename,
            destination_path: Some(path_to_string(root)),
            targets: vec![target(&file)],
            requested_name: Some("nested/after.txt".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(rename_result.succeeded.len(), 0);
        assert_eq!(rename_result.failed.len(), 1);
        assert!(rename_result.failed[0].message.contains("path separators"));

        let mkdir_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Mkdir,
            destination_path: Some(path_to_string(root)),
            targets: vec![],
            requested_name: Some("nested/created".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(mkdir_result.succeeded.len(), 0);
        assert_eq!(mkdir_result.failed.len(), 1);
        assert!(mkdir_result.failed[0].message.contains("path separators"));

        let create_file_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::CreateFile,
            destination_path: Some(path_to_string(root)),
            targets: vec![],
            requested_name: Some("nested/created.txt".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(create_file_result.succeeded.len(), 0);
        assert_eq!(create_file_result.failed.len(), 1);
        assert!(create_file_result.failed[0]
            .message
            .contains("path separators"));
    }

    #[test]
    fn undo_remove_empty_file_and_directory_are_conservative() {
        let root = temp_dir();
        let root = root.path();
        let empty_file = root.join("empty.txt");
        let non_empty_file = root.join("payload.txt");
        let empty_dir = root.join("empty-dir");
        let non_empty_dir = root.join("non-empty-dir");
        fs::write(&empty_file, "").unwrap();
        fs::write(&non_empty_file, "payload").unwrap();
        fs::create_dir(&empty_dir).unwrap();
        fs::create_dir(&non_empty_dir).unwrap();
        fs::write(non_empty_dir.join("child.txt"), "payload").unwrap();

        let empty_file_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::RemoveEmptyFile,
            destination_path: None,
            targets: vec![target(&empty_file)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(empty_file_result.succeeded.len(), 1);
        assert!(!empty_file.exists());

        let non_empty_file_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::RemoveEmptyFile,
            destination_path: None,
            targets: vec![target(&non_empty_file)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(non_empty_file_result.succeeded.len(), 0);
        assert_eq!(non_empty_file_result.failed.len(), 1);
        assert!(non_empty_file.exists());

        let empty_dir_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::RemoveEmptyDirectory,
            destination_path: None,
            targets: vec![target(&empty_dir)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(empty_dir_result.succeeded.len(), 1);
        assert!(!empty_dir.exists());

        let non_empty_dir_result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::RemoveEmptyDirectory,
            destination_path: None,
            targets: vec![target(&non_empty_dir)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });
        assert_eq!(non_empty_dir_result.succeeded.len(), 0);
        assert_eq!(non_empty_dir_result.failed.len(), 1);
        assert!(non_empty_dir.exists());
    }

    #[test]
    fn delete_removes_files_permanently() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("delete-me.txt");
        fs::write(&file, "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Delete,
            destination_path: None,
            targets: vec![target(&file)],
            requested_name: None,
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 1);
        assert_eq!(result.failed.len(), 0);
        assert!(!file.exists());
    }

    #[test]
    fn chmod_changes_local_permissions_on_unix() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("mode-me.txt");
        fs::write(&file, "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Chmod,
            destination_path: None,
            targets: vec![target(&file)],
            requested_name: Some("600".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            assert_eq!(result.succeeded.len(), 1);
            assert_eq!(result.failed.len(), 0);
            assert_eq!(
                fs::metadata(&file).unwrap().permissions().mode() & 0o777,
                0o600
            );
        }

        #[cfg(not(unix))]
        {
            assert_eq!(result.succeeded.len(), 0);
            assert_eq!(result.failed.len(), 1);
        }
    }

    #[test]
    fn chmod_rejects_invalid_modes() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("mode-me.txt");
        fs::write(&file, "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::Chmod,
            destination_path: None,
            targets: vec![target(&file)],
            requested_name: Some("999".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        assert_eq!(result.succeeded.len(), 0);
        assert_eq!(result.failed.len(), 1);
        assert!(result.failed[0].message.contains("octal"));
    }

    #[test]
    fn windows_attribute_operation_is_platform_specific() {
        let root = temp_dir();
        let root = root.path();
        let file = root.join("attr-me.txt");
        fs::write(&file, "payload").unwrap();

        let result = execute_file_operation_job_blocking(FileOperationJob {
            id: None,
            kind: FileOperationKind::WindowsAttributes,
            destination_path: None,
            targets: vec![target(&file)],
            requested_name: Some("readonly=on hidden=keep".to_string()),
            sftp_safe_transfer_part_threshold_bytes: None,
        });

        #[cfg(target_os = "windows")]
        {
            assert_eq!(result.succeeded.len(), 1);
            assert_eq!(result.failed.len(), 0);
            assert!(fs::metadata(&file).unwrap().permissions().readonly());
        }

        #[cfg(not(target_os = "windows"))]
        {
            assert_eq!(result.succeeded.len(), 0);
            assert_eq!(result.failed.len(), 1);
            assert!(result.failed[0].message.contains("Windows"));
        }
    }
}
