use crate::path_utils::{format_io_error, path_to_string};
use crate::search::{
    normalized_search_hidden_mode, normalized_search_kind, normalized_search_readonly_mode,
};
use crate::sftp::{
    next_sftp_profile_id, normalized_sftp_auth_kind, normalized_sftp_remote_path,
    validate_sftp_connection_request, SftpConnectionProfile,
};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
};

static LOCATION_PROFILE_ID: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocalFavoriteProfile {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) path: String,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SearchProfile {
    pub(crate) id: String,
    pub(crate) name: String,
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveLocalFavoriteProfileRequest {
    id: Option<String>,
    name: String,
    path: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveSearchProfileRequest {
    id: Option<String>,
    name: String,
    root_path: String,
    name_regex: String,
    #[serde(default)]
    recursive: bool,
    #[serde(default)]
    min_size_bytes: Option<u64>,
    #[serde(default)]
    max_size_bytes: Option<u64>,
    #[serde(default)]
    modified_after: Option<u64>,
    #[serde(default)]
    modified_before: Option<u64>,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    hidden_mode: Option<String>,
    #[serde(default)]
    readonly_mode: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SaveSftpConnectionProfileRequest {
    id: Option<String>,
    name: String,
    host: String,
    port: u16,
    username: String,
    remote_path: String,
    auth_kind: Option<String>,
    private_key_path: Option<String>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LocationProfilesFile {
    #[serde(default)]
    pub(crate) local_favorites: Vec<LocalFavoriteProfile>,
    #[serde(default)]
    pub(crate) search_profiles: Vec<SearchProfile>,
    #[serde(default)]
    pub(crate) sftp_profiles: Vec<SftpConnectionProfile>,
}

#[tauri::command]
pub(crate) fn list_sftp_connection_profiles() -> Result<Vec<SftpConnectionProfile>, String> {
    let profiles = load_location_profiles()?;
    Ok(profiles.sftp_profiles)
}

#[tauri::command]
pub(crate) fn list_local_favorite_profiles() -> Result<Vec<LocalFavoriteProfile>, String> {
    let profiles = load_location_profiles()?;
    Ok(profiles.local_favorites)
}

#[tauri::command]
pub(crate) fn list_search_profiles() -> Result<Vec<SearchProfile>, String> {
    let profiles = load_location_profiles()?;
    Ok(profiles.search_profiles)
}

#[tauri::command]
pub(crate) fn save_search_profile(
    request: SaveSearchProfileRequest,
) -> Result<SearchProfile, String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("Search profile name is required.".to_string());
    }
    let root_path = PathBuf::from(request.root_path.trim());
    if !root_path.is_dir() {
        return Err(format!(
            "Search root is not a directory: {}",
            path_to_string(&root_path)
        ));
    }

    let kind = normalized_search_kind(request.kind.as_deref())?;
    let hidden_mode = normalized_search_hidden_mode(request.hidden_mode.as_deref())?;
    let readonly_mode = normalized_search_readonly_mode(request.readonly_mode.as_deref())?;
    let profile = SearchProfile {
        id: request
            .id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(next_search_profile_id),
        name: name.to_string(),
        root_path: path_to_string(&root_path),
        name_regex: request.name_regex.trim().to_string(),
        recursive: request.recursive,
        min_size_bytes: request.min_size_bytes,
        max_size_bytes: request.max_size_bytes,
        modified_after: request.modified_after,
        modified_before: request.modified_before,
        kind: Some(kind),
        hidden_mode: Some(hidden_mode),
        readonly_mode: Some(readonly_mode),
    };

    let path = location_profiles_path()?;
    let mut profiles = load_location_profiles_from_path(&path)?;
    if let Some(existing) = profiles
        .search_profiles
        .iter_mut()
        .find(|existing| existing.id == profile.id)
    {
        *existing = profile.clone();
    } else {
        profiles.search_profiles.push(profile.clone());
    }
    sort_search_profiles(&mut profiles.search_profiles);
    save_location_profiles_to_path(&path, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub(crate) fn delete_search_profile(id: String) -> Result<(), String> {
    let path = location_profiles_path()?;
    delete_search_profile_from_path(&path, &id)
}

#[tauri::command]
pub(crate) fn save_local_favorite_profile(
    request: SaveLocalFavoriteProfileRequest,
) -> Result<LocalFavoriteProfile, String> {
    let name = request.name.trim();
    if name.is_empty() {
        return Err("Local favorite name is required.".to_string());
    }

    let path = PathBuf::from(request.path.trim());
    if !path.is_dir() {
        return Err(format!(
            "Local favorite path is not a directory: {}",
            path_to_string(&path)
        ));
    }
    let path = path_to_string(&path);

    let profile = LocalFavoriteProfile {
        id: request
            .id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(next_local_favorite_id),
        name: name.to_string(),
        path,
    };

    let path = location_profiles_path()?;
    let mut profiles = load_location_profiles_from_path(&path)?;
    if let Some(existing) = profiles
        .local_favorites
        .iter_mut()
        .find(|existing| existing.id == profile.id)
    {
        *existing = profile.clone();
    } else {
        profiles.local_favorites.push(profile.clone());
    }
    sort_local_favorites(&mut profiles.local_favorites);
    save_location_profiles_to_path(&path, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub(crate) fn delete_local_favorite_profile(id: String) -> Result<(), String> {
    let path = location_profiles_path()?;
    delete_local_favorite_profile_from_path(&path, &id)
}

#[tauri::command]
pub(crate) fn save_sftp_connection_profile(
    request: SaveSftpConnectionProfileRequest,
) -> Result<SftpConnectionProfile, String> {
    let auth_kind = normalized_sftp_auth_kind(request.auth_kind.as_deref());
    let private_key_path = normalized_optional_string(request.private_key_path.as_deref());
    validate_sftp_connection_request(
        request.host.trim(),
        request.port,
        request.username.trim(),
        &auth_kind,
        "placeholder",
        private_key_path.as_deref(),
    )?;
    if request.name.trim().is_empty() {
        return Err("SFTP profile name is required.".to_string());
    }

    let profile = SftpConnectionProfile {
        id: request
            .id
            .as_deref()
            .map(str::trim)
            .filter(|id| !id.is_empty())
            .map(ToOwned::to_owned)
            .unwrap_or_else(next_sftp_profile_id),
        name: request.name.trim().to_string(),
        host: request.host.trim().to_string(),
        port: request.port,
        username: request.username.trim().to_string(),
        remote_path: normalized_sftp_remote_path(Some(&request.remote_path)),
        auth_kind,
        private_key_path,
    };

    let path = location_profiles_path()?;
    let mut profiles = load_location_profiles_from_path(&path)?;
    if let Some(existing) = profiles
        .sftp_profiles
        .iter_mut()
        .find(|existing| existing.id == profile.id)
    {
        *existing = profile.clone();
    } else {
        profiles.sftp_profiles.push(profile.clone());
    }
    profiles.sftp_profiles.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });
    save_location_profiles_to_path(&path, &profiles)?;
    Ok(profile)
}

#[tauri::command]
pub(crate) fn delete_sftp_connection_profile(id: String) -> Result<(), String> {
    let path = location_profiles_path()?;
    delete_sftp_connection_profile_from_path(&path, &id)
}

pub(crate) fn delete_sftp_connection_profile_from_path(
    path: &Path,
    id: &str,
) -> Result<(), String> {
    let trimmed_id = id.trim();
    if trimmed_id.is_empty() {
        return Err("SFTP profile id is required.".to_string());
    }

    let mut profiles = load_location_profiles_from_path(path)?;
    let before_len = profiles.sftp_profiles.len();
    profiles
        .sftp_profiles
        .retain(|profile| profile.id != trimmed_id);
    if profiles.sftp_profiles.len() == before_len {
        return Err(format!("SFTP profile was not found: {trimmed_id}"));
    }

    save_location_profiles_to_path(path, &profiles)
}

pub(crate) fn delete_local_favorite_profile_from_path(path: &Path, id: &str) -> Result<(), String> {
    let trimmed_id = id.trim();
    if trimmed_id.is_empty() {
        return Err("Local favorite id is required.".to_string());
    }

    let mut profiles = load_location_profiles_from_path(path)?;
    let before_len = profiles.local_favorites.len();
    profiles
        .local_favorites
        .retain(|profile| profile.id != trimmed_id);
    if profiles.local_favorites.len() == before_len {
        return Err(format!("Local favorite was not found: {trimmed_id}"));
    }

    save_location_profiles_to_path(path, &profiles)
}

pub(crate) fn delete_search_profile_from_path(path: &Path, id: &str) -> Result<(), String> {
    let trimmed_id = id.trim();
    if trimmed_id.is_empty() {
        return Err("Search profile id is required.".to_string());
    }

    let mut profiles = load_location_profiles_from_path(path)?;
    let before_len = profiles.search_profiles.len();
    profiles
        .search_profiles
        .retain(|profile| profile.id != trimmed_id);
    if profiles.search_profiles.len() == before_len {
        return Err(format!("Search profile was not found: {trimmed_id}"));
    }

    save_location_profiles_to_path(path, &profiles)
}

fn normalized_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn next_local_favorite_id() -> String {
    format!(
        "local-favorite-{}",
        LOCATION_PROFILE_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn next_search_profile_id() -> String {
    format!(
        "search-profile-{}",
        LOCATION_PROFILE_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn sort_local_favorites(favorites: &mut [LocalFavoriteProfile]) {
    favorites.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });
}

fn sort_search_profiles(search_profiles: &mut [SearchProfile]) {
    search_profiles.sort_by(|left, right| {
        left.name
            .to_lowercase()
            .cmp(&right.name.to_lowercase())
            .then_with(|| left.name.cmp(&right.name))
    });
}

fn location_profiles_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Config directory could not be resolved.".to_string())?
        .join("windy");
    Ok(config_dir.join("locations.json"))
}

fn load_location_profiles() -> Result<LocationProfilesFile, String> {
    load_location_profiles_from_path(&location_profiles_path()?)
}

pub(crate) fn load_location_profiles_from_path(
    path: &Path,
) -> Result<LocationProfilesFile, String> {
    if !path.exists() {
        return Ok(LocationProfilesFile::default());
    }
    let content = fs::read_to_string(path)
        .map_err(|error| format_io_error("read location profiles", path, error))?;
    serde_json::from_str(&content)
        .map_err(|error| format!("Parse location profiles failed: {error}"))
}

pub(crate) fn save_location_profiles_to_path(
    path: &Path,
    profiles: &LocationProfilesFile,
) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create location profile directory", parent, error))?;
    }
    let content = serde_json::to_string_pretty(profiles)
        .map_err(|error| format!("Serialize location profiles failed: {error}"))?;
    fs::write(path, content)
        .map_err(|error| format_io_error("write location profiles", path, error))
}
