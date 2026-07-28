use crate::path_utils::{expand_user_path, home_path, path_to_string};
use crate::sftp::{known_hosts_path, SftpState, SshTerminalProfile};
use portable_pty::{native_pty_system, ChildKiller, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    io::{Read, Write},
    path::PathBuf,
    sync::{
        atomic::{AtomicU64, Ordering},
        Mutex,
    },
    thread,
};
use tauri::{AppHandle, Emitter, State};

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalOutput {
    session_id: u64,
    bytes: Vec<u8>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct TerminalExit {
    session_id: u64,
    exit_code: Option<u32>,
}

#[derive(Default)]
pub(crate) struct TerminalState {
    session: Mutex<Option<TerminalSession>>,
}

struct TerminalSession {
    _master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    child_killer: Box<dyn ChildKiller + Send + Sync>,
}

static TERMINAL_SESSION_ID: AtomicU64 = AtomicU64::new(1);

#[tauri::command]
pub(crate) fn get_terminal_shell_kind() -> String {
    terminal_shell_kind().to_string()
}

#[tauri::command]
pub(crate) fn start_terminal(
    app: AppHandle,
    state: State<'_, TerminalState>,
    cwd: String,
    cols: u16,
    rows: u16,
) -> Result<u64, String> {
    let cwd = terminal_cwd(&cwd)?;
    let mut command = terminal_shell_command();
    command.cwd(cwd.as_os_str());
    start_terminal_command(app, state, command, cols, rows)
}

#[tauri::command]
pub(crate) fn start_sftp_ssh_terminal(
    app: AppHandle,
    terminal_state: State<'_, TerminalState>,
    sftp_state: State<'_, SftpState>,
    connection_id: String,
    cols: u16,
    rows: u16,
) -> Result<u64, String> {
    let profile = {
        let connection = sftp_state.connection(&connection_id)?;
        let profile = connection
            .lock()
            .map_err(|_| format!("SFTP connection is busy or unavailable: {connection_id}"))?
            .terminal_profile
            .clone();
        profile
    };
    let command = ssh_terminal_command(&profile);
    start_terminal_command(app, terminal_state, command, cols, rows)
}

fn start_terminal_command(
    app: AppHandle,
    state: State<'_, TerminalState>,
    mut command: CommandBuilder,
    cols: u16,
    rows: u16,
) -> Result<u64, String> {
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Open PTY failed: {error}"))?;
    apply_terminal_locale_env(&mut command);
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|error| format!("Spawn shell failed: {error}"))?;
    let child_killer = child.clone_killer();
    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|error| format!("Clone PTY reader failed: {error}"))?;
    let writer = pair
        .master
        .take_writer()
        .map_err(|error| format!("Open PTY writer failed: {error}"))?;

    let session_id = TERMINAL_SESSION_ID.fetch_add(1, Ordering::Relaxed);
    let reader_app = app.clone();
    thread::spawn(move || {
        let mut buffer = [0; 4096];
        loop {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(size) => {
                    let bytes = buffer[..size].to_vec();
                    let _ =
                        reader_app.emit("terminal-output", TerminalOutput { session_id, bytes });
                }
                Err(_) => break,
            }
        }
    });
    let wait_app = app.clone();
    thread::spawn(move || {
        let exit_code = child.wait().ok().map(|status| status.exit_code());
        let _ = wait_app.emit(
            "terminal-exit",
            TerminalExit {
                session_id,
                exit_code,
            },
        );
    });

    let mut session = state
        .session
        .lock()
        .map_err(|_| "Terminal state lock poisoned.".to_string())?;
    if let Some(mut existing) = session.take() {
        let _ = existing.child_killer.kill();
    }
    *session = Some(TerminalSession {
        _master: pair.master,
        writer,
        child_killer,
    });

    Ok(session_id)
}

#[tauri::command]
pub(crate) fn write_terminal(state: State<'_, TerminalState>, input: String) -> Result<(), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Terminal state lock poisoned.".to_string())?;
    let Some(session) = session.as_mut() else {
        return Err("Terminal is not running.".to_string());
    };

    session
        .writer
        .write_all(input.as_bytes())
        .map_err(|error| format!("Write terminal failed: {error}"))?;
    session
        .writer
        .flush()
        .map_err(|error| format!("Flush terminal failed: {error}"))
}

#[tauri::command]
pub(crate) fn resize_terminal(
    state: State<'_, TerminalState>,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let session = state
        .session
        .lock()
        .map_err(|_| "Terminal state lock poisoned.".to_string())?;
    let Some(session) = session.as_ref() else {
        return Ok(());
    };

    session
        ._master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|error| format!("Resize terminal failed: {error}"))
}

#[tauri::command]
pub(crate) fn stop_terminal(state: State<'_, TerminalState>) -> Result<(), String> {
    let mut session = state
        .session
        .lock()
        .map_err(|_| "Terminal state lock poisoned.".to_string())?;
    if let Some(mut session) = session.take() {
        let _ = session.child_killer.kill();
    }

    Ok(())
}

pub(crate) fn terminal_cwd(path: &str) -> Result<PathBuf, String> {
    let path = if path.is_empty() {
        home_path().ok_or_else(|| "Home directory could not be resolved.".to_string())?
    } else {
        PathBuf::from(path)
    };

    if !path.is_dir() {
        return Err(format!(
            "Terminal cwd is not a directory: '{}'",
            path.display()
        ));
    }

    Ok(path)
}

fn apply_terminal_locale_env(command: &mut CommandBuilder) {
    let locale = std::env::var("LC_ALL")
        .ok()
        .filter(|value| value.to_ascii_uppercase().contains("UTF-8"))
        .or_else(|| {
            std::env::var("LC_CTYPE")
                .ok()
                .filter(|value| value.to_ascii_uppercase().contains("UTF-8"))
        })
        .or_else(|| {
            std::env::var("LANG")
                .ok()
                .filter(|value| value.to_ascii_uppercase().contains("UTF-8"))
        })
        .unwrap_or_else(|| "en_US.UTF-8".to_string());

    command.env("LANG", &locale);
    command.env("LC_CTYPE", &locale);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
}

fn ssh_terminal_command(profile: &SshTerminalProfile) -> CommandBuilder {
    let mut command = CommandBuilder::new("ssh");
    command.args(["-tt", "-p", &profile.port.to_string()]);
    command.args(["-o", "StrictHostKeyChecking=yes"]);
    if let Ok(path) = known_hosts_path() {
        command.args(["-o", &format!("UserKnownHostsFile={}", path.display())]);
    }
    if profile.auth_kind == "privateKey" {
        if let Some(key_path) = profile.private_key_path.as_deref() {
            let key_path = expand_user_path(key_path);
            command.args(["-i", &path_to_string(&key_path)]);
            command.args(["-o", "IdentitiesOnly=yes"]);
        }
    }
    command.arg(format!("{}@{}", profile.username, profile.host));
    command
}

#[cfg(target_os = "windows")]
fn terminal_shell_command() -> CommandBuilder {
    if let Ok(shell) = std::env::var("WINDY_TERMINAL_SHELL") {
        let shell = shell.trim();
        if !shell.is_empty() {
            return windows_terminal_shell_command(shell);
        }
    }

    if windows_command_available("pwsh") {
        return windows_powershell_command("pwsh");
    }

    if windows_command_available("powershell") {
        return windows_powershell_command("powershell");
    }

    let shell = std::env::var("COMSPEC")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| "cmd".to_string());
    windows_cmd_command(&shell)
}

#[cfg(target_os = "windows")]
pub(crate) fn terminal_shell_kind() -> &'static str {
    if let Ok(shell) = std::env::var("WINDY_TERMINAL_SHELL") {
        let shell = shell.trim();
        if !shell.is_empty() {
            return windows_terminal_shell_kind(shell);
        }
    }

    if windows_command_available("pwsh") || windows_command_available("powershell") {
        "powershell"
    } else {
        "cmd"
    }
}

#[cfg(target_os = "windows")]
fn windows_terminal_shell_kind(shell: &str) -> &'static str {
    let shell_name = std::path::Path::new(shell)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();

    match shell_name.as_str() {
        "pwsh" | "powershell" => "powershell",
        "cmd" => "cmd",
        "wsl" => "posix",
        _ => "unknown",
    }
}

#[cfg(target_os = "windows")]
fn windows_terminal_shell_command(shell: &str) -> CommandBuilder {
    let shell_name = std::path::Path::new(shell)
        .file_stem()
        .and_then(|value| value.to_str())
        .unwrap_or(shell)
        .to_ascii_lowercase();

    match shell_name.as_str() {
        "pwsh" | "powershell" => windows_powershell_command(shell),
        "cmd" => windows_cmd_command(shell),
        "wsl" => CommandBuilder::new(shell),
        _ => CommandBuilder::new(shell),
    }
}

#[cfg(target_os = "windows")]
fn windows_powershell_command(shell: &str) -> CommandBuilder {
    let mut command = CommandBuilder::new(shell);
    command.arg("-NoLogo");
    if terminal_no_profile_enabled() {
        command.arg("-NoProfile");
    }
    command
}

#[cfg(target_os = "windows")]
fn windows_cmd_command(shell: &str) -> CommandBuilder {
    let mut command = CommandBuilder::new(shell);
    command.arg("/K");
    command
}

#[cfg(target_os = "windows")]
fn terminal_no_profile_enabled() -> bool {
    std::env::var("WINDY_TERMINAL_NO_PROFILE")
        .ok()
        .map(|value| {
            matches!(
                value.trim().to_ascii_lowercase().as_str(),
                "1" | "true" | "yes" | "on"
            )
        })
        .unwrap_or(false)
}

#[cfg(target_os = "windows")]
fn windows_command_available(command: &str) -> bool {
    std::process::Command::new("where")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

#[cfg(target_os = "macos")]
fn terminal_shell_command() -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut command = CommandBuilder::new(shell);
    command.args(["-l", "-i"]);
    command
}

#[cfg(not(target_os = "windows"))]
pub(crate) fn terminal_shell_kind() -> &'static str {
    "posix"
}

#[cfg(not(target_os = "windows"))]
#[cfg(not(target_os = "macos"))]
fn terminal_shell_command() -> CommandBuilder {
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/sh".to_string());
    let mut command = CommandBuilder::new(shell);
    command.arg("-i");
    command
}
