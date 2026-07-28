use crate::path_utils::{expand_user_path, home_path};
use crate::{sort_entries, EntryKind, FileEntry};
use serde::{Deserialize, Serialize};
use ssh2::{
    CheckResult, ErrorCode, HashType, HostKeyType, KnownHostFileKind, KnownHostKeyFormat, Session,
};
use std::{
    collections::HashMap,
    fs,
    net::{TcpStream, ToSocketAddrs},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::State;
use zeroize::Zeroizing;

const SFTP_LIST_MAX_ENTRIES: usize = 100_000;
const LIBSSH2_ERROR_FILE: i32 = -16;
const LIBSSH2_ERROR_EAGAIN: i32 = -37;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpConnectionRequest {
    pub(crate) name: Option<String>,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) username: String,
    pub(crate) auth_kind: Option<String>,
    pub(crate) password: String,
    pub(crate) private_key_path: Option<String>,
    pub(crate) passphrase: Option<String>,
    pub(crate) remote_path: Option<String>,
    pub(crate) trust_host_key: Option<bool>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub(crate) struct SftpConnectionProfile {
    pub(crate) id: String,
    pub(crate) name: String,
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) username: String,
    pub(crate) remote_path: String,
    #[serde(default = "default_sftp_auth_kind")]
    pub(crate) auth_kind: String,
    #[serde(default)]
    pub(crate) private_key_path: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpConnectionTestResult {
    connection_id: String,
    display_name: String,
    remote_path: String,
    message: String,
    message_id: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ActiveSftpSession {
    connection_id: String,
    display_name: String,
    remote_path: String,
    created_at: u64,
    last_used_at: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpDirectoryListing {
    connection_id: String,
    display_name: String,
    remote_path: String,
    display_path: String,
    entries: Vec<FileEntry>,
}

#[derive(Default)]
pub(crate) struct SftpState {
    connections: Mutex<HashMap<String, SharedSftpConnection>>,
}

pub(crate) type SharedSftpConnection = Arc<Mutex<SftpConnection>>;

impl SftpState {
    pub(crate) fn connection(&self, connection_id: &str) -> Result<SharedSftpConnection, String> {
        let connection = {
            let connections = self
                .connections
                .lock()
                .map_err(|_| "SFTP connection state is unavailable.".to_string())?;
            connections
                .get(connection_id)
                .cloned()
                .ok_or_else(|| format!("SFTP connection is not available: {connection_id}"))?
        };
        connection
            .lock()
            .map_err(|_| format!("SFTP connection is busy or unavailable: {connection_id}"))?
            .last_used_at = next_sftp_session_sequence();
        Ok(connection)
    }

    pub(crate) fn snapshot(&self) -> Result<Self, String> {
        let connections = self
            .connections
            .lock()
            .map_err(|_| "SFTP connection state is unavailable.".to_string())?
            .clone();
        Ok(Self {
            connections: Mutex::new(connections),
        })
    }
}

pub(crate) struct SftpConnection {
    pub(crate) session: Session,
    pub(crate) display_name: String,
    pub(crate) remote_path: String,
    pub(crate) created_at: u64,
    pub(crate) last_used_at: u64,
    pub(crate) terminal_profile: SshTerminalProfile,
}

struct SftpConnectedSession {
    connection_id: String,
    display_name: String,
    remote_path: String,
    session: Session,
    terminal_profile: SshTerminalProfile,
}

#[derive(Clone)]
pub(crate) struct SshTerminalProfile {
    pub(crate) host: String,
    pub(crate) port: u16,
    pub(crate) username: String,
    pub(crate) auth_kind: String,
    pub(crate) private_key_path: Option<String>,
}

static SFTP_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);
static SFTP_SESSION_SEQUENCE: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) async fn test_sftp_connection(
    state: State<'_, SftpState>,
    request: SftpConnectionRequest,
) -> Result<SftpConnectionTestResult, String> {
    let result =
        tauri::async_runtime::spawn_blocking(move || test_sftp_connection_blocking(request))
            .await
            .map_err(|error| format!("SFTP connection task failed: {error}"))??;
    let SftpConnectedSession {
        connection_id,
        display_name,
        remote_path,
        session,
        terminal_profile,
    } = result;

    state
        .connections
        .lock()
        .map_err(|_| "SFTP connection state is unavailable.".to_string())?
        .insert(
            connection_id.clone(),
            Arc::new(Mutex::new(SftpConnection {
                session,
                display_name: display_name.clone(),
                remote_path: remote_path.clone(),
                created_at: next_sftp_session_sequence(),
                last_used_at: next_sftp_session_sequence(),
                terminal_profile,
            })),
        );

    Ok(SftpConnectionTestResult {
        connection_id,
        display_name,
        remote_path,
        message: "SFTP connection succeeded.".to_string(),
        message_id: "location.sftpConnectionSucceeded".to_string(),
    })
}

#[tauri::command]
pub(crate) fn list_active_sftp_sessions(
    state: State<'_, SftpState>,
) -> Result<Vec<ActiveSftpSession>, String> {
    let connections = state
        .connections
        .lock()
        .map_err(|_| "SFTP connection state is unavailable.".to_string())?
        .iter()
        .map(|(connection_id, connection)| (connection_id.clone(), Arc::clone(connection)))
        .collect::<Vec<_>>();
    let mut sessions = Vec::new();
    for (connection_id, connection) in connections {
        let Ok(connection) = connection.lock() else {
            continue;
        };
        sessions.push(ActiveSftpSession {
            connection_id,
            display_name: connection.display_name.clone(),
            remote_path: connection.remote_path.clone(),
            created_at: connection.created_at,
            last_used_at: connection.last_used_at,
        });
    }
    sessions.sort_by(|left, right| {
        right
            .last_used_at
            .cmp(&left.last_used_at)
            .then_with(|| left.display_name.cmp(&right.display_name))
    });
    Ok(sessions)
}

#[tauri::command]
pub(crate) fn disconnect_sftp_connection(
    state: State<'_, SftpState>,
    connection_id: String,
) -> Result<(), String> {
    let mut connections = state
        .connections
        .lock()
        .map_err(|_| "SFTP connection state is unavailable.".to_string())?;
    connections
        .remove(&connection_id)
        .map(|_| ())
        .ok_or_else(|| format!("SFTP connection is not available: {connection_id}"))
}

#[tauri::command]
pub(crate) async fn list_sftp_directory(
    state: State<'_, SftpState>,
    connection_id: String,
    remote_path: String,
) -> Result<SftpDirectoryListing, String> {
    let normalized_path = normalized_sftp_remote_path(Some(&remote_path));
    let connection = state.connection(&connection_id)?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut connection = connection
            .lock()
            .map_err(|_| format!("SFTP connection is busy or unavailable: {connection_id}"))?;
        connection.remote_path = normalized_path.clone();
        connection.last_used_at = next_sftp_session_sequence();
        list_sftp_directory_blocking(&connection_id, &mut connection, &normalized_path)
    })
    .await
    .map_err(|error| format!("SFTP directory listing task failed: {error}"))?
}

fn test_sftp_connection_blocking(
    request: SftpConnectionRequest,
) -> Result<SftpConnectedSession, String> {
    let SftpConnectionRequest {
        name,
        host,
        port,
        username,
        auth_kind,
        password,
        private_key_path,
        passphrase,
        remote_path,
        trust_host_key,
    } = request;
    let password = Zeroizing::new(password);
    let passphrase = normalized_optional_string(passphrase.as_deref()).map(Zeroizing::new);
    let host = host.trim();
    let username = username.trim();
    let auth_kind = normalized_sftp_auth_kind(auth_kind.as_deref());
    let private_key_path = normalized_optional_string(private_key_path.as_deref());
    let remote_path = normalized_sftp_remote_path(remote_path.as_deref());
    validate_sftp_connection_request(
        host,
        port,
        username,
        &auth_kind,
        &password,
        private_key_path.as_deref(),
    )?;

    let stream = connect_sftp_tcp_stream(host, port)?;

    let mut session =
        Session::new().map_err(|error| format!("Create SSH session failed: {error}"))?;
    session.set_tcp_stream(stream);
    session
        .handshake()
        .map_err(|error| format!("SSH handshake failed: {error}"))?;
    verify_known_host(&session, host, port, trust_host_key.unwrap_or(false))?;
    authenticate_ssh_session(
        &session,
        username,
        &auth_kind,
        &password,
        private_key_path.as_deref(),
        passphrase.as_deref().map(|value| value.as_str()),
        "SFTP",
    )?;

    session
        .sftp()
        .map_err(|error| format!("Start SFTP subsystem failed: {error}"))?;

    let connection_id = format!(
        "sftp-{}",
        SFTP_CONNECTION_ID.fetch_add(1, Ordering::Relaxed)
    );
    let display_name = name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("{username}@{host}:{port}"));
    let terminal_profile = SshTerminalProfile {
        host: host.to_string(),
        port,
        username: username.to_string(),
        auth_kind,
        private_key_path,
    };

    Ok(SftpConnectedSession {
        connection_id,
        display_name,
        remote_path,
        session,
        terminal_profile,
    })
}

fn connect_sftp_tcp_stream(host: &str, port: u16) -> Result<TcpStream, String> {
    let addresses = (host, port)
        .to_socket_addrs()
        .map_err(|error| format!("Resolve SFTP host failed: {error}"))?
        .collect::<Vec<_>>();
    if addresses.is_empty() {
        return Err(format!("No socket address resolved for {host}:{port}"));
    }

    let mut failures = Vec::new();
    for attempt in 0..3 {
        if attempt > 0 {
            thread::sleep(Duration::from_millis(250 * attempt as u64));
        }

        for address in &addresses {
            match TcpStream::connect_timeout(address, Duration::from_secs(8)) {
                Ok(stream) => {
                    stream
                        .set_read_timeout(Some(Duration::from_secs(12)))
                        .map_err(|error| format!("Set SFTP read timeout failed: {error}"))?;
                    stream
                        .set_write_timeout(Some(Duration::from_secs(12)))
                        .map_err(|error| format!("Set SFTP write timeout failed: {error}"))?;
                    return Ok(stream);
                }
                Err(error) => {
                    failures.push(format!("attempt {} {address}: {error}", attempt + 1));
                }
            }
        }
    }

    Err(format!(
        "Connect to SFTP host failed for {host}:{port}. Tried: {}",
        failures.join("; ")
    ))
}

pub(crate) fn validate_sftp_connection_request(
    host: &str,
    port: u16,
    username: &str,
    auth_kind: &str,
    password: &str,
    private_key_path: Option<&str>,
) -> Result<(), String> {
    if host.is_empty() {
        return Err("SFTP host is required.".to_string());
    }
    if port == 0 {
        return Err("SFTP port must be between 1 and 65535.".to_string());
    }
    if username.is_empty() {
        return Err("SFTP username is required.".to_string());
    }
    match auth_kind {
        "password" if password.is_empty() => {
            return Err("SFTP password is required.".to_string());
        }
        "privateKey" if private_key_path.map(str::trim).unwrap_or("").is_empty() => {
            return Err("SFTP private key path is required.".to_string());
        }
        "password" | "privateKey" => {}
        _ => return Err("Unsupported SFTP authentication kind.".to_string()),
    }
    Ok(())
}

pub(crate) fn authenticate_ssh_session(
    session: &Session,
    username: &str,
    auth_kind: &str,
    password: &str,
    private_key_path: Option<&str>,
    passphrase: Option<&str>,
    label: &str,
) -> Result<(), String> {
    if auth_kind == "privateKey" {
        let key_path =
            private_key_path.ok_or_else(|| format!("{label} private key path is required."))?;
        let key_path = expand_user_path(key_path);
        if !key_path.is_file() {
            return Err(format!(
                "{label} private key file does not exist: {}",
                key_path.display()
            ));
        }
        session
            .userauth_pubkey_file(username, None, &key_path, passphrase)
            .map_err(|error| format!("{label} private key authentication failed: {error}"))?;
    } else {
        session
            .userauth_password(username, password)
            .map_err(|error| format!("{label} password authentication failed: {error}"))?;
    }

    if !session.authenticated() {
        return Err(format!("{label} authentication failed."));
    }
    Ok(())
}

const UNKNOWN_HOST_KEY_ERROR_PREFIX: &str = "WINDY_UNKNOWN_HOST_KEY";

fn verify_known_host(
    session: &Session,
    host: &str,
    port: u16,
    trust_host_key: bool,
) -> Result<(), String> {
    let known_hosts_path = known_hosts_path()?;
    if !known_hosts_path.is_file() && !trust_host_key {
        return Err(format!(
            "{UNKNOWN_HOST_KEY_ERROR_PREFIX}\t{host}\t{port}\t{}\t{}",
            host_key_fingerprint(session),
            known_hosts_path.display()
        ));
    }

    let mut known_hosts = session
        .known_hosts()
        .map_err(|error| format!("Open SSH known_hosts store failed: {error}"))?;
    if known_hosts_path.is_file() {
        known_hosts
            .read_file(&known_hosts_path, KnownHostFileKind::OpenSSH)
            .map_err(|error| {
                format!(
                    "Read SSH known_hosts failed ({}): {error}",
                    known_hosts_path.display()
                )
            })?;
    }

    let (key, key_type) = session
        .host_key()
        .ok_or_else(|| "SSH server host key is unavailable.".to_string())?;
    match known_hosts.check_port(host, port, key) {
        CheckResult::Match => Ok(()),
        CheckResult::Mismatch => Err(format!(
            "SSH host key mismatch for {host}:{port}. Check {} before connecting.",
            known_hosts_path.display()
        )),
        CheckResult::NotFound => {
            if trust_host_key {
                add_known_host(
                    &mut known_hosts,
                    &known_hosts_path,
                    host,
                    port,
                    key,
                    key_type,
                )
            } else {
                Err(format!(
                    "{UNKNOWN_HOST_KEY_ERROR_PREFIX}\t{host}\t{port}\t{}\t{}",
                    host_key_fingerprint(session),
                    known_hosts_path.display()
                ))
            }
        }
        CheckResult::Failure => Err(format!(
            "SSH known_hosts check failed for {host}:{port} using {}.",
            known_hosts_path.display()
        )),
    }
}

fn add_known_host(
    known_hosts: &mut ssh2::KnownHosts,
    known_hosts_path: &Path,
    host: &str,
    port: u16,
    key: &[u8],
    key_type: HostKeyType,
) -> Result<(), String> {
    let format = KnownHostKeyFormat::from(key_type);
    if matches!(format, KnownHostKeyFormat::Unknown) {
        return Err("SSH server host key type is unknown.".to_string());
    }
    if let Some(parent) = known_hosts_path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "Create SSH known_hosts directory failed ({}): {error}",
                parent.display()
            )
        })?;
    }
    known_hosts
        .add(&known_host_name(host, port), key, "windy", format)
        .map_err(|error| format!("Add SSH host key failed: {error}"))?;
    known_hosts
        .write_file(known_hosts_path, KnownHostFileKind::OpenSSH)
        .map_err(|error| {
            format!(
                "Write SSH known_hosts failed ({}): {error}",
                known_hosts_path.display()
            )
        })
}

fn known_host_name(host: &str, port: u16) -> String {
    if port == 22 {
        host.to_string()
    } else {
        format!("[{host}]:{port}")
    }
}

fn host_key_fingerprint(session: &Session) -> String {
    session
        .host_key_hash(HashType::Sha256)
        .map(|bytes| format!("SHA256:{}", bytes_to_hex(bytes)))
        .unwrap_or_else(|| "unavailable".to_string())
}

fn bytes_to_hex(bytes: &[u8]) -> String {
    bytes
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

pub(crate) fn known_hosts_path() -> Result<PathBuf, String> {
    if let Ok(path) = std::env::var("WINDY_KNOWN_HOSTS") {
        let path = path.trim();
        if !path.is_empty() {
            return Ok(expand_user_path(path));
        }
    }

    home_path()
        .map(|home| home.join(".ssh").join("known_hosts"))
        .ok_or_else(|| "Home directory could not be resolved for known_hosts.".to_string())
}

pub(crate) fn default_sftp_auth_kind() -> String {
    "password".to_string()
}

pub(crate) fn normalized_sftp_auth_kind(auth_kind: Option<&str>) -> String {
    match auth_kind.map(str::trim) {
        Some("privateKey") => "privateKey".to_string(),
        _ => "password".to_string(),
    }
}

fn list_sftp_directory_blocking(
    connection_id: &str,
    connection: &mut SftpConnection,
    remote_path: &str,
) -> Result<SftpDirectoryListing, String> {
    let sftp = connection
        .session
        .sftp()
        .map_err(|error| format!("Start SFTP subsystem failed: {error}"))?;
    let mut directory = sftp
        .opendir(Path::new(remote_path))
        .map_err(|error| format!("Read SFTP directory failed: {error}"))?;
    let mut file_entries = Vec::new();
    loop {
        match directory.readdir() {
            Ok((path, stat)) => {
                let Some(name) = path.file_name() else {
                    continue;
                };
                let name = name.to_string_lossy().to_string();
                if name == "." || name == ".." {
                    continue;
                }
                if file_entries.len() >= SFTP_LIST_MAX_ENTRIES {
                    return Err("SFTP listing exceeded the 100,000 entry limit.".to_string());
                }
                file_entries.push(sftp_file_entry(connection_id, remote_path, name, stat));
            }
            Err(error) if error.code() == ErrorCode::Session(LIBSSH2_ERROR_FILE) => break,
            Err(error) if error.code() == ErrorCode::Session(LIBSSH2_ERROR_EAGAIN) => continue,
            Err(error) => return Err(format!("Read SFTP directory failed: {error}")),
        }
    }
    sort_entries(&mut file_entries);

    Ok(SftpDirectoryListing {
        connection_id: connection_id.to_string(),
        display_name: connection.display_name.clone(),
        remote_path: remote_path.to_string(),
        display_path: sftp_display_path(&connection.display_name, remote_path),
        entries: file_entries,
    })
}

fn sftp_file_entry(
    connection_id: &str,
    parent_path: &str,
    name: String,
    stat: ssh2::FileStat,
) -> FileEntry {
    let remote_path = join_sftp_remote_path(parent_path, &name);
    let kind = sftp_entry_kind(stat.perm);
    let entry_path = sftp_entry_uri(connection_id, &remote_path);
    FileEntry {
        key: format!("sftp:{connection_id}:{remote_path}"),
        name: name.clone(),
        path: entry_path,
        kind,
        size: stat
            .size
            .filter(|_| sftp_entry_kind(stat.perm) == EntryKind::File),
        modified_at: stat.mtime,
        hidden: name.starts_with('.'),
        readonly: stat.perm.map(|perm| perm & 0o222 == 0).unwrap_or(false),
        mode: stat.perm.map(|perm| perm & 0o777),
    }
}

pub(crate) fn sftp_entry_kind(perm: Option<u32>) -> EntryKind {
    const S_IFMT: u32 = 0o170000;
    const S_IFDIR: u32 = 0o040000;
    const S_IFREG: u32 = 0o100000;
    const S_IFLNK: u32 = 0o120000;

    match perm.map(|value| value & S_IFMT) {
        Some(S_IFDIR) => EntryKind::Directory,
        Some(S_IFREG) => EntryKind::File,
        Some(S_IFLNK) => EntryKind::Symlink,
        _ => EntryKind::Other,
    }
}

pub(crate) fn normalized_sftp_remote_path(path: Option<&str>) -> String {
    let path = path
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("/");
    if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    }
}

pub(crate) fn join_sftp_remote_path(parent_path: &str, name: &str) -> String {
    let parent = normalized_sftp_remote_path(Some(parent_path));
    if parent == "/" {
        format!("/{name}")
    } else {
        format!("{}/{}", parent.trim_end_matches('/'), name)
    }
}

fn sftp_entry_uri(connection_id: &str, remote_path: &str) -> String {
    format!(
        "sftp://{connection_id}{}",
        normalized_sftp_remote_path(Some(remote_path))
    )
}

fn sftp_display_path(display_name: &str, remote_path: &str) -> String {
    format!(
        "{display_name}:{}",
        normalized_sftp_remote_path(Some(remote_path))
    )
}

pub(crate) fn is_sftp_uri(path: &str) -> bool {
    path.starts_with("sftp://")
}

pub(crate) fn parse_sftp_uri(path: &str) -> Option<(String, String)> {
    let rest = path.strip_prefix("sftp://")?;
    let slash_index = rest.find('/')?;
    let connection_id = rest[..slash_index].to_string();
    if connection_id.is_empty() {
        return None;
    }
    Some((
        connection_id,
        normalized_sftp_remote_path(Some(&rest[slash_index..])),
    ))
}

pub(crate) fn sftp_remote_leaf_name(path: &str) -> Option<String> {
    normalized_sftp_remote_path(Some(path))
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|name| !name.is_empty())
        .map(ToOwned::to_owned)
}

pub(crate) fn sftp_parent_remote_path(path: &str) -> Option<String> {
    let normalized = normalized_sftp_remote_path(Some(path));
    if normalized == "/" {
        return None;
    }
    let trimmed = normalized.trim_end_matches('/');
    let slash_index = trimmed.rfind('/')?;
    if slash_index == 0 {
        Some("/".to_string())
    } else {
        Some(trimmed[..slash_index].to_string())
    }
}

pub(crate) fn next_sftp_profile_id() -> String {
    format!(
        "sftp-profile-{}",
        SFTP_CONNECTION_ID.fetch_add(1, Ordering::Relaxed)
    )
}

fn next_sftp_session_sequence() -> u64 {
    SFTP_SESSION_SEQUENCE.fetch_add(1, Ordering::Relaxed)
}

fn normalized_optional_string(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

#[cfg(test)]
mod tests {
    use super::SftpConnectionTestResult;

    #[test]
    fn sftp_connection_result_serializes_localization_metadata() {
        let result = SftpConnectionTestResult {
            connection_id: "sftp-1".to_string(),
            display_name: "example".to_string(),
            remote_path: "/home/user".to_string(),
            message: "SFTP connection succeeded.".to_string(),
            message_id: "location.sftpConnectionSucceeded".to_string(),
        };

        let value = serde_json::to_value(result).expect("serialize SFTP connection result");
        assert_eq!(value["connectionId"], "sftp-1");
        assert_eq!(value["message"], "SFTP connection succeeded.");
        assert_eq!(value["messageId"], "location.sftpConnectionSucceeded");
    }
}
