//! Local operation receipts. Persist intent before touching a path and persist
//! each completed step. Unknown/interrupted steps are never retried blindly.
use crate::config::RecoverySettings;
use crate::file_ops::{
    FileOperationJob, FileOperationKind, FileOperationResult, FileOperationResultItem,
};
use crate::path_utils::write_file_atomically;
use serde::{Deserialize, Serialize};
use std::{
    fs, io,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex, OnceLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};

static LOCK: Mutex<()> = Mutex::new(());
static SESSION: OnceLock<String> = OnceLock::new();
fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
fn session() -> &'static str {
    SESSION.get_or_init(|| format!("{}-{}", now(), std::process::id()))
}
fn root() -> Result<PathBuf, String> {
    Ok(crate::config::config_dir()?.join("recovery"))
}
fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}
fn exists(path: &Path) -> bool {
    fs::symlink_metadata(path).is_ok()
}

#[derive(Clone, Debug, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct Fingerprint {
    identity: String,
    created: Option<u128>,
    kind: String,
    mode: u32,
    readonly: bool,
    hidden: bool,
}
fn fingerprint(path: &Path) -> Result<Fingerprint, String> {
    let m = fs::symlink_metadata(path).map_err(err)?;
    #[cfg(unix)]
    let (identity, mode, hidden) = {
        use std::os::unix::fs::MetadataExt;
        (format!("{}:{}", m.dev(), m.ino()), m.mode() & 0o7777, false)
    };
    #[cfg(windows)]
    let (identity, mode, hidden) = {
        use std::os::windows::fs::MetadataExt;
        (windows_identity(path)?, 0, m.file_attributes() & 2 != 0)
    };
    Ok(Fingerprint {
        identity,
        mode,
        hidden,
        readonly: m.permissions().readonly(),
        created: m
            .created()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|t| t.as_nanos()),
        kind: if m.is_symlink() {
            "symlink"
        } else if m.is_dir() {
            "directory"
        } else if m.is_file() {
            "file"
        } else {
            "other"
        }
        .into(),
    })
}
fn same_object(a: &Fingerprint, b: &Fingerprint) -> bool {
    a.identity == b.identity && a.kind == b.kind && a.created == b.created
}
fn parent(path: &Path) -> Result<PathBuf, String> {
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| "recovery.invalidPath".into())
}
fn absolute(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute() {
        return Err("recovery.invalidPath".into());
    }
    let name = path.file_name().ok_or("recovery.invalidPath")?;
    Ok(fs::canonicalize(parent(path)?).map_err(err)?.join(name))
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Item {
    pub(crate) before_path: Option<PathBuf>,
    pub(crate) after_path: PathBuf,
    pub(crate) state: String,
    before: Option<Fingerprint>,
    after: Option<Fingerprint>,
    before_parent: Option<Fingerprint>,
    after_parent: Fingerprint,
    staging: Option<PathBuf>,
    held: Option<PathBuf>,
    storage_identity: Option<Fingerprint>,
}
#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct Record {
    pub(crate) id: String,
    pub(crate) kind: FileOperationKind,
    pub(crate) state: String,
    pub(crate) created_at: u64,
    #[serde(default)]
    pub(crate) updated_at: u64,
    pub(crate) items: Vec<Item>,
    pub(crate) bytes: u64,
    session: String,
    persistent: bool,
    schema_version: u32,
    settings: RecoverySettings,
    sources: Vec<(PathBuf, Fingerprint)>,
    result: Option<FileOperationResult>,
}
#[derive(Serialize)]
pub(crate) struct Plan {
    record: Record,
    issues: Vec<PlanIssue>,
    paths: Vec<String>,
    attributes: Vec<AttributeChange>,
}
#[derive(Serialize)]
struct AttributeChange {
    path: String,
    before: Fingerprint,
    after: Fingerprint,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PlanIssue {
    message_id: String,
    path: String,
}
impl From<&str> for PlanIssue {
    fn from(message: &str) -> Self {
        Self {
            message_id: message.into(),
            path: String::new(),
        }
    }
}
fn record_path(root: &Path, id: &str) -> Result<PathBuf, String> {
    if id.is_empty()
        || id.len() > 100
        || !id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
    {
        return Err("recovery.invalidRecord".into());
    }
    Ok(root.join(format!("{id}.json")))
}
fn save(root: &Path, record: &Record) -> Result<(), String> {
    write_file_atomically(
        &record_path(root, &record.id)?,
        &serde_json::to_vec(record).map_err(err)?,
        "save recovery journal",
    )
}
fn read(root: &Path, id: &str) -> Result<Record, String> {
    let r: Record =
        serde_json::from_slice(&fs::read(record_path(root, id)?).map_err(err)?).map_err(err)?;
    if r.schema_version != 1 || r.id != id {
        return Err("recovery.invalidRecord".into());
    }
    Ok(r)
}
fn records(root: &Path) -> Result<Vec<Record>, String> {
    Ok(scan_records(root)?.records)
}
#[derive(Serialize)]
pub(crate) struct History {
    records: Vec<Record>,
    issues: Vec<HistoryIssue>,
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HistoryIssue {
    path: String,
    message_id: String,
    detail: String,
}
fn scan_records(root: &Path) -> Result<History, String> {
    let mut history = History {
        records: vec![],
        issues: vec![],
    };
    if !root.exists() {
        return Ok(history);
    }
    for entry in fs::read_dir(root).map_err(err)? {
        let path = entry.map_err(err)?.path();
        if path.extension().and_then(|v| v.to_str()) != Some("json") {
            continue;
        }
        let record = path
            .file_stem()
            .and_then(|v| v.to_str())
            .ok_or_else(|| "recovery.invalidRecord".to_string())
            .and_then(|id| read(root, id));
        match record {
            Ok(record) => history.records.push(record),
            Err(detail) => history.issues.push(HistoryIssue {
                path: path.to_string_lossy().into_owned(),
                message_id: "recovery.invalidRecord".into(),
                detail,
            }),
        }
    }
    history
        .records
        .sort_by_key(|r| r.updated_at.max(r.created_at));
    history.issues.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(history)
}
fn next_timestamp(root: &Path) -> Result<u64, String> {
    Ok(records(root)?.last().map_or(now(), |r| {
        now().max(r.updated_at.max(r.created_at).saturating_add(1))
    }))
}
fn eligible(r: &Record) -> bool {
    r.persistent || r.session == session()
}
fn storage_empty(record: &Record) -> bool {
    record.items.iter().all(|item| {
        item.staging.as_ref().is_none_or(|path| {
            if !exists(path) {
                return true;
            }
            item.storage_identity.as_ref().is_some_and(|expected| {
                fingerprint(path).is_ok_and(|actual| same_object(expected, &actual))
            }) && fs::read_dir(path).is_ok_and(|mut entries| entries.next().is_none())
        })
    })
}
fn remove_empty_storage(record: &Record) -> Result<(), String> {
    if !storage_empty(record) {
        return Err("recovery.containsData".into());
    }
    for item in &record.items {
        if let Some(path) = &item.staging {
            if exists(path) {
                fs::remove_dir(path).map_err(err)?;
            }
        }
    }
    Ok(())
}
fn retained_bytes(path: &Path) -> Result<u64, String> {
    let meta = fs::symlink_metadata(path).map_err(err)?;
    if !meta.is_dir() {
        return Ok(meta.len());
    }
    let mut bytes = 0u64;
    for entry in fs::read_dir(path).map_err(err)? {
        bytes = bytes.saturating_add(retained_bytes(&entry.map_err(err)?.path())?);
    }
    Ok(bytes)
}
pub(crate) async fn apply_limit(limit: usize) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(err)?;
        retain(&root()?, limit)
    })
    .await
    .map_err(err)?
}
fn retain(root: &Path, limit: usize) -> Result<(), String> {
    let all = records(root)?;
    let completed: Vec<_> = all
        .iter()
        .filter(|r| {
            matches!(
                r.state.as_str(),
                "applied" | "undone" | "unsupported" | "failed"
            )
        })
        .collect();
    for record in completed
        .iter()
        .take(completed.len().saturating_sub(limit.clamp(1, 1000)))
    {
        let mut record = (*record).clone();
        // Never delete held content to satisfy a count limit. These records remain
        // visible in history management, outside the automatic Undo/Redo chain.
        if !storage_empty(&record) {
            record.state = "retained".into();
            save(root, &record)?;
        } else {
            remove_empty_storage(&record)?;
            fs::remove_file(record_path(root, &record.id)?).map_err(err)?;
        }
    }
    Ok(())
}
pub(crate) fn invalidate_after_external_change() -> Result<(), String> {
    let _guard = LOCK.lock().map_err(err)?;
    invalidate_redo(&root()?)
}
fn invalidate_redo(root: &Path) -> Result<(), String> {
    for mut record in records(root)? {
        if record.state == "undone" {
            record.state = "retained".into();
            save(root, &record)?;
        }
    }
    Ok(())
}

#[tauri::command]
pub(crate) async fn recovery_history(include_usage: Option<bool>) -> Result<History, String> {
    tauri::async_runtime::spawn_blocking(move || history(include_usage.unwrap_or(false)))
        .await
        .map_err(err)?
}
fn history(include_usage: bool) -> Result<History, String> {
    let _guard = LOCK.lock().map_err(err)?;
    history_at(&root()?, include_usage)
}
fn history_at(root: &Path, include_usage: bool) -> Result<History, String> {
    let mut all = scan_records(root)?;
    for r in &mut all.records {
        r.bytes = 0;
        if include_usage {
            for item in &r.items {
                if let Some(path) = &item.staging {
                    if exists(path) {
                        r.bytes = r.bytes.saturating_add(retained_bytes(path)?);
                    }
                }
            }
        }
        if !eligible(r) && matches!(r.state.as_str(), "applied" | "undone" | "partial") {
            r.state = "retained".into();
        }
    }
    Ok(all)
}
fn plan(record: Record, direction: &str) -> Plan {
    let mut issues = vec![];
    let mut paths = vec![];
    let mut attributes = vec![];
    if !matches!(direction, "undo" | "redo")
        || !matches!(
            record.state.as_str(),
            "applied" | "undone" | "partial" | "retained"
        )
    {
        issues.push("recovery.unavailable".into());
    }
    for item in &record.items {
        if item.state == "pending" || item.state == "unknown" {
            issues.push(PlanIssue {
                message_id: "recovery.interrupted".into(),
                path: item.after_path.to_string_lossy().into_owned(),
            });
            continue;
        }
        if item.state
            != if direction == "undo" {
                "applied"
            } else {
                "undone"
            }
        {
            continue;
        }
        match check_item(&record.kind, item, direction) {
            Ok((from, to)) => {
                if matches!(
                    record.kind,
                    FileOperationKind::Chmod | FileOperationKind::WindowsAttributes
                ) {
                    if let (Some(before), Some(after)) = (&item.before, &item.after) {
                        let (before, after) = if direction == "undo" {
                            (after, before)
                        } else {
                            (before, after)
                        };
                        attributes.push(AttributeChange {
                            path: from.to_string_lossy().into_owned(),
                            before: before.clone(),
                            after: after.clone(),
                        });
                    }
                } else {
                    paths.push(format!("{} → {}", from.display(), to.display()));
                }
            }
            Err(error) => issues.push(PlanIssue {
                message_id: error,
                path: item.after_path.to_string_lossy().into_owned(),
            }),
        }
    }
    if paths.is_empty() && attributes.is_empty() && issues.is_empty() {
        issues.push("recovery.unavailable".into());
    }
    Plan {
        record,
        issues,
        paths,
        attributes,
    }
}
#[tauri::command]
pub(crate) async fn recovery_plan(id: String, direction: String) -> Result<Plan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _guard = LOCK.lock().map_err(err)?;
        Ok(plan(read(&root()?, &id)?, &direction))
    })
    .await
    .map_err(err)?
}
#[tauri::command]
pub(crate) async fn recovery_forget(id: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || forget(&root()?, &id))
        .await
        .map_err(err)?
}
fn forget(root: &Path, id: &str) -> Result<(), String> {
    let _guard = LOCK.lock().map_err(err)?;
    let r = read(root, id)?;
    if !storage_empty(&r)
        || !matches!(
            r.state.as_str(),
            "applied" | "undone" | "retained" | "unsupported" | "failed"
        )
    {
        return Err("recovery.containsData".into());
    }
    remove_empty_storage(&r)?;
    fs::remove_file(record_path(root, id)?).map_err(err)
}

fn check_item(
    kind: &FileOperationKind,
    item: &Item,
    direction: &str,
) -> Result<(PathBuf, PathBuf), String> {
    if let Some(storage) = &item.staging {
        if !item.storage_identity.as_ref().is_some_and(|expected| {
            fingerprint(storage).is_ok_and(|actual| same_object(expected, &actual))
        }) {
            return Err("recovery.parentChanged".into());
        }
    }
    let undo = direction == "undo";
    let attrs = matches!(
        kind,
        FileOperationKind::Chmod | FileOperationKind::WindowsAttributes
    );
    let from = if undo || attrs {
        item.after_path.clone()
    } else {
        item.before_path
            .clone()
            .or(item.held.clone())
            .ok_or("recovery.missingData")?
    };
    let to = if attrs {
        from.clone()
    } else if undo {
        item.before_path
            .clone()
            .or(item.held.clone())
            .ok_or("recovery.missingData")?
    } else {
        item.after_path.clone()
    };
    let expected = if undo {
        item.after.as_ref()
    } else if attrs {
        item.before.as_ref()
    } else {
        item.after.as_ref()
    }
    .ok_or("recovery.interrupted")?;
    let current = fingerprint(&from).map_err(|_| "recovery.missingData")?;
    if !same_object(expected, &current) {
        return Err("recovery.targetChanged".into());
    }
    if attrs
        && (expected.mode != current.mode
            || expected.readonly != current.readonly
            || expected.hidden != current.hidden)
    {
        return Err("recovery.attributesChanged".into());
    }
    if !attrs && exists(&to) {
        return Err("recovery.destinationExists".into());
    }
    let expected_parent = if undo || attrs {
        &item.after_parent
    } else if let Some(p) = &item.before_parent {
        p
    } else {
        return check_held_parent(item, from, to);
    };
    if !same_object(expected_parent, &fingerprint(&parent(&from)?)?) {
        return Err("recovery.parentChanged".into());
    }
    if item.before_path.is_some() && !attrs {
        let target_parent = if undo {
            item.before_parent.as_ref().ok_or("recovery.interrupted")?
        } else {
            &item.after_parent
        };
        if !same_object(target_parent, &fingerprint(&parent(&to)?)?) {
            return Err("recovery.parentChanged".into());
        }
    }
    Ok((from, to))
}
fn check_held_parent(
    item: &Item,
    from: PathBuf,
    to: PathBuf,
) -> Result<(PathBuf, PathBuf), String> {
    if !same_object(&item.after_parent, &fingerprint(&parent(&to)?)?) {
        return Err("recovery.parentChanged".into());
    }
    Ok((from, to))
}
fn failure(message: String) -> FileOperationResult {
    FileOperationResult {
        succeeded: vec![],
        failed: vec![FileOperationResultItem {
            path: String::new(),
            message,
        }],
        canceled: false,
        recovery_id: None,
        recovery_status: Some("blocked".into()),
    }
}

pub(crate) fn execute(job: FileOperationJob, cancellation: Arc<AtomicBool>) -> FileOperationResult {
    let _guard = match LOCK.lock() {
        Ok(g) => g,
        Err(e) => return failure(err(e)),
    };
    let root = match root() {
        Ok(p) => p,
        Err(e) => return failure(e),
    };
    execute_at(&root, job, cancellation)
}
fn execute_at(
    root: &Path,
    job: FileOperationJob,
    cancellation: Arc<AtomicBool>,
) -> FileOperationResult {
    if let Some(id) = job.recovery_id.as_deref() {
        return restore(
            root,
            id,
            job.recovery_direction.as_deref().unwrap_or(""),
            &cancellation,
        );
    }
    let settings = job.recovery_settings.clone().unwrap_or_default();
    let new_mutation = !matches!(job.kind, FileOperationKind::Refresh)
        && !job
            .command_id
            .as_deref()
            .is_some_and(|id| id.starts_with("undo.") || id.starts_with("redo."));
    if !settings.enabled
        || job
            .command_id
            .as_deref()
            .is_some_and(|id| id.starts_with("undo.") || id.starts_with("redo."))
        || matches!(job.kind, FileOperationKind::Refresh)
    {
        let mut result = crate::file_ops::execute_file_operation_job_blocking_with_cancellation(
            job,
            cancellation,
        );
        if new_mutation && !result.succeeded.is_empty() {
            if let Err(message) = invalidate_redo(root) {
                result.failed.push(FileOperationResultItem {
                    path: String::new(),
                    message,
                });
            }
        }
        return result;
    }
    match execute_protected(root, job, settings, cancellation) {
        Ok(result) => result,
        Err(e) => failure(e),
    }
}

fn execute_protected(
    root: &Path,
    job: FileOperationJob,
    settings: RecoverySettings,
    cancellation: Arc<AtomicBool>,
) -> Result<FileOperationResult, String> {
    fs::create_dir_all(root).map_err(err)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        fs::set_permissions(root, fs::Permissions::from_mode(0o700)).map_err(err)?;
    }
    let placeholder = tempfile::Builder::new()
        .prefix("op-")
        .suffix(".pending")
        .tempfile_in(root)
        .map_err(err)?;
    let id = placeholder
        .path()
        .file_stem()
        .and_then(|s| s.to_str())
        .ok_or("recovery.invalidRecord")?
        .to_string();
    let mut record = Record {
        id,
        kind: job.kind.clone(),
        state: "prepared".into(),
        created_at: now(),
        updated_at: now(),
        items: vec![],
        bytes: 0,
        session: session().into(),
        persistent: settings.persist_history,
        schema_version: 1,
        settings,
        sources: vec![],
        result: None,
    };
    for target in &job.targets {
        if !target.path.contains("://") {
            let path = absolute(Path::new(&target.path))?;
            record.sources.push((path.clone(), fingerprint(&path)?));
        }
    }
    // Keep the reservation under RAII until preparation has finished. It is
    // never published as JSON; errors and unwinding remove it automatically.
    let reversible = matches!(
        job.kind,
        FileOperationKind::Rename
            | FileOperationKind::Move
            | FileOperationKind::Mkdir
            | FileOperationKind::CreateFile
            | FileOperationKind::Copy
            | FileOperationKind::ExtractArchive
            | FileOperationKind::CreateArchive
            | FileOperationKind::Chmod
            | FileOperationKind::WindowsAttributes
    ) && job.targets.iter().all(|t| !t.path.contains("://"));
    if !reversible {
        save(root, &record)?;
        let mut result = crate::file_ops::execute_file_operation_job_blocking_with_cancellation(
            job,
            cancellation,
        );
        record.result = Some(result.clone());
        record.state = "unsupported".into();
        save(root, &record)?;
        retain(root, record.settings.history_limit)?;
        result.recovery_status = Some("unsupported".into());
        if !result.succeeded.is_empty() {
            invalidate_redo(root)?;
        }
        return Ok(result);
    }
    let grouped = matches!(
        job.kind,
        FileOperationKind::Mkdir | FileOperationKind::CreateFile | FileOperationKind::CreateArchive
    );
    let count = if grouped { 1 } else { job.targets.len() };
    let mut jobs = vec![];
    for index in 0..count {
        let mut one = job.clone();
        if !grouped {
            one.targets = vec![job.targets[index].clone()];
        }
        let moving = matches!(
            one.kind,
            FileOperationKind::Rename | FileOperationKind::Move
        );
        let attrs = matches!(
            one.kind,
            FileOperationKind::Chmod | FileOperationKind::WindowsAttributes
        );
        let before_path = if moving || attrs {
            Some(absolute(Path::new(&one.targets[0].path))?)
        } else {
            None
        };
        let after_path = if attrs {
            before_path.clone().unwrap()
        } else if matches!(one.kind, FileOperationKind::Rename) {
            absolute(
                &parent(before_path.as_ref().unwrap())?
                    .join(crate::file_ops::requested_name(&one)?),
            )?
        } else {
            let destination = crate::file_ops::destination_dir(&one)?;
            let name = if grouped {
                crate::file_ops::requested_name(&one)?.to_string()
            } else if matches!(one.kind, FileOperationKind::ExtractArchive) {
                crate::archive::archive_destination_stem(Path::new(&one.targets[0].path))?
            } else {
                Path::new(&one.targets[0].path)
                    .file_name()
                    .and_then(|v| v.to_str())
                    .ok_or("recovery.invalidPath")?
                    .to_string()
            };
            absolute(&destination.join(name))?
        };
        if !attrs && exists(&after_path) {
            return Err("recovery.destinationExists".into());
        }
        let before = before_path.as_deref().map(fingerprint).transpose()?;
        if attrs
            && before
                .as_ref()
                .is_some_and(|f| f.kind == "symlink" || f.kind == "other")
        {
            return Err("recovery.unsupportedTarget".into());
        }
        let before_parent = before_path
            .as_deref()
            .map(|p| fingerprint(&parent(p)?))
            .transpose()?;
        let after_parent = fingerprint(&parent(&after_path)?)?;
        let staging = if !moving && !attrs {
            Some(parent(&after_path)?.join(format!(".windy-recovery-{}-{index}", record.id)))
        } else {
            None
        };
        let held = staging.as_ref().map(|p| p.join("held"));
        record.items.push(Item {
            before_path,
            after_path,
            state: "prepared".into(),
            before,
            after: None,
            before_parent,
            after_parent,
            staging,
            held,
            storage_identity: None,
        });
        jobs.push(one);
    }
    // Reject overlapping roots before mutation: receipts must not invalidate one another.
    for (i, a) in record.items.iter().enumerate() {
        for b in record.items.iter().skip(i + 1) {
            for p in [a.before_path.as_ref(), Some(&a.after_path)]
                .into_iter()
                .flatten()
            {
                for q in [b.before_path.as_ref(), Some(&b.after_path)]
                    .into_iter()
                    .flatten()
                {
                    if p.starts_with(q) || q.starts_with(p) {
                        return Err("recovery.overlappingTargets".into());
                    }
                }
            }
        }
    }
    record.updated_at = next_timestamp(root)?;
    save(root, &record)?;
    let mut result = FileOperationResult {
        succeeded: vec![],
        failed: vec![],
        canceled: false,
        recovery_id: Some(record.id.clone()),
        recovery_status: Some("protected".into()),
    };
    for (index, mut one) in jobs.into_iter().enumerate() {
        if cancellation.load(Ordering::Relaxed) {
            result.canceled = true;
            break;
        }
        crate::activity_progress::target(
            index + 1,
            &record.items[index].after_path.to_string_lossy(),
        );
        record.items[index].state = "pending".into();
        save(root, &record)?;
        if let Some(staging) = record.items[index].staging.clone() {
            fs::create_dir(&staging).map_err(err)?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                fs::set_permissions(&staging, fs::Permissions::from_mode(0o700)).map_err(err)?;
            }
            record.items[index].storage_identity = Some(fingerprint(&staging)?);
            save(root, &record)?;
        }
        let item = &record.items[index];
        let action = (|| -> Result<(), String> {
            if !same_object(
                &item.after_parent,
                &fingerprint(&parent(&item.after_path)?)?,
            ) {
                return Err("recovery.parentChanged".into());
            }
            if let Some(before) = &item.before {
                if !same_object(before, &fingerprint(item.before_path.as_ref().unwrap())?) {
                    return Err("recovery.targetChanged".into());
                }
            }
            if matches!(
                one.kind,
                FileOperationKind::Move | FileOperationKind::Rename
            ) {
                let from = item.before_path.as_ref().unwrap();
                if item.after_path.starts_with(from) {
                    return Err("recovery.overlappingTargets".into());
                }
                move_no_replace(from, &item.after_path).map_err(err)?;
            } else if let Some(staging) = &item.staging {
                one.destination_path = Some(staging.to_string_lossy().into_owned());
                let partial =
                    crate::file_ops::execute_file_operation_job_blocking_with_cancellation(
                        one,
                        Arc::clone(&cancellation),
                    );
                if partial.canceled {
                    return Err("recovery.canceled".into());
                }
                if let Some(f) = partial.failed.first() {
                    return Err(f.message.clone());
                }
                let output =
                    staging.join(item.after_path.file_name().ok_or("recovery.invalidPath")?);
                if !same_object(
                    &item.after_parent,
                    &fingerprint(&parent(&item.after_path)?)?,
                ) {
                    return Err("recovery.parentChanged".into());
                }
                move_no_replace(&output, &item.after_path).map_err(err)?;
            } else {
                one.targets[0].path = item.after_path.to_string_lossy().into_owned();
                let partial =
                    crate::file_ops::execute_file_operation_job_blocking_with_cancellation(
                        one,
                        Arc::clone(&cancellation),
                    );
                if let Some(f) = partial.failed.first() {
                    return Err(f.message.clone());
                }
            }
            Ok(())
        })();
        match action {
            Ok(()) => {
                record.items[index].after = Some(fingerprint(&record.items[index].after_path)?);
                record.items[index].state = "applied".into();
                result.succeeded.push(FileOperationResultItem {
                    path: record.items[index]
                        .after_path
                        .to_string_lossy()
                        .into_owned(),
                    message: "recovery.completed".into(),
                });
            }
            Err(message) => {
                record.items[index].state = "unknown".into();
                if matches!(
                    record.kind,
                    FileOperationKind::Chmod | FileOperationKind::WindowsAttributes
                ) {
                    let item = &mut record.items[index];
                    if let (Some(before), Ok(after)) = (&item.before, fingerprint(&item.after_path))
                    {
                        if same_object(before, &after) {
                            item.state = if before == &after {
                                "failed"
                            } else {
                                "applied"
                            }
                            .into();
                            item.after = Some(after);
                        }
                    }
                }
                if message == "recovery.canceled" {
                    result.canceled = true;
                } else {
                    result.failed.push(FileOperationResultItem {
                        path: record.items[index]
                            .after_path
                            .to_string_lossy()
                            .into_owned(),
                        message,
                    });
                }
            }
        }
        save(root, &record)?;
        if record.items[index].state == "unknown" {
            break;
        }
    }
    record.state = if record
        .items
        .iter()
        .any(|i| i.state == "unknown" || i.state == "pending")
    {
        "interrupted"
    } else if record.items.iter().any(|i| i.state == "applied") {
        "applied"
    } else {
        "failed"
    }
    .into();
    record.result = Some(result.clone());
    save(root, &record)?;
    if record
        .items
        .iter()
        .any(|i| matches!(i.state.as_str(), "applied" | "unknown" | "pending"))
    {
        invalidate_redo(root)?;
    }
    retain(root, record.settings.history_limit)?;
    result.recovery_status = Some(record.state.clone());
    Ok(result)
}

fn restore(
    root: &Path,
    id: &str,
    direction: &str,
    cancellation: &Arc<AtomicBool>,
) -> FileOperationResult {
    let action = (|| -> Result<FileOperationResult, String> {
        let mut record = read(root, id)?;
        let checked = plan(record.clone(), direction);
        if let Some(issue) = checked.issues.first() {
            return Err(issue.message_id.clone());
        }
        record.session = session().into();
        record.updated_at = next_timestamp(root)?;
        let mut result = FileOperationResult {
            succeeded: vec![],
            failed: vec![],
            canceled: false,
            recovery_id: Some(id.into()),
            recovery_status: Some("protected".into()),
        };
        let indexes: Vec<_> = if direction == "undo" {
            (0..record.items.len()).rev().collect()
        } else {
            (0..record.items.len()).collect()
        };
        for index in indexes {
            if record.items[index].state
                != if direction == "undo" {
                    "applied"
                } else {
                    "undone"
                }
            {
                continue;
            }
            if cancellation.load(Ordering::Relaxed) {
                result.canceled = true;
                break;
            }
            let (from, to) = match check_item(&record.kind, &record.items[index], direction) {
                Ok(v) => v,
                Err(e) => {
                    result.failed.push(FileOperationResultItem {
                        path: record.items[index]
                            .after_path
                            .to_string_lossy()
                            .into_owned(),
                        message: e,
                    });
                    break;
                }
            };
            crate::activity_progress::target(index + 1, &from.to_string_lossy());
            record.items[index].state = "pending".into();
            record.state = "interrupted".into();
            save(root, &record)?;
            let outcome = if matches!(
                record.kind,
                FileOperationKind::Chmod | FileOperationKind::WindowsAttributes
            ) {
                let desired = if direction == "undo" {
                    record.items[index].before.as_ref()
                } else {
                    record.items[index].after.as_ref()
                }
                .ok_or("recovery.interrupted")?;
                restore_attributes(&from, desired, &record.kind)
            } else {
                move_no_replace(&from, &to).map_err(err)
            };
            match outcome {
                Ok(()) => {
                    record.items[index].state = if direction == "undo" {
                        "undone"
                    } else {
                        "applied"
                    }
                    .into();
                    result.succeeded.push(FileOperationResultItem {
                        path: to.to_string_lossy().into_owned(),
                        message: "recovery.restored".into(),
                    });
                }
                Err(e) => {
                    record.items[index].state = "unknown".into();
                    result.failed.push(FileOperationResultItem {
                        path: from.to_string_lossy().into_owned(),
                        message: e,
                    });
                }
            }
            save(root, &record)?;
            if !result.failed.is_empty() {
                break;
            }
        }
        let active: Vec<_> = record
            .items
            .iter()
            .filter(|i| i.state != "prepared" && i.state != "failed")
            .collect();
        record.state = if active
            .iter()
            .any(|i| i.state == "unknown" || i.state == "pending")
        {
            "interrupted"
        } else if active.iter().all(|i| i.state == "undone") {
            "undone"
        } else if active.iter().all(|i| i.state == "applied") {
            "applied"
        } else {
            "partial"
        }
        .into();
        save(root, &record)?;
        result.recovery_status = Some(record.state.clone());
        Ok(result)
    })();
    action.unwrap_or_else(failure)
}
fn restore_attributes(
    path: &Path,
    value: &Fingerprint,
    kind: &FileOperationKind,
) -> Result<(), String> {
    if matches!(kind, FileOperationKind::Chmod) {
        crate::file_ops::set_local_mode(path, value.mode)
    } else {
        crate::file_ops::restore_windows_attributes(path, value.readonly, value.hidden)
    }
}

// A separate existence check followed by std::fs::rename can overwrite a file
// created in between. Each supported OS must reject replacement in the syscall.
pub(crate) fn move_no_replace(from: &Path, to: &Path) -> io::Result<()> {
    #[cfg(unix)]
    {
        use std::os::unix::ffi::OsStrExt;
        let from = std::ffi::CString::new(from.as_os_str().as_bytes())?;
        let to = std::ffi::CString::new(to.as_os_str().as_bytes())?;
        #[cfg(target_os = "macos")]
        {
            unsafe extern "C" {
                fn renamex_np(
                    from: *const std::ffi::c_char,
                    to: *const std::ffi::c_char,
                    flags: u32,
                ) -> i32;
            }
            if unsafe { renamex_np(from.as_ptr(), to.as_ptr(), 4) } == 0 {
                return Ok(());
            }
        }
        #[cfg(target_os = "linux")]
        {
            unsafe extern "C" {
                fn renameat2(
                    fd: i32,
                    from: *const std::ffi::c_char,
                    td: i32,
                    to: *const std::ffi::c_char,
                    flags: u32,
                ) -> i32;
            }
            if unsafe { renameat2(-100, from.as_ptr(), -100, to.as_ptr(), 1) } == 0 {
                return Ok(());
            }
        }
        Err(io::Error::last_os_error())
    }
    #[cfg(windows)]
    {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "kernel32")]
        unsafe extern "system" {
            fn MoveFileExW(from: *const u16, to: *const u16, flags: u32) -> i32;
        }
        let from: Vec<_> = from.as_os_str().encode_wide().chain(Some(0)).collect();
        let to: Vec<_> = to.as_os_str().encode_wide().chain(Some(0)).collect();
        if unsafe { MoveFileExW(from.as_ptr(), to.as_ptr(), 0) } != 0 {
            Ok(())
        } else {
            Err(io::Error::last_os_error())
        }
    }
}
#[cfg(windows)]
fn windows_identity(path: &Path) -> Result<String, String> {
    use std::os::windows::{fs::OpenOptionsExt, io::AsRawHandle};
    #[repr(C)]
    struct Info {
        attributes: u32,
        created: [u32; 2],
        accessed: [u32; 2],
        written: [u32; 2],
        volume: u32,
        size_high: u32,
        size_low: u32,
        links: u32,
        index_high: u32,
        index_low: u32,
    }
    #[link(name = "kernel32")]
    unsafe extern "system" {
        fn GetFileInformationByHandle(handle: *mut std::ffi::c_void, info: *mut Info) -> i32;
    }
    let file = fs::OpenOptions::new()
        .read(true)
        .custom_flags(0x02000000 | 0x00200000)
        .open(path)
        .map_err(err)?;
    let mut info = std::mem::MaybeUninit::<Info>::uninit();
    if unsafe { GetFileInformationByHandle(file.as_raw_handle(), info.as_mut_ptr()) } == 0 {
        return Err(err(io::Error::last_os_error()));
    }
    let info = unsafe { info.assume_init() };
    Ok(format!(
        "{}:{}:{}",
        info.volume, info.index_high, info.index_low
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    fn job(
        kind: &str,
        source: Option<&Path>,
        destination: &Path,
        name: Option<&str>,
    ) -> FileOperationJob {
        serde_json::from_value(serde_json::json!({"kind":kind,"destinationPath":destination,"requestedName":name,"targets":source.map(|p|vec![serde_json::json!({"path":p})]).unwrap_or_default()})).unwrap()
    }
    fn protected(root: &Path, job: FileOperationJob) -> FileOperationResult {
        execute_protected(
            root,
            job,
            RecoverySettings {
                enabled: true,
                history_limit: 20,
                persist_history: true,
            },
            Arc::new(AtomicBool::new(false)),
        )
        .unwrap()
    }
    fn run_restore(root: &Path, id: &str, direction: &str) -> FileOperationResult {
        restore(root, id, direction, &Arc::new(AtomicBool::new(false)))
    }
    #[test]
    fn move_preserves_edits_and_rejects_collision_and_replacement() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let dest = tmp.path().join("dest");
        fs::create_dir(&dest).unwrap();
        let src = tmp.path().join("file");
        fs::write(&src, b"before").unwrap();
        let r = protected(&journal, job("move", Some(&src), &dest, None));
        assert!(r.failed.is_empty());
        let id = r.recovery_id.unwrap();
        fs::write(dest.join("file"), b"edited").unwrap();
        fs::write(&src, b"collision").unwrap();
        assert!(!run_restore(&journal, &id, "undo").failed.is_empty());
        assert_eq!(fs::read(&src).unwrap(), b"collision");
        fs::remove_file(&src).unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert_eq!(fs::read(&src).unwrap(), b"edited");
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        fs::rename(dest.join("file"), dest.join("original")).unwrap();
        fs::write(dest.join("file"), b"replacement").unwrap();
        assert!(!run_restore(&journal, &id, "undo").failed.is_empty());
        assert_eq!(fs::read(dest.join("file")).unwrap(), b"replacement");
    }
    #[test]
    fn copy_undo_retains_edits_and_redo_does_not_read_source() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let dest = tmp.path().join("dest");
        fs::create_dir(&dest).unwrap();
        let src = tmp.path().join("file");
        fs::write(&src, b"before").unwrap();
        let r = protected(&journal, job("copy", Some(&src), &dest, None));
        assert!(
            r.failed.is_empty(),
            "{:?}",
            r.failed.iter().map(|i| &i.message).collect::<Vec<_>>()
        );
        let id = r.recovery_id.unwrap();
        fs::write(dest.join("file"), b"edited").unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(!dest.join("file").exists());
        fs::remove_file(src).unwrap();
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        assert_eq!(fs::read(dest.join("file")).unwrap(), b"edited");
    }
    #[test]
    fn created_directory_with_new_contents_is_retained() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = protected(&journal, job("mkdir", None, tmp.path(), Some("created")));
        let id = r.recovery_id.unwrap();
        fs::write(tmp.path().join("created/new"), b"precious").unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        let record = read(&journal, &id).unwrap();
        assert_eq!(
            fs::read(record.items[0].held.as_ref().unwrap().join("new")).unwrap(),
            b"precious"
        );
        retain(&journal, 1).unwrap();
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
    }
    #[test]
    fn history_limit_retains_held_data() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = protected(
            &journal,
            job("createFile", None, tmp.path(), Some("created")),
        );
        let id = r.recovery_id.unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        protected(
            &journal,
            job("createFile", None, tmp.path(), Some("second")),
        );
        retain(&journal, 1).unwrap();
        let record = read(&journal, &id).unwrap();
        assert_eq!(record.state, "retained");
        assert!(record.items[0].held.as_ref().unwrap().exists());
    }
    #[test]
    fn pending_record_is_never_blindly_replayed() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = protected(
            &journal,
            job("createFile", None, tmp.path(), Some("created")),
        );
        let id = r.recovery_id.unwrap();
        let mut record = read(&journal, &id).unwrap();
        record.state = "interrupted".into();
        record.items[0].state = "pending".into();
        save(&journal, &record).unwrap();
        assert!(!run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(tmp.path().join("created").exists());
    }
    #[test]
    fn disabled_protection_keeps_refresh_redo_but_invalidates_on_new_change() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = protected(&journal, job("createFile", None, tmp.path(), Some("first")));
        let id = r.recovery_id.unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        let refresh = execute_at(
            &journal,
            job("refresh", None, tmp.path(), None),
            Arc::new(AtomicBool::new(false)),
        );
        assert!(refresh.failed.is_empty());
        assert_eq!(read(&journal, &id).unwrap().state, "undone");
        let r = execute_at(
            &journal,
            job("createFile", None, tmp.path(), Some("second")),
            Arc::new(AtomicBool::new(false)),
        );
        assert!(r.failed.is_empty());
        assert!(r.recovery_id.is_none());
        assert_eq!(read(&journal, &id).unwrap().state, "retained");
    }
    #[test]
    fn forgetting_does_not_delete_retained_contents() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = protected(
            &journal,
            job("createFile", None, tmp.path(), Some("created")),
        );
        let id = r.recovery_id.unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(forget(&journal, &id).is_err());
        assert!(read(&journal, &id).unwrap().items[0]
            .held
            .as_ref()
            .unwrap()
            .exists());
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        forget(&journal, &id).unwrap();
        assert!(tmp.path().join("created").exists());
        assert!(read(&journal, &id).is_err());
    }
    #[test]
    fn missing_source_during_preflight_does_not_poison_history() {
        let tmp = tempfile::tempdir().expect("create isolated fixture");
        let journal = tmp.path().join("journal");
        let first = protected(&journal, job("createFile", None, tmp.path(), Some("first")));
        let id = first
            .recovery_id
            .expect("obtain protected operation receipt");
        let missing = tmp.path().join("missing");
        let result = execute_protected(
            &journal,
            job("copy", Some(&missing), tmp.path(), None),
            RecoverySettings::default(),
            Arc::new(AtomicBool::new(false)),
        );
        assert!(result.is_err());
        assert!(!missing.exists());
        assert_eq!(
            fs::read_dir(&journal)
                .expect("list fixture directory")
                .count(),
            1
        );
        assert_eq!(
            history_at(&journal, true)
                .expect("load recovery history")
                .records
                .len(),
            1
        );
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        let next = protected(&journal, job("createFile", None, tmp.path(), Some("next")));
        assert!(next.failed.is_empty());
        assert_eq!(
            records(&journal)
                .expect("load valid recovery records")
                .len(),
            2
        );
    }
    #[test]
    fn damaged_records_are_reported_without_losing_history_or_retained_data() {
        let tmp = tempfile::tempdir().expect("create isolated fixture");
        let journal = tmp.path().join("journal");
        let first = protected(&journal, job("createFile", None, tmp.path(), Some("first")));
        let id = first
            .recovery_id
            .expect("obtain protected operation receipt");
        fs::write(tmp.path().join("first"), b"retained contents").expect("write fixture contents");
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        let held = read(&journal, &id)
            .expect("read fixture recovery record")
            .items[0]
            .held
            .clone()
            .expect("read fixture recovery record");
        fs::write(journal.join("empty.json"), b"").expect("write fixture contents");
        fs::write(journal.join("broken.json"), b"{not json").expect("write fixture contents");
        let history = history_at(&journal, true).expect("load recovery history");
        assert_eq!(history.records.len(), 1);
        assert_eq!(history.issues.len(), 2);
        assert!(history
            .issues
            .iter()
            .all(|i| i.message_id == "recovery.invalidRecord"));
        assert_eq!(
            fs::read(&held).expect("read fixture contents"),
            b"retained contents"
        );
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        let next = protected(&journal, job("createFile", None, tmp.path(), Some("next")));
        assert!(next.failed.is_empty());
        retain(&journal, 1).expect("prune only safe history");
        assert_eq!(
            fs::read(journal.join("empty.json")).expect("read fixture contents"),
            b""
        );
        assert_eq!(
            fs::read(journal.join("broken.json")).expect("read fixture contents"),
            b"{not json"
        );
        assert_eq!(
            fs::read(tmp.path().join("first")).expect("read fixture contents"),
            b"retained contents"
        );
    }
    #[test]
    fn journal_failure_blocks_before_mutating_files() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("not-a-directory");
        fs::write(&journal, b"blocking").unwrap();
        let outcome = execute_protected(
            &journal,
            job("createFile", None, tmp.path(), Some("created")),
            RecoverySettings::default(),
            Arc::new(AtomicBool::new(false)),
        );
        assert!(outcome.is_err());
        assert!(!tmp.path().join("created").exists());
    }
    #[test]
    fn no_replace_preserves_existing_destination() {
        let tmp = tempfile::tempdir().unwrap();
        let from = tmp.path().join("from");
        let to = tmp.path().join("to");
        fs::write(&from, b"source").unwrap();
        fs::write(&to, b"destination").unwrap();
        assert!(move_no_replace(&from, &to).is_err());
        assert_eq!(fs::read(to).unwrap(), b"destination");
        assert!(from.exists());
    }
    #[cfg(unix)]
    #[test]
    fn chmod_restores_recorded_mode_and_blocks_external_change() {
        use std::os::unix::fs::PermissionsExt;
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let path = tmp.path().join("file");
        fs::write(&path, b"data").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o600)).unwrap();
        let r = protected(&journal, job("chmod", Some(&path), tmp.path(), Some("644")));
        assert!(r.failed.is_empty());
        let id = r.recovery_id.unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o600
        );
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        assert!(!run_restore(&journal, &id, "undo").failed.is_empty());
    }
    #[test]
    fn cancellation_before_first_target_keeps_files_and_no_applied_items() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let r = execute_protected(
            &journal,
            job("createFile", None, tmp.path(), Some("file")),
            RecoverySettings::default(),
            Arc::new(AtomicBool::new(true)),
        )
        .unwrap();
        assert!(r.canceled);
        assert!(!tmp.path().join("file").exists());
        assert!(r.succeeded.is_empty());
    }
    #[test]
    fn archives_use_created_output_receipts() {
        let tmp = tempfile::tempdir().unwrap();
        let journal = tmp.path().join("journal");
        let file = tmp.path().join("file");
        fs::write(&file, b"archive contents").unwrap();
        let output = tmp.path().join("out");
        fs::create_dir(&output).unwrap();
        let r = protected(
            &journal,
            job("createArchive", Some(&file), &output, Some("test.zip")),
        );
        assert!(r.failed.is_empty());
        let id = r.recovery_id.unwrap();
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
        let r = protected(
            &journal,
            job(
                "extractArchive",
                Some(&output.join("test.zip")),
                &output,
                None,
            ),
        );
        assert!(r.failed.is_empty());
        let id = r.recovery_id.unwrap();
        assert_eq!(
            fs::read(output.join("test/file")).unwrap(),
            b"archive contents"
        );
        assert!(run_restore(&journal, &id, "undo").failed.is_empty());
        assert!(run_restore(&journal, &id, "redo").failed.is_empty());
    }
}
