use crate::path_utils::{format_io_error, path_to_string};
use crate::{build_file_entry, sort_entries, EntryKind, FileEntry};
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
};

pub(crate) const SEARCH_MAX_RESULTS: usize = 10_000;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchDirectoryRequest {
    pub(crate) root_path: String,
    pub(crate) name_regex: String,
    #[serde(default)]
    pub(crate) recursive: bool,
    #[serde(default)]
    pub(crate) min_size_bytes: Option<u64>,
    #[serde(default)]
    pub(crate) max_size_bytes: Option<u64>,
    #[serde(default)]
    pub(crate) modified_after: Option<u64>,
    #[serde(default)]
    pub(crate) modified_before: Option<u64>,
    #[serde(default)]
    pub(crate) kind: Option<String>,
    #[serde(default)]
    pub(crate) hidden_mode: Option<String>,
    #[serde(default)]
    pub(crate) readonly_mode: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchDirectoryListing {
    pub(crate) root_path: String,
    pub(crate) display_path: String,
    pub(crate) query_label: String,
    pub(crate) entries: Vec<FileEntry>,
    pub(crate) truncated: bool,
}

struct SearchContext<'a> {
    regex: &'a Option<Regex>,
    request: &'a SearchDirectoryRequest,
    kind: &'a str,
    hidden_mode: &'a str,
    readonly_mode: &'a str,
}

#[tauri::command]
pub(crate) fn search_directory(
    request: SearchDirectoryRequest,
) -> Result<SearchDirectoryListing, String> {
    search_directory_blocking(request)
}

pub(crate) fn search_directory_blocking(
    request: SearchDirectoryRequest,
) -> Result<SearchDirectoryListing, String> {
    let root_path = PathBuf::from(request.root_path.trim());
    if !root_path.is_dir() {
        return Err(format!(
            "Search root is not a directory: {}",
            path_to_string(&root_path)
        ));
    }

    let name_regex = request.name_regex.trim();
    let regex = if name_regex.is_empty() {
        None
    } else {
        Some(Regex::new(name_regex).map_err(|error| format!("Invalid name regex: {error}"))?)
    };
    let kind = normalized_search_kind(request.kind.as_deref())?;
    let hidden_mode = normalized_search_hidden_mode(request.hidden_mode.as_deref())?;
    let readonly_mode = normalized_search_readonly_mode(request.readonly_mode.as_deref())?;
    if let (Some(min_size), Some(max_size)) = (request.min_size_bytes, request.max_size_bytes) {
        if min_size > max_size {
            return Err("Search min size must be less than or equal to max size".to_string());
        }
    }
    if let (Some(modified_after), Some(modified_before)) =
        (request.modified_after, request.modified_before)
    {
        if modified_after > modified_before {
            return Err(
                "Search modified-after must be less than or equal to modified-before".to_string(),
            );
        }
    }

    let mut entries = Vec::new();
    let mut truncated = false;
    let context = SearchContext {
        regex: &regex,
        request: &request,
        kind: &kind,
        hidden_mode: &hidden_mode,
        readonly_mode: &readonly_mode,
    };
    collect_search_entries(&root_path, &context, &mut entries, &mut truncated)?;
    sort_entries(&mut entries);

    let query_label = if name_regex.is_empty() {
        "*".to_string()
    } else {
        name_regex.to_string()
    };
    let mut query_parts = vec![query_label.clone()];
    if request.recursive {
        query_parts.push("recursive".to_string());
    }
    if let Some(min_size) = request.min_size_bytes {
        query_parts.push(format!("size>={min_size}"));
    }
    if let Some(max_size) = request.max_size_bytes {
        query_parts.push(format!("size<={max_size}"));
    }
    if let Some(modified_after) = request.modified_after {
        query_parts.push(format!("modified>={modified_after}"));
    }
    if let Some(modified_before) = request.modified_before {
        query_parts.push(format!("modified<={modified_before}"));
    }
    let query_label = query_parts.join(", ");
    Ok(SearchDirectoryListing {
        root_path: path_to_string(&root_path),
        display_path: format!("search:{} [{}]", path_to_string(&root_path), query_label),
        query_label,
        entries,
        truncated,
    })
}

fn collect_search_entries(
    current_path: &Path,
    context: &SearchContext<'_>,
    entries: &mut Vec<FileEntry>,
    truncated: &mut bool,
) -> Result<(), String> {
    if *truncated {
        return Ok(());
    }

    for entry in fs::read_dir(current_path)
        .map_err(|error| format_io_error("read search root", current_path, error))?
    {
        if *truncated {
            break;
        }
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();
        let Ok(file_entry) = build_file_entry(path.clone(), name) else {
            continue;
        };
        let should_recurse = context.request.recursive && file_entry.kind == EntryKind::Directory;
        if search_entry_matches(&file_entry, context) {
            entries.push(file_entry);
            if entries.len() >= SEARCH_MAX_RESULTS {
                *truncated = true;
                break;
            }
        }
        if should_recurse {
            let _ = collect_search_entries(&path, context, entries, truncated);
        }
    }
    Ok(())
}

fn search_entry_matches(entry: &FileEntry, context: &SearchContext<'_>) -> bool {
    if let Some(regex) = context.regex {
        if !regex.is_match(&entry.name) {
            return false;
        }
    }
    if !search_kind_matches(&entry.kind, context.kind) {
        return false;
    }
    if let Some(min_size) = context.request.min_size_bytes {
        if entry.size.is_none_or(|size| size < min_size) {
            return false;
        }
    }
    if let Some(max_size) = context.request.max_size_bytes {
        if entry.size.is_none_or(|size| size > max_size) {
            return false;
        }
    }
    if let Some(modified_after) = context.request.modified_after {
        if entry
            .modified_at
            .is_none_or(|modified_at| modified_at < modified_after)
        {
            return false;
        }
    }
    if let Some(modified_before) = context.request.modified_before {
        if entry
            .modified_at
            .is_none_or(|modified_at| modified_at > modified_before)
        {
            return false;
        }
    }
    if context.hidden_mode == "exclude" && entry.hidden {
        return false;
    }
    if context.hidden_mode == "only" && !entry.hidden {
        return false;
    }
    if context.readonly_mode == "readonly" && !entry.readonly {
        return false;
    }
    if context.readonly_mode == "writable" && entry.readonly {
        return false;
    }
    true
}

pub(crate) fn normalized_search_kind(value: Option<&str>) -> Result<String, String> {
    let kind = value.unwrap_or("all").trim();
    match kind {
        "" | "all" => Ok("all".to_string()),
        "file" | "directory" | "symlink" | "other" => Ok(kind.to_string()),
        _ => Err("Unsupported search kind.".to_string()),
    }
}

fn search_kind_matches(entry_kind: &EntryKind, kind: &str) -> bool {
    match kind {
        "file" => matches!(entry_kind, EntryKind::File),
        "directory" => matches!(entry_kind, EntryKind::Directory),
        "symlink" => matches!(entry_kind, EntryKind::Symlink),
        "other" => matches!(entry_kind, EntryKind::Other),
        _ => true,
    }
}

pub(crate) fn normalized_search_hidden_mode(value: Option<&str>) -> Result<String, String> {
    let mode = value.unwrap_or("exclude").trim();
    match mode {
        "" | "exclude" => Ok("exclude".to_string()),
        "include" | "only" => Ok(mode.to_string()),
        _ => Err("Unsupported hidden search mode.".to_string()),
    }
}

pub(crate) fn normalized_search_readonly_mode(value: Option<&str>) -> Result<String, String> {
    let mode = value.unwrap_or("any").trim();
    match mode {
        "" | "any" => Ok("any".to_string()),
        "readonly" | "writable" => Ok(mode.to_string()),
        _ => Err("Unsupported readonly search mode.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn request(root_path: String) -> SearchDirectoryRequest {
        SearchDirectoryRequest {
            root_path,
            name_regex: String::new(),
            recursive: false,
            min_size_bytes: None,
            max_size_bytes: None,
            modified_after: None,
            modified_before: None,
            kind: None,
            hidden_mode: None,
            readonly_mode: None,
        }
    }

    #[test]
    fn search_directory_truncates_large_result_sets() {
        let root = tempdir().expect("create search root");
        for index in 0..=SEARCH_MAX_RESULTS {
            fs::write(root.path().join(format!("{index:05}.txt")), "x")
                .expect("write search fixture");
        }

        let listing = search_directory_blocking(request(root.path().to_string_lossy().to_string()))
            .expect("search large fixture");

        assert_eq!(listing.entries.len(), SEARCH_MAX_RESULTS);
        assert!(listing.truncated);
    }
}
