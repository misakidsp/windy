use crate::archive::{
    archive_creation_canceled_message, copy_archive_entry_to_directory,
    create_archive_from_sources, extract_archive_to_directory, parse_archive_entry_path,
};
use crate::path_utils::{format_io_error, path_to_string};
use crate::sftp::{
    is_sftp_uri, join_sftp_remote_path, normalized_sftp_remote_path, parse_sftp_uri,
    sftp_entry_kind, sftp_parent_remote_path, sftp_remote_leaf_name, SftpState,
    SharedSftpConnection,
};
use crate::EntryKind;
use serde::{Deserialize, Serialize};
use ssh2::{OpenFlags, OpenType};
use std::{
    collections::HashMap,
    fs,
    fs::OpenOptions,
    io::{self, Read, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
};
use tauri::State;

const OPERATION_CANCELED_MESSAGE: &str = "Operation canceled.";
const COPY_BUFFER_SIZE: usize = 1024 * 1024;

#[derive(Default)]
pub(crate) struct OperationCancellationState {
    flags: Mutex<HashMap<String, Arc<AtomicBool>>>,
}

impl OperationCancellationState {
    fn register(&self, job_id: Option<&str>) -> Arc<AtomicBool> {
        let flag = Arc::new(AtomicBool::new(false));
        let Some(job_id) = job_id else {
            return flag;
        };
        if let Ok(mut flags) = self.flags.lock() {
            flags.insert(job_id.to_string(), Arc::clone(&flag));
        }
        flag
    }

    fn unregister(&self, job_id: Option<&str>) {
        let Some(job_id) = job_id else {
            return;
        };
        if let Ok(mut flags) = self.flags.lock() {
            flags.remove(job_id);
        }
    }

    fn request_cancel(&self, job_id: &str) -> bool {
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileOperationJob {
    #[serde(default)]
    pub(crate) id: Option<String>,
    pub(crate) kind: FileOperationKind,
    pub(crate) destination_path: Option<String>,
    pub(crate) targets: Vec<FileOperationTarget>,
    pub(crate) requested_name: Option<String>,
    #[serde(default)]
    pub(crate) sftp_safe_transfer_part_threshold_bytes: Option<u64>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) enum FileOperationKind {
    Copy,
    Move,
    Rename,
    Chmod,
    WindowsAttributes,
    Trash,
    Delete,
    Mkdir,
    CreateFile,
    RemoveEmptyDirectory,
    RemoveEmptyFile,
    Refresh,
    ExtractArchive,
    CreateArchive,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileOperationTarget {
    pub(crate) path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileOperationResult {
    pub(crate) succeeded: Vec<FileOperationResultItem>,
    pub(crate) failed: Vec<FileOperationResultItem>,
    pub(crate) canceled: bool,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct FileOperationResultItem {
    pub(crate) path: String,
    pub(crate) message: String,
}

#[tauri::command]
pub(crate) async fn execute_file_operation_job(
    state: State<'_, SftpState>,
    cancellation_state: State<'_, OperationCancellationState>,
    job: FileOperationJob,
) -> Result<FileOperationResult, String> {
    let cancellation = cancellation_state.register(job.id.as_deref());
    let job_id = job.id.clone();
    if job_involves_sftp(&job) {
        let mut result = empty_result();
        match job.kind {
            FileOperationKind::Copy => copy_sftp_targets(&state, &job, &mut result, &cancellation),
            FileOperationKind::Rename => rename_sftp_target(&state, &job, &mut result),
            FileOperationKind::Delete => delete_sftp_targets(&state, &job, &mut result),
            FileOperationKind::Mkdir => create_sftp_directory(&state, &job, &mut result),
            FileOperationKind::CreateFile => create_sftp_file(&state, &job, &mut result),
            FileOperationKind::RemoveEmptyDirectory => {
                remove_empty_sftp_directory(&state, &job, &mut result)
            }
            FileOperationKind::RemoveEmptyFile => remove_empty_sftp_file(&state, &job, &mut result),
            FileOperationKind::Chmod => chmod_sftp_targets(&state, &job, &mut result),
            _ => result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: "This SFTP file operation is not implemented yet.".to_string(),
            }),
        }
        cancellation_state.unregister(job_id.as_deref());
        return Ok(result);
    }

    let result = tauri::async_runtime::spawn_blocking(move || {
        execute_file_operation_job_blocking_with_cancellation(job, cancellation)
    })
    .await
    .map_err(|error| format!("File operation task failed: {error}"));
    cancellation_state.unregister(job_id.as_deref());
    result
}

#[tauri::command]
pub(crate) fn cancel_file_operation_job(
    cancellation_state: State<'_, OperationCancellationState>,
    job_id: String,
) -> Result<bool, String> {
    Ok(cancellation_state.request_cancel(&job_id))
}

#[cfg(test)]
pub(crate) fn execute_file_operation_job_blocking(job: FileOperationJob) -> FileOperationResult {
    execute_file_operation_job_blocking_with_cancellation(job, Arc::new(AtomicBool::new(false)))
}

fn empty_result() -> FileOperationResult {
    FileOperationResult {
        succeeded: Vec::new(),
        failed: Vec::new(),
        canceled: false,
    }
}

fn cancellation_requested(
    cancellation: &Arc<AtomicBool>,
    result: &mut FileOperationResult,
) -> bool {
    if cancellation.load(Ordering::SeqCst) {
        result.canceled = true;
        true
    } else {
        false
    }
}

fn cancellation_error(cancellation: &Arc<AtomicBool>) -> Result<(), String> {
    if cancellation.load(Ordering::SeqCst) {
        Err(OPERATION_CANCELED_MESSAGE.to_string())
    } else {
        Ok(())
    }
}

fn mark_canceled_if_needed(message: &str, result: &mut FileOperationResult) -> bool {
    if message == OPERATION_CANCELED_MESSAGE {
        result.canceled = true;
        true
    } else {
        false
    }
}

fn copy_stream_with_cancellation<R: Read, W: Write>(
    reader: &mut R,
    writer: &mut W,
    cancellation: &Arc<AtomicBool>,
) -> Result<u64, String> {
    let mut buffer = vec![0; COPY_BUFFER_SIZE];
    let mut total = 0;
    loop {
        cancellation_error(cancellation)?;
        let read = reader
            .read(&mut buffer)
            .map_err(|error| format!("Read copy stream failed: {error}"))?;
        if read == 0 {
            break;
        }
        cancellation_error(cancellation)?;
        writer
            .write_all(&buffer[..read])
            .map_err(|error| format!("Write copy stream failed: {error}"))?;
        total += read as u64;
    }
    Ok(total)
}

pub(crate) fn execute_file_operation_job_blocking_with_cancellation(
    job: FileOperationJob,
    cancellation: Arc<AtomicBool>,
) -> FileOperationResult {
    let mut result = empty_result();

    match job.kind {
        FileOperationKind::Copy => copy_targets(&job, &mut result, &cancellation),
        FileOperationKind::Move => move_targets(&job, &mut result),
        FileOperationKind::Rename => rename_target(&job, &mut result),
        FileOperationKind::Chmod => chmod_targets(&job, &mut result),
        FileOperationKind::WindowsAttributes => windows_attribute_targets(&job, &mut result),
        FileOperationKind::Trash => trash_targets(&job, &mut result),
        FileOperationKind::Delete => delete_targets(&job, &mut result),
        FileOperationKind::Mkdir => create_directory(&job, &mut result),
        FileOperationKind::CreateFile => create_file(&job, &mut result),
        FileOperationKind::RemoveEmptyDirectory => remove_empty_directory(&job, &mut result),
        FileOperationKind::RemoveEmptyFile => remove_empty_file(&job, &mut result),
        FileOperationKind::ExtractArchive => extract_archives(&job, &mut result, &cancellation),
        FileOperationKind::CreateArchive => create_archive(&job, &mut result, &cancellation),
        FileOperationKind::Refresh => {
            result.succeeded.push(FileOperationResultItem {
                path: job.destination_path.unwrap_or_default(),
                message: "Refresh completed.".to_string(),
            });
        }
    }

    result
}

fn job_involves_sftp(job: &FileOperationJob) -> bool {
    job.destination_path
        .as_deref()
        .map(is_sftp_uri)
        .unwrap_or(false)
        || job.targets.iter().any(|target| is_sftp_uri(&target.path))
}

fn destination_dir(job: &FileOperationJob) -> Result<PathBuf, String> {
    job.destination_path
        .as_ref()
        .map(PathBuf::from)
        .ok_or_else(|| "Destination path is not set.".to_string())
}

fn requested_name(job: &FileOperationJob) -> Result<&str, String> {
    let name = job
        .requested_name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| "Name is not set.".to_string())?;

    validate_file_name(name)?;
    Ok(name)
}

pub(crate) fn validate_file_name(name: &str) -> Result<(), String> {
    let path = Path::new(name);
    if path.components().count() != 1 {
        return Err("Name must not contain path separators.".to_string());
    }
    if name.contains('\0') {
        return Err("Name must not contain NUL characters.".to_string());
    }

    #[cfg(target_os = "windows")]
    {
        const INVALID_CHARS: [char; 9] = ['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
        let reserved_names = [
            "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7",
            "COM8", "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
        ];
        if name
            .chars()
            .any(|character| INVALID_CHARS.contains(&character))
        {
            return Err("Name contains characters that are invalid on Windows.".to_string());
        }
        let stem = name
            .split('.')
            .next()
            .unwrap_or_default()
            .to_ascii_uppercase();
        if reserved_names.contains(&stem.as_str()) {
            return Err("Name is reserved on Windows.".to_string());
        }
        if name.ends_with(' ') || name.ends_with('.') {
            return Err("Name must not end with a space or period on Windows.".to_string());
        }
    }

    Ok(())
}

fn target_destination(destination_dir: &Path, source: &Path) -> Result<PathBuf, String> {
    let file_name = source
        .file_name()
        .ok_or_else(|| format!("Source has no file name: '{}'", source.display()))?;
    Ok(destination_dir.join(file_name))
}

fn copy_targets(
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    cancellation: &Arc<AtomicBool>,
) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    for target in &job.targets {
        if cancellation_requested(cancellation, result) {
            break;
        }
        let operation =
            if let Some((archive_path, inner_path)) = parse_archive_entry_path(&target.path) {
                copy_archive_entry_to_directory(&archive_path, &inner_path, &destination_dir)
            } else {
                let source = PathBuf::from(&target.path);
                target_destination(&destination_dir, &source)
                    .and_then(|destination| copy_entry(&source, &destination, cancellation))
            };

        match operation {
            Ok(destination) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Copied to '{}'.", destination.display()),
            }),
            Err(message) => {
                if mark_canceled_if_needed(&message, result) {
                    break;
                }
                result.failed.push(FileOperationResultItem {
                    path: target.path.clone(),
                    message,
                });
            }
        }
    }
}

fn copy_sftp_targets(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    cancellation: &Arc<AtomicBool>,
) {
    let destination_path = job.destination_path.as_deref().unwrap_or_default();
    let destination_sftp = parse_sftp_uri(destination_path);
    let source_sftp = job
        .targets
        .iter()
        .find_map(|target| parse_sftp_uri(&target.path));

    match (source_sftp, destination_sftp) {
        (Some((connection_id, _)), None) => {
            copy_sftp_targets_to_local(state, job, result, &connection_id, cancellation)
        }
        (None, Some((connection_id, remote_path))) => copy_local_targets_to_sftp(
            state,
            job,
            result,
            &connection_id,
            &remote_path,
            cancellation,
        ),
        (Some(_), Some(_)) => result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP to SFTP copy is not implemented yet.".to_string(),
        }),
        (None, None) => result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP copy requires a local/SFTP source and destination.".to_string(),
        }),
    }
}

fn shared_sftp_connection(
    state: &State<'_, SftpState>,
    connection_id: &str,
    result: &mut FileOperationResult,
) -> Option<SharedSftpConnection> {
    match state.connection(connection_id) {
        Ok(connection) => Some(connection),
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            None
        }
    }
}

fn copy_sftp_targets_to_local(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    connection_id: &str,
    cancellation: &Arc<AtomicBool>,
) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    let Some(connection) = shared_sftp_connection(state, connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };

    for target in &job.targets {
        if cancellation_requested(cancellation, result) {
            break;
        }
        let Some((target_connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Target is not an SFTP path.".to_string(),
            });
            continue;
        };
        if target_connection_id != connection_id {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Mixed SFTP connections in one copy job are not supported.".to_string(),
            });
            continue;
        }
        let Some(name) = sftp_remote_leaf_name(&remote_path) else {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "SFTP target has no file name.".to_string(),
            });
            continue;
        };
        let destination = destination_dir.join(name);
        if destination.exists() {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Destination already exists: '{}'", destination.display()),
            });
            continue;
        }
        match download_sftp_entry(
            &sftp,
            &remote_path,
            &destination,
            job.sftp_safe_transfer_part_threshold_bytes,
            cancellation,
        ) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Downloaded to '{}'.", destination.display()),
            }),
            Err(message) => {
                if mark_canceled_if_needed(&message, result) {
                    break;
                }
                result.failed.push(FileOperationResultItem {
                    path: target.path.clone(),
                    message,
                });
            }
        }
    }
}

fn copy_local_targets_to_sftp(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    connection_id: &str,
    destination_remote_path: &str,
    cancellation: &Arc<AtomicBool>,
) {
    let Some(connection) = shared_sftp_connection(state, connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };

    for target in &job.targets {
        if cancellation_requested(cancellation, result) {
            break;
        }
        let source = PathBuf::from(&target.path);
        let Some(name) = source.file_name().and_then(|name| name.to_str()) else {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Local target has no file name.".to_string(),
            });
            continue;
        };
        let remote_destination = join_sftp_remote_path(destination_remote_path, name);
        if sftp.stat(Path::new(&remote_destination)).is_ok() {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Destination already exists: '{remote_destination}'"),
            });
            continue;
        }
        match upload_local_entry_to_sftp(
            &sftp,
            &source,
            &remote_destination,
            job.sftp_safe_transfer_part_threshold_bytes,
            cancellation,
        ) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Uploaded to '{}'.", remote_destination),
            }),
            Err(message) => {
                if mark_canceled_if_needed(&message, result) {
                    break;
                }
                result.failed.push(FileOperationResultItem {
                    path: target.path.clone(),
                    message,
                });
            }
        }
    }
}

fn download_sftp_entry(
    sftp: &ssh2::Sftp,
    remote_path: &str,
    destination: &Path,
    part_threshold_bytes: Option<u64>,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    cancellation_error(cancellation)?;
    let stat = sftp
        .stat(Path::new(remote_path))
        .map_err(|error| format!("Read SFTP metadata failed for '{remote_path}': {error}"))?;
    if sftp_entry_kind(stat.perm) == EntryKind::Directory {
        fs::create_dir_all(destination)
            .map_err(|error| format_io_error("create download directory", destination, error))?;
        let entries = sftp
            .readdir(Path::new(remote_path))
            .map_err(|error| format!("Read SFTP directory failed for '{remote_path}': {error}"))?;
        for (entry_path, _) in entries {
            cancellation_error(cancellation)?;
            let Some(name) = entry_path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if name == "." || name == ".." {
                continue;
            }
            if let Err(error) = download_sftp_entry(
                sftp,
                &join_sftp_remote_path(remote_path, name),
                &destination.join(name),
                part_threshold_bytes,
                cancellation,
            ) {
                if error == OPERATION_CANCELED_MESSAGE {
                    let _ = fs::remove_dir_all(destination);
                }
                return Err(error);
            }
        }
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create download parent directory", parent, error))?;
    }
    let mut remote_file = sftp
        .open(Path::new(remote_path))
        .map_err(|error| format!("Open SFTP file failed for '{remote_path}': {error}"))?;
    let use_part_file = should_use_part_file(stat.size, part_threshold_bytes);
    let write_destination = if use_part_file {
        local_part_path(destination)?
    } else {
        destination.to_path_buf()
    };
    let mut local_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&write_destination)
        .map_err(|error| format_io_error("create downloaded file", &write_destination, error))?;
    if let Err(error) =
        copy_stream_with_cancellation(&mut remote_file, &mut local_file, cancellation)
    {
        if error == OPERATION_CANCELED_MESSAGE {
            let _ = fs::remove_file(&write_destination);
            return Err(error);
        }
        return Err(transfer_error(
            "write downloaded file",
            &write_destination,
            error,
        ));
    }
    if use_part_file {
        fs::rename(&write_destination, destination).map_err(|error| {
            format_io_error("finish downloaded part file", &write_destination, error)
        })?;
    }
    Ok(())
}

fn upload_local_entry_to_sftp(
    sftp: &ssh2::Sftp,
    source: &Path,
    remote_path: &str,
    part_threshold_bytes: Option<u64>,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    cancellation_error(cancellation)?;
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format_io_error("read metadata", source, error))?;
    if metadata.file_type().is_symlink() {
        return Err("Uploading symlinks to SFTP is not implemented yet.".to_string());
    }
    if metadata.is_dir() {
        ensure_sftp_directory(sftp, remote_path)?;
        for entry in fs::read_dir(source)
            .map_err(|error| format_io_error("read directory", source, error))?
        {
            cancellation_error(cancellation)?;
            let entry =
                entry.map_err(|error| format_io_error("read directory entry", source, error))?;
            let name = entry.file_name().to_string_lossy().to_string();
            upload_local_entry_to_sftp(
                sftp,
                &entry.path(),
                &join_sftp_remote_path(remote_path, &name),
                part_threshold_bytes,
                cancellation,
            )?;
        }
        return Ok(());
    }

    if sftp.stat(Path::new(remote_path)).is_ok() {
        return Err(format!("Destination already exists: '{remote_path}'"));
    }
    if let Some(parent) = sftp_parent_remote_path(remote_path) {
        ensure_sftp_directory(sftp, &parent)?;
    }
    let mut local_file = fs::File::open(source)
        .map_err(|error| format_io_error("open upload source", source, error))?;
    let use_part_file = should_use_part_file(Some(metadata.len()), part_threshold_bytes);
    let write_remote_path = if use_part_file {
        format!("{remote_path}.part")
    } else {
        remote_path.to_string()
    };
    if use_part_file && sftp.stat(Path::new(&write_remote_path)).is_ok() {
        return Err(format!(
            "SFTP part file already exists: '{write_remote_path}'"
        ));
    }
    // ssh2 does not expose LIBSSH2_FXF_EXCL; 0x20 is the SFTP exclusive create flag.
    let create_exclusive_flags =
        OpenFlags::from_bits_retain(OpenFlags::WRITE.bits() | OpenFlags::CREATE.bits() | 0x20);
    let mut remote_file = sftp
        .open_mode(
            Path::new(&write_remote_path),
            create_exclusive_flags,
            0o644,
            OpenType::File,
        )
        .map_err(|error| format!("Create SFTP file failed for '{write_remote_path}': {error}"))?;
    if let Err(error) =
        copy_stream_with_cancellation(&mut local_file, &mut remote_file, cancellation)
    {
        if error == OPERATION_CANCELED_MESSAGE {
            let _ = sftp.unlink(Path::new(&write_remote_path));
            return Err(error);
        }
        return Err(format!(
            "Write SFTP file failed for '{write_remote_path}': {error}"
        ));
    }
    drop(remote_file);
    if use_part_file {
        sftp.rename(Path::new(&write_remote_path), Path::new(remote_path), None)
            .map_err(|error| {
                format!("Finalize SFTP part file failed for '{write_remote_path}': {error}")
            })?;
    }
    Ok(())
}

fn should_use_part_file(size: Option<u64>, threshold_bytes: Option<u64>) -> bool {
    let Some(threshold_bytes) = threshold_bytes else {
        return false;
    };
    threshold_bytes > 0 && size.is_some_and(|size| size >= threshold_bytes)
}

fn local_part_path(destination: &Path) -> Result<PathBuf, String> {
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Destination has no file name: '{}'", destination.display()))?;
    Ok(destination.with_file_name(format!("{file_name}.part")))
}

fn delete_sftp_targets(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let Some((connection_id, _)) = job
        .targets
        .iter()
        .find_map(|target| parse_sftp_uri(&target.path))
    else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP delete requires SFTP targets.".to_string(),
        });
        return;
    };

    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };

    for target in &job.targets {
        let Some((target_connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Target is not an SFTP path.".to_string(),
            });
            continue;
        };
        if target_connection_id != connection_id {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Mixed SFTP connections in one delete job are not supported.".to_string(),
            });
            continue;
        }
        match delete_sftp_entry(&sftp, &remote_path) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Deleted permanently from SFTP.".to_string(),
            }),
            Err(message) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            }),
        }
    }
}

fn rename_sftp_target(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let Some((connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Target is not an SFTP path.".to_string(),
        });
        return;
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            });
            return;
        }
    };
    let Some(parent_path) = sftp_parent_remote_path(&remote_path) else {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "SFTP target has no parent directory.".to_string(),
        });
        return;
    };
    let destination = join_sftp_remote_path(&parent_path, name);
    if normalized_sftp_remote_path(Some(&remote_path))
        == normalized_sftp_remote_path(Some(&destination))
    {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Requested name is the current name.".to_string(),
        });
        return;
    }

    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };
    if sftp.stat(Path::new(&destination)).is_ok() {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Destination already exists: '{destination}'"),
        });
        return;
    }

    match sftp.rename(Path::new(&remote_path), Path::new(&destination), None) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Renamed to '{}'.", destination),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Rename SFTP entry failed for '{remote_path}': {error}"),
        }),
    }
}

fn create_sftp_directory(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let destination_path = job.destination_path.as_deref().unwrap_or_default();
    let Some((connection_id, remote_parent_path)) = parse_sftp_uri(destination_path) else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP mkdir requires an SFTP destination.".to_string(),
        });
        return;
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: destination_path.to_string(),
                message,
            });
            return;
        }
    };
    let destination = join_sftp_remote_path(&remote_parent_path, name);

    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };
    if sftp.stat(Path::new(&destination)).is_ok() {
        result.failed.push(FileOperationResultItem {
            path: destination.clone(),
            message: "Destination already exists.".to_string(),
        });
        return;
    }

    match sftp.mkdir(Path::new(&destination), 0o755) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: destination,
            message: "Directory created on SFTP.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: destination,
            message: format!("Create SFTP directory failed: {error}"),
        }),
    }
}

fn create_sftp_file(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let destination_path = job.destination_path.as_deref().unwrap_or_default();
    let Some((connection_id, remote_parent_path)) = parse_sftp_uri(destination_path) else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP file creation requires an SFTP destination.".to_string(),
        });
        return;
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: destination_path.to_string(),
                message,
            });
            return;
        }
    };
    let destination = join_sftp_remote_path(&remote_parent_path, name);

    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };
    if sftp.stat(Path::new(&destination)).is_ok() {
        result.failed.push(FileOperationResultItem {
            path: destination.clone(),
            message: "Destination already exists.".to_string(),
        });
        return;
    }

    match sftp.open_mode(
        Path::new(&destination),
        OpenFlags::WRITE | OpenFlags::CREATE | OpenFlags::EXCLUSIVE,
        0o644,
        OpenType::File,
    ) {
        Ok(_) => result.succeeded.push(FileOperationResultItem {
            path: destination,
            message: "File created on SFTP.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: destination,
            message: format!("Create SFTP file failed: {error}"),
        }),
    }
}

fn chmod_sftp_targets(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let mode_text = match requested_mode(job) {
        Ok(mode_text) => mode_text,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let mode = match parse_octal_mode(mode_text) {
        Ok(mode) => mode,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let Some((connection_id, _)) = job
        .targets
        .iter()
        .find_map(|target| parse_sftp_uri(&target.path))
    else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "SFTP chmod requires SFTP targets.".to_string(),
        });
        return;
    };

    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };

    for target in &job.targets {
        let Some((target_connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Target is not an SFTP path.".to_string(),
            });
            continue;
        };
        if target_connection_id != connection_id {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Mixed SFTP connections in one chmod job are not supported.".to_string(),
            });
            continue;
        }

        let stat = ssh2::FileStat {
            size: None,
            uid: None,
            gid: None,
            perm: Some(mode),
            atime: None,
            mtime: None,
        };
        match sftp.setstat(Path::new(&remote_path), stat) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Changed remote mode to {:o}.", mode),
            }),
            Err(error) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Change SFTP mode failed for '{remote_path}': {error}"),
            }),
        }
    }
}

fn remove_empty_sftp_directory(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let Some((connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Target is not an SFTP path.".to_string(),
        });
        return;
    };
    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };
    match sftp.rmdir(Path::new(&remote_path)) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Removed empty SFTP directory.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Remove empty SFTP directory failed for '{remote_path}': {error}"),
        }),
    }
}

fn remove_empty_sftp_file(
    state: &State<'_, SftpState>,
    job: &FileOperationJob,
    result: &mut FileOperationResult,
) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let Some((connection_id, remote_path)) = parse_sftp_uri(&target.path) else {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Target is not an SFTP path.".to_string(),
        });
        return;
    };
    let Some(connection) = shared_sftp_connection(state, &connection_id, result) else {
        return;
    };
    let connection = match connection.lock() {
        Ok(connection) => connection,
        Err(_) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("SFTP connection is busy or unavailable: {connection_id}"),
            });
            return;
        }
    };
    let sftp = match connection.session.sftp() {
        Ok(sftp) => sftp,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message: format!("Start SFTP subsystem failed: {error}"),
            });
            return;
        }
    };
    match sftp.stat(Path::new(&remote_path)) {
        Ok(stat) if stat.size == Some(0) && sftp_entry_kind(stat.perm) == EntryKind::File => {}
        Ok(_) => {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Undo can remove only an empty SFTP file.".to_string(),
            });
            return;
        }
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Read SFTP metadata failed for '{remote_path}': {error}"),
            });
            return;
        }
    }
    match sftp.unlink(Path::new(&remote_path)) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Removed empty SFTP file.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Remove empty SFTP file failed for '{remote_path}': {error}"),
        }),
    }
}

fn delete_sftp_entry(sftp: &ssh2::Sftp, remote_path: &str) -> Result<(), String> {
    let stat = sftp
        .stat(Path::new(remote_path))
        .map_err(|error| format!("Read SFTP metadata failed for '{remote_path}': {error}"))?;
    if sftp_entry_kind(stat.perm) == EntryKind::Directory {
        let entries = sftp
            .readdir(Path::new(remote_path))
            .map_err(|error| format!("Read SFTP directory failed for '{remote_path}': {error}"))?;
        for (entry_path, _) in entries {
            let Some(name) = entry_path.file_name().and_then(|name| name.to_str()) else {
                continue;
            };
            if name == "." || name == ".." {
                continue;
            }
            delete_sftp_entry(sftp, &join_sftp_remote_path(remote_path, name))?;
        }
        sftp.rmdir(Path::new(remote_path)).map_err(|error| {
            format!("Remove SFTP directory failed for '{remote_path}': {error}")
        })?;
        return Ok(());
    }

    sftp.unlink(Path::new(remote_path))
        .map_err(|error| format!("Delete SFTP file failed for '{remote_path}': {error}"))
}

fn ensure_sftp_directory(sftp: &ssh2::Sftp, remote_path: &str) -> Result<(), String> {
    let normalized = normalized_sftp_remote_path(Some(remote_path));
    if normalized == "/" {
        return Ok(());
    }
    if sftp.stat(Path::new(&normalized)).is_ok() {
        return Ok(());
    }
    if let Some(parent) = sftp_parent_remote_path(&normalized) {
        ensure_sftp_directory(sftp, &parent)?;
    }
    sftp.mkdir(Path::new(&normalized), 0o755)
        .map_err(|error| format!("Create SFTP directory failed for '{normalized}': {error}"))
}

fn move_targets(job: &FileOperationJob, result: &mut FileOperationResult) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    for target in &job.targets {
        let source = PathBuf::from(&target.path);
        match target_destination(&destination_dir, &source)
            .and_then(|destination| move_entry(&source, &destination))
        {
            Ok(destination) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Moved to '{}'.", destination.display()),
            }),
            Err(message) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            }),
        }
    }
}

fn rename_target(job: &FileOperationJob, result: &mut FileOperationResult) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let source = PathBuf::from(&target.path);
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            });
            return;
        }
    };
    let Some(parent) = source.parent() else {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Target has no parent directory.".to_string(),
        });
        return;
    };

    let destination = parent.join(name);
    match move_entry(&source, &destination) {
        Ok(destination) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format!("Renamed to '{}'.", destination.display()),
        }),
        Err(message) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message,
        }),
    }
}

fn chmod_targets(job: &FileOperationJob, result: &mut FileOperationResult) {
    let mode_text = match requested_mode(job) {
        Ok(mode_text) => mode_text,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let mode = match parse_octal_mode(mode_text) {
        Ok(mode) => mode,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    for target in &job.targets {
        let path = PathBuf::from(&target.path);
        match set_local_mode(&path, mode) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Changed mode to {:o}.", mode),
            }),
            Err(message) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            }),
        }
    }
}

fn requested_mode(job: &FileOperationJob) -> Result<&str, String> {
    job.requested_name
        .as_deref()
        .map(str::trim)
        .filter(|mode| !mode.is_empty())
        .ok_or_else(|| "Mode is not set.".to_string())
}

fn parse_octal_mode(mode: &str) -> Result<u32, String> {
    if !(mode.len() == 3 || mode.len() == 4)
        || !mode.chars().all(|character| matches!(character, '0'..='7'))
    {
        return Err("Mode must be an octal value like 644, 755, or 0755.".to_string());
    }

    u32::from_str_radix(mode, 8).map_err(|error| format!("Parse mode failed: {error}"))
}

#[derive(Clone, Copy)]
struct WindowsAttributePatch {
    readonly: Option<bool>,
    hidden: Option<bool>,
}

fn windows_attribute_targets(job: &FileOperationJob, result: &mut FileOperationResult) {
    let patch = match requested_windows_attribute_patch(job) {
        Ok(patch) => patch,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    for target in &job.targets {
        let path = PathBuf::from(&target.path);
        match set_windows_attributes(&path, patch) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Changed Windows attributes.".to_string(),
            }),
            Err(message) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            }),
        }
    }
}

fn requested_windows_attribute_patch(
    job: &FileOperationJob,
) -> Result<WindowsAttributePatch, String> {
    let expression = job
        .requested_name
        .as_deref()
        .map(str::trim)
        .filter(|expression| !expression.is_empty())
        .ok_or_else(|| "Windows attribute expression is not set.".to_string())?;
    parse_windows_attribute_patch(expression)
}

fn parse_windows_attribute_patch(expression: &str) -> Result<WindowsAttributePatch, String> {
    let mut patch = WindowsAttributePatch {
        readonly: None,
        hidden: None,
    };

    for token in expression
        .split(|character: char| character.is_whitespace() || character == ',')
        .filter(|token| !token.is_empty())
    {
        if let Some(rest) = token.strip_prefix('+') {
            set_windows_attribute_value(&mut patch, rest, true)?;
            continue;
        }
        if let Some(rest) = token.strip_prefix('-') {
            set_windows_attribute_value(&mut patch, rest, false)?;
            continue;
        }
        let Some((name, value)) = token.split_once('=') else {
            return Err(
                "Use readonly=on/off/keep and hidden=on/off/keep, or +r/-r/+h/-h.".to_string(),
            );
        };
        let Some(enabled) = parse_attribute_toggle(value)? else {
            continue;
        };
        set_windows_attribute_value(&mut patch, name, enabled)?;
    }

    if patch.readonly.is_none() && patch.hidden.is_none() {
        return Err("No Windows attribute changes were requested.".to_string());
    }

    Ok(patch)
}

fn parse_attribute_toggle(value: &str) -> Result<Option<bool>, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "on" | "true" | "1" | "yes" => Ok(Some(true)),
        "off" | "false" | "0" | "no" => Ok(Some(false)),
        "keep" | "-" => Ok(None),
        _ => Err("Attribute values must be on, off, or keep.".to_string()),
    }
}

fn set_windows_attribute_value(
    patch: &mut WindowsAttributePatch,
    name: &str,
    enabled: bool,
) -> Result<(), String> {
    match name.trim().to_ascii_lowercase().as_str() {
        "r" | "readonly" | "read-only" => {
            patch.readonly = Some(enabled);
            Ok(())
        }
        "h" | "hidden" => {
            patch.hidden = Some(enabled);
            Ok(())
        }
        _ => Err("Supported Windows attributes are readonly/r and hidden/h.".to_string()),
    }
}

#[cfg(unix)]
fn set_local_mode(path: &Path, mode: u32) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;

    let mut permissions = fs::metadata(path)
        .map_err(|error| format_io_error("read permissions", path, error))?
        .permissions();
    permissions.set_mode(mode);
    fs::set_permissions(path, permissions)
        .map_err(|error| format_io_error("change permissions", path, error))
}

#[cfg(not(unix))]
fn set_local_mode(path: &Path, _mode: u32) -> Result<(), String> {
    Err(format!(
        "POSIX chmod mode is not supported on this platform: {}",
        path.display()
    ))
}

#[cfg(target_os = "windows")]
fn set_windows_attributes(path: &Path, patch: WindowsAttributePatch) -> Result<(), String> {
    if let Some(readonly) = patch.readonly {
        let mut permissions = fs::metadata(path)
            .map_err(|error| format_io_error("read permissions", path, error))?
            .permissions();
        permissions.set_readonly(readonly);
        fs::set_permissions(path, permissions)
            .map_err(|error| format_io_error("change readonly attribute", path, error))?;
    }

    if let Some(hidden) = patch.hidden {
        let flag = if hidden { "+h" } else { "-h" };
        let output = std::process::Command::new("attrib")
            .arg(flag)
            .arg(path)
            .output()
            .map_err(|error| format_io_error("change hidden attribute", path, error))?;
        if !output.status.success() {
            let message = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if message.is_empty() {
                format!("attrib {flag} failed for {}.", path.display())
            } else {
                format!("attrib {flag} failed for {}: {message}", path.display())
            });
        }
    }

    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn set_windows_attributes(path: &Path, _patch: WindowsAttributePatch) -> Result<(), String> {
    Err(format!(
        "Windows readonly/hidden attributes are not supported on this platform: {}",
        path.display()
    ))
}

fn delete_targets(job: &FileOperationJob, result: &mut FileOperationResult) {
    for target in &job.targets {
        let path = PathBuf::from(&target.path);
        let operation = if path.is_dir() {
            fs::remove_dir_all(&path)
        } else {
            fs::remove_file(&path)
        };

        match operation {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Deleted permanently.".to_string(),
            }),
            Err(error) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format_io_error("delete", &path, error),
            }),
        }
    }
}

fn trash_targets(job: &FileOperationJob, result: &mut FileOperationResult) {
    for target in &job.targets {
        let path = PathBuf::from(&target.path);
        match trash::delete(&path) {
            Ok(()) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: "Moved to Trash.".to_string(),
            }),
            Err(error) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Move to Trash failed for '{}': {error}", path.display()),
            }),
        }
    }
}

fn create_directory(job: &FileOperationJob, result: &mut FileOperationResult) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: path_to_string(destination_dir),
                message,
            });
            return;
        }
    };

    let destination = destination_dir.join(name);
    if destination.exists() {
        result.failed.push(FileOperationResultItem {
            path: path_to_string(destination),
            message: "Destination already exists.".to_string(),
        });
        return;
    }

    match fs::create_dir(&destination) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: path_to_string(destination),
            message: "Directory created.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: path_to_string(&destination),
            message: format_io_error("create directory", &destination, error),
        }),
    }
}

fn create_file(job: &FileOperationJob, result: &mut FileOperationResult) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: path_to_string(destination_dir),
                message,
            });
            return;
        }
    };

    let destination = destination_dir.join(name);
    match OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&destination)
    {
        Ok(_) => result.succeeded.push(FileOperationResultItem {
            path: path_to_string(destination),
            message: "File created.".to_string(),
        }),
        Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {
            result.failed.push(FileOperationResultItem {
                path: path_to_string(destination),
                message: "Destination already exists.".to_string(),
            });
        }
        Err(error) => result.failed.push(FileOperationResultItem {
            path: path_to_string(&destination),
            message: format_io_error("create file", &destination, error),
        }),
    }
}

fn remove_empty_directory(job: &FileOperationJob, result: &mut FileOperationResult) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let path = PathBuf::from(&target.path);
    match fs::remove_dir(&path) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Removed empty directory.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format_io_error("remove empty directory", &path, error),
        }),
    }
}

fn remove_empty_file(job: &FileOperationJob, result: &mut FileOperationResult) {
    let Some(target) = job.targets.first() else {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No target was resolved.".to_string(),
        });
        return;
    };
    let path = PathBuf::from(&target.path);
    let metadata = match fs::metadata(&path) {
        Ok(metadata) => metadata,
        Err(error) => {
            result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format_io_error("read empty file metadata", &path, error),
            });
            return;
        }
    };
    if !metadata.is_file() || metadata.len() != 0 {
        result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Undo can remove only an empty file.".to_string(),
        });
        return;
    }

    match fs::remove_file(&path) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: target.path.clone(),
            message: "Removed empty file.".to_string(),
        }),
        Err(error) => result.failed.push(FileOperationResultItem {
            path: target.path.clone(),
            message: format_io_error("remove empty file", &path, error),
        }),
    }
}

fn extract_archives(
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    cancellation: &Arc<AtomicBool>,
) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };

    for target in &job.targets {
        if cancellation_requested(cancellation, result) {
            break;
        }
        let archive_path = PathBuf::from(&target.path);
        match extract_archive_to_directory(&archive_path, &destination_dir) {
            Ok(destination) => result.succeeded.push(FileOperationResultItem {
                path: target.path.clone(),
                message: format!("Extracted to '{}'.", destination.display()),
            }),
            Err(message) => result.failed.push(FileOperationResultItem {
                path: target.path.clone(),
                message,
            }),
        }
    }
}

fn create_archive(
    job: &FileOperationJob,
    result: &mut FileOperationResult,
    cancellation: &Arc<AtomicBool>,
) {
    let destination_dir = match destination_dir(job) {
        Ok(path) => path,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: String::new(),
                message,
            });
            return;
        }
    };
    let name = match requested_name(job) {
        Ok(name) => name,
        Err(message) => {
            result.failed.push(FileOperationResultItem {
                path: path_to_string(destination_dir),
                message,
            });
            return;
        }
    };
    if job.targets.is_empty() {
        result.failed.push(FileOperationResultItem {
            path: String::new(),
            message: "No archive sources were resolved.".to_string(),
        });
        return;
    }
    if cancellation_requested(cancellation, result) {
        return;
    }

    let destination = destination_dir.join(name);
    let sources: Vec<PathBuf> = job
        .targets
        .iter()
        .map(|target| PathBuf::from(&target.path))
        .collect();
    match create_archive_from_sources(&sources, &destination, cancellation) {
        Ok(()) => result.succeeded.push(FileOperationResultItem {
            path: path_to_string(destination),
            message: format!("Archive created with {} item(s).", sources.len()),
        }),
        Err(message) if message == archive_creation_canceled_message() => {
            result.canceled = true;
        }
        Err(message) => result.failed.push(FileOperationResultItem {
            path: path_to_string(destination),
            message,
        }),
    }
}

fn copy_entry(
    source: &Path,
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<PathBuf, String> {
    cancellation_error(cancellation)?;
    if destination.exists() {
        return Err(format!(
            "Destination already exists: '{}'",
            destination.display()
        ));
    }

    ensure_destination_is_not_inside_source(source, destination, "copy")?;

    if fs::symlink_metadata(source)
        .map_err(|error| format_io_error("read metadata", source, error))?
        .file_type()
        .is_symlink()
    {
        copy_symlink(source, destination)?;
    } else if source.is_dir() {
        if let Err(error) = copy_directory(source, destination, cancellation) {
            if error == OPERATION_CANCELED_MESSAGE {
                let _ = fs::remove_dir_all(destination);
            }
            return Err(error);
        }
    } else {
        copy_file_with_cancellation(source, destination, cancellation)?;
    }

    Ok(destination.to_path_buf())
}

fn copy_directory(
    source: &Path,
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    cancellation_error(cancellation)?;
    fs::create_dir(destination)
        .map_err(|error| format_io_error("create directory", destination, error))?;

    for entry in
        fs::read_dir(source).map_err(|error| format_io_error("read directory", source, error))?
    {
        cancellation_error(cancellation)?;
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let entry_source = entry.path();
        let entry_destination = destination.join(entry.file_name());
        if fs::symlink_metadata(&entry_source)
            .map_err(|error| format_io_error("read metadata", &entry_source, error))?
            .file_type()
            .is_symlink()
        {
            copy_symlink(&entry_source, &entry_destination)?;
        } else if entry_source.is_dir() {
            copy_directory(&entry_source, &entry_destination, cancellation)?;
        } else {
            copy_file_with_cancellation(&entry_source, &entry_destination, cancellation)?;
        }
    }

    Ok(())
}

fn copy_file_with_cancellation(
    source: &Path,
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    let mut input = fs::File::open(source)
        .map_err(|error| format_io_error("open copy source", source, error))?;
    let mut output = OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(destination)
        .map_err(|error| format_io_error("create copy destination", destination, error))?;
    if let Err(error) = copy_stream_with_cancellation(&mut input, &mut output, cancellation) {
        if error == OPERATION_CANCELED_MESSAGE {
            let _ = fs::remove_file(destination);
            return Err(error);
        }
        return Err(transfer_error("copy", source, error));
    }
    Ok(())
}

fn transfer_error(operation: &str, path: &Path, error: String) -> String {
    if error == OPERATION_CANCELED_MESSAGE {
        error
    } else {
        format_io_error(operation, path, io::Error::other(error))
    }
}

#[cfg(unix)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::unix::fs::symlink;

    let target =
        fs::read_link(source).map_err(|error| format_io_error("read symlink", source, error))?;
    symlink(&target, destination)
        .map_err(|error| format_io_error("create symlink", destination, error))
}

#[cfg(windows)]
fn copy_symlink(source: &Path, destination: &Path) -> Result<(), String> {
    use std::os::windows::fs::{symlink_dir, symlink_file};

    let target =
        fs::read_link(source).map_err(|error| format_io_error("read symlink", source, error))?;
    let target_metadata = fs::metadata(source)
        .map_err(|error| format_io_error("read symlink target metadata", source, error))?;
    if target_metadata.is_dir() {
        symlink_dir(&target, destination)
            .map_err(|error| format_io_error("create directory symlink", destination, error))
    } else {
        symlink_file(&target, destination)
            .map_err(|error| format_io_error("create file symlink", destination, error))
    }
}

fn move_entry(source: &Path, destination: &Path) -> Result<PathBuf, String> {
    if destination.exists() {
        return Err(format!(
            "Destination already exists: '{}'",
            destination.display()
        ));
    }

    ensure_destination_is_not_inside_source(source, destination, "move")?;

    fs::rename(source, destination).map_err(|error| format_io_error("move", source, error))?;
    Ok(destination.to_path_buf())
}

fn ensure_destination_is_not_inside_source(
    source: &Path,
    destination: &Path,
    action: &str,
) -> Result<(), String> {
    if !source.is_dir() {
        return Ok(());
    }

    let source = fs::canonicalize(source)
        .map_err(|error| format_io_error("resolve source", source, error))?;
    let destination_parent = destination
        .parent()
        .ok_or_else(|| format!("Destination has no parent: '{}'", destination.display()))?;
    let destination_parent = nearest_existing_ancestor(destination_parent).ok_or_else(|| {
        format!(
            "Destination parent does not exist and no ancestor could be resolved: '{}'",
            destination_parent.display()
        )
    })?;
    let destination_parent = fs::canonicalize(&destination_parent).map_err(|error| {
        format_io_error("resolve destination parent", &destination_parent, error)
    })?;

    if destination_parent.starts_with(&source) {
        return Err(format!(
            "Cannot {action} a directory into itself or one of its descendants: '{}'",
            source.display()
        ));
    }

    Ok(())
}

fn nearest_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = path;

    loop {
        if current.exists() {
            return Some(current.to_path_buf());
        }

        current = current.parent()?;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    struct CancelAfterFirstRead {
        cancellation: Arc<AtomicBool>,
        reads: usize,
    }

    impl Read for CancelAfterFirstRead {
        fn read(&mut self, buffer: &mut [u8]) -> io::Result<usize> {
            if self.reads > 0 {
                return Ok(0);
            }
            self.reads += 1;
            buffer[..4].copy_from_slice(b"wind");
            self.cancellation.store(true, Ordering::SeqCst);
            Ok(4)
        }
    }

    #[test]
    fn copy_stream_checks_cancellation_between_chunks() {
        let cancellation = Arc::new(AtomicBool::new(false));
        let mut reader = CancelAfterFirstRead {
            cancellation: Arc::clone(&cancellation),
            reads: 0,
        };
        let mut output = Vec::new();

        let result = copy_stream_with_cancellation(&mut reader, &mut output, &cancellation);

        assert_eq!(result, Err(OPERATION_CANCELED_MESSAGE.to_string()));
        assert!(output.is_empty());
    }
}
