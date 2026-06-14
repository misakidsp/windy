use crate::file_ops::FileOperationResultItem;
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Write,
    path::{Path, PathBuf},
    time::{SystemTime, UNIX_EPOCH},
};

const DEFAULT_KEYBINDINGS_JSON: &str = include_str!("../../src/routes/keybindingDefaults.json");

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppSettings {
    #[serde(default = "default_use_trash")]
    pub(crate) use_trash: bool,
    #[serde(default)]
    pub(crate) operation_result: OperationResultSettings,
    #[serde(default)]
    pub(crate) operation_cancel: OperationCancelSettings,
    #[serde(default)]
    pub(crate) external_editor: ExternalEditorSettings,
    #[serde(default)]
    pub(crate) sftp_session: SftpSessionSettings,
    #[serde(default)]
    pub(crate) sftp_transfer: SftpTransferSettings,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationSettings {
    #[serde(default = "default_use_trash")]
    pub(crate) use_trash: bool,
    #[serde(default)]
    pub(crate) operation_result: OperationResultSettings,
    #[serde(default)]
    pub(crate) operation_cancel: OperationCancelSettings,
    #[serde(default)]
    pub(crate) external_editor: ExternalEditorSettings,
}

impl Default for OperationSettings {
    fn default() -> Self {
        Self {
            use_trash: default_use_trash(),
            operation_result: OperationResultSettings::default(),
            operation_cancel: OperationCancelSettings::default(),
            external_editor: ExternalEditorSettings::default(),
        }
    }
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpSettings {
    #[serde(default)]
    pub(crate) sftp_session: SftpSessionSettings,
    #[serde(default)]
    pub(crate) sftp_transfer: SftpTransferSettings,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppearanceSettings {
    #[serde(default = "default_settings_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default)]
    pub(crate) fonts: AppearanceFontSettings,
    #[serde(default)]
    pub(crate) layout: AppearanceLayoutSettings,
    #[serde(default = "default_appearance_colors")]
    pub(crate) colors: BTreeMap<String, String>,
    #[serde(default = "default_extension_colors")]
    pub(crate) extension_colors: BTreeMap<String, String>,
}

impl Default for AppearanceSettings {
    fn default() -> Self {
        Self {
            schema_version: default_settings_schema_version(),
            fonts: AppearanceFontSettings::default(),
            layout: AppearanceLayoutSettings::default(),
            colors: default_appearance_colors(),
            extension_colors: default_extension_colors(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppearanceFontSettings {
    #[serde(default = "default_ui_font_family")]
    pub(crate) ui_family: String,
    #[serde(default = "default_terminal_font_family")]
    pub(crate) terminal_family: String,
    #[serde(default = "default_ui_font_size")]
    pub(crate) ui_size: u16,
    #[serde(default = "default_terminal_font_size")]
    pub(crate) terminal_size: u16,
    #[serde(default = "default_viewer_font_size")]
    pub(crate) viewer_size: u16,
}

impl Default for AppearanceFontSettings {
    fn default() -> Self {
        Self {
            ui_family: default_ui_font_family(),
            terminal_family: default_terminal_font_family(),
            ui_size: default_ui_font_size(),
            terminal_size: default_terminal_font_size(),
            viewer_size: default_viewer_font_size(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppearanceLayoutSettings {
    #[serde(default = "default_file_row_height")]
    pub(crate) file_row_height: u16,
}

impl Default for AppearanceLayoutSettings {
    fn default() -> Self {
        Self {
            file_row_height: default_file_row_height(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct KeybindSettings {
    #[serde(default = "default_settings_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default = "default_editable_keybindings")]
    pub(crate) bindings: BTreeMap<String, Vec<String>>,
    #[serde(default = "default_locked_keybindings")]
    pub(crate) locked_bindings: BTreeMap<String, Vec<String>>,
}

impl Default for KeybindSettings {
    fn default() -> Self {
        default_keybind_settings_from_json()
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LanguageSettings {
    #[serde(default = "default_settings_schema_version")]
    pub(crate) schema_version: u32,
    #[serde(default = "default_language_locale")]
    pub(crate) locale: String,
    #[serde(default = "default_language_messages")]
    pub(crate) messages: BTreeMap<String, String>,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LanguagePresetInfo {
    pub(crate) locale: String,
    pub(crate) name: String,
}

#[derive(Clone, Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalEditorSettings {
    #[serde(default)]
    pub(crate) command: String,
    #[serde(default)]
    pub(crate) args: Vec<String>,
}

impl Default for LanguageSettings {
    fn default() -> Self {
        Self {
            schema_version: default_settings_schema_version(),
            locale: default_language_locale(),
            messages: default_language_messages(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationResultSettings {
    #[serde(default = "default_operation_result_show_status")]
    pub(crate) show_status: bool,
    #[serde(default = "default_operation_result_show_failure_dialog")]
    pub(crate) show_failure_dialog: bool,
    #[serde(default)]
    pub(crate) print_to_terminal: bool,
    #[serde(default = "default_operation_result_save_failure_log")]
    pub(crate) save_failure_log: bool,
}

impl Default for OperationResultSettings {
    fn default() -> Self {
        Self {
            show_status: default_operation_result_show_status(),
            show_failure_dialog: default_operation_result_show_failure_dialog(),
            print_to_terminal: false,
            save_failure_log: default_operation_result_save_failure_log(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct OperationCancelSettings {
    #[serde(default = "default_operation_cancel_double_esc_enabled")]
    pub(crate) double_esc_enabled: bool,
    #[serde(default = "default_operation_cancel_double_esc_window_ms")]
    pub(crate) double_esc_window_ms: u64,
}

impl Default for OperationCancelSettings {
    fn default() -> Self {
        Self {
            double_esc_enabled: default_operation_cancel_double_esc_enabled(),
            double_esc_window_ms: default_operation_cancel_double_esc_window_ms(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            use_trash: default_use_trash(),
            operation_result: OperationResultSettings::default(),
            operation_cancel: OperationCancelSettings::default(),
            external_editor: ExternalEditorSettings::default(),
            sftp_session: SftpSessionSettings::default(),
            sftp_transfer: SftpTransferSettings::default(),
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpSessionSettings {
    #[serde(default = "default_sftp_session_lifecycle")]
    pub(crate) lifecycle: String,
    #[serde(default = "default_sftp_session_max_sessions")]
    pub(crate) max_sessions: usize,
    #[serde(default)]
    pub(crate) idle_disconnect_minutes: u64,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SftpTransferSettings {
    #[serde(default = "default_sftp_part_file_threshold_bytes")]
    pub(crate) part_file_threshold_bytes: u64,
}

impl Default for SftpTransferSettings {
    fn default() -> Self {
        Self {
            part_file_threshold_bytes: default_sftp_part_file_threshold_bytes(),
        }
    }
}

impl Default for SftpSessionSettings {
    fn default() -> Self {
        Self {
            lifecycle: default_sftp_session_lifecycle(),
            max_sessions: default_sftp_session_max_sessions(),
            idle_disconnect_minutes: 0,
        }
    }
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalCommandDefinition {
    pub(crate) id: String,
    pub(crate) name: String,
    #[serde(default)]
    pub(crate) description: String,
    pub(crate) template: String,
    pub(crate) argument_mode: Option<String>,
    pub(crate) item_template: Option<String>,
    pub(crate) item_separator: Option<String>,
    pub(crate) return_focus: Option<bool>,
}

#[derive(Default, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ExternalCommandsFile {
    pub(crate) commands: Vec<ExternalCommandDefinition>,
}

#[derive(Deserialize)]
#[serde(untagged)]
enum ExternalCommandsConfig {
    Wrapped(ExternalCommandsFile),
    List(Vec<ExternalCommandDefinition>),
}

fn default_use_trash() -> bool {
    true
}

fn default_operation_result_show_status() -> bool {
    true
}

fn default_operation_result_show_failure_dialog() -> bool {
    true
}

fn default_operation_result_save_failure_log() -> bool {
    true
}

fn default_operation_cancel_double_esc_enabled() -> bool {
    true
}

fn default_operation_cancel_double_esc_window_ms() -> u64 {
    700
}

fn default_sftp_session_lifecycle() -> String {
    "keepRecent".to_string()
}

fn default_sftp_session_max_sessions() -> usize {
    2
}

fn default_sftp_part_file_threshold_bytes() -> u64 {
    1024 * 1024
}

fn default_settings_schema_version() -> u32 {
    1
}

fn default_ui_font_family() -> String {
    "UDEV Gothic".to_string()
}

fn default_terminal_font_family() -> String {
    "UDEV Gothic".to_string()
}

fn default_ui_font_size() -> u16 {
    12
}

fn default_terminal_font_size() -> u16 {
    12
}

fn default_viewer_font_size() -> u16 {
    12
}

fn default_file_row_height() -> u16 {
    20
}

fn default_language_locale() -> String {
    "en".to_string()
}

fn default_appearance_colors() -> BTreeMap<String, String> {
    BTreeMap::from([
        ("app.background".to_string(), "#181a1f".to_string()),
        ("app.foreground".to_string(), "#e8e8e8".to_string()),
        ("pane.background".to_string(), "#202329".to_string()),
        ("pane.activeBackground".to_string(), "#242832".to_string()),
        ("pane.headerBackground".to_string(), "#303847".to_string()),
        ("pane.border".to_string(), "#4b5563".to_string()),
        ("entry.foreground".to_string(), "#d8dee9".to_string()),
        ("entry.cursorBackground".to_string(), "#475569".to_string()),
        (
            "entry.selectedBackground".to_string(),
            "#263f46".to_string(),
        ),
        (
            "entry.cursorSelectedBackground".to_string(),
            "#3f5962".to_string(),
        ),
        (
            "entry.directoryForeground".to_string(),
            "#9fd1ff".to_string(),
        ),
        ("entry.hiddenForeground".to_string(), "#8d96a7".to_string()),
        ("entry.errorForeground".to_string(), "#fca5a5".to_string()),
        ("entry.mutedForeground".to_string(), "#858f9e".to_string()),
        (
            "entry.filterKeptBackground".to_string(),
            "#20262c".to_string(),
        ),
        (
            "entry.diffLeftOnlyBackground".to_string(),
            "#1d3147".to_string(),
        ),
        (
            "entry.diffRightOnlyBackground".to_string(),
            "#1d3a2a".to_string(),
        ),
        (
            "entry.diffChangedBackground".to_string(),
            "#3a2f1f".to_string(),
        ),
        ("filter.foreground".to_string(), "#c7d2fe".to_string()),
        (
            "filter.editingForeground".to_string(),
            "#e5e7eb".to_string(),
        ),
        (
            "filter.editingBackground".to_string(),
            "#1d2530".to_string(),
        ),
        ("dialog.background".to_string(), "#171a20".to_string()),
        ("dialog.foreground".to_string(), "#d1d5db".to_string()),
        ("dialog.accent".to_string(), "#93c5fd".to_string()),
        (
            "dialog.backdrop".to_string(),
            "rgb(0 0 0 / 0.58)".to_string(),
        ),
        ("dialog.shadow".to_string(), "rgb(0 0 0 / 0.42)".to_string()),
        ("dialog.headerForeground".to_string(), "#f8fafc".to_string()),
        ("dialog.mutedForeground".to_string(), "#aeb6c3".to_string()),
        ("dialog.itemBackground".to_string(), "#171c24".to_string()),
        ("dialog.itemBorder".to_string(), "#303946".to_string()),
        (
            "dialog.itemActiveBackground".to_string(),
            "#243142".to_string(),
        ),
        ("dialog.inputBackground".to_string(), "#1f242c".to_string()),
        (
            "dialog.warningForeground".to_string(),
            "#fbbf24".to_string(),
        ),
        ("dialog.dangerForeground".to_string(), "#fca5a5".to_string()),
        ("dialog.dangerBorder".to_string(), "#a94444".to_string()),
        ("dialog.warningBorder".to_string(), "#a9792b".to_string()),
        ("terminal.background".to_string(), "#111318".to_string()),
        ("terminal.foreground".to_string(), "#d1d5db".to_string()),
        ("terminal.cursor".to_string(), "#f9fafb".to_string()),
        (
            "terminal.selectionBackground".to_string(),
            "#374151".to_string(),
        ),
        ("viewer.background".to_string(), "#111318".to_string()),
        ("viewer.foreground".to_string(), "#d8dee9".to_string()),
        (
            "viewer.lineNumberForeground".to_string(),
            "#6b7280".to_string(),
        ),
    ])
}

fn default_extension_colors() -> BTreeMap<String, String> {
    BTreeMap::from([
        (".md".to_string(), "#f9d65c".to_string()),
        (".json".to_string(), "#fbbf24".to_string()),
        (".toml".to_string(), "#f0abfc".to_string()),
        (".rs".to_string(), "#fb923c".to_string()),
        (".ts".to_string(), "#7dd3fc".to_string()),
        (".svelte".to_string(), "#ff8a65".to_string()),
        (".png".to_string(), "#86efac".to_string()),
        (".jpg".to_string(), "#86efac".to_string()),
        (".jpeg".to_string(), "#86efac".to_string()),
        (".zip".to_string(), "#c4b5fd".to_string()),
        (".tar".to_string(), "#c4b5fd".to_string()),
        (".gz".to_string(), "#c4b5fd".to_string()),
    ])
}

fn keybind_settings_from_json(json: &str) -> serde_json::Result<KeybindSettings> {
    serde_json::from_str(json)
}

fn empty_keybind_settings_fallback() -> KeybindSettings {
    KeybindSettings {
        schema_version: default_settings_schema_version(),
        bindings: BTreeMap::new(),
        locked_bindings: BTreeMap::new(),
    }
}

fn default_keybind_settings_from_json() -> KeybindSettings {
    keybind_settings_from_json(DEFAULT_KEYBINDINGS_JSON).unwrap_or_else(|error| {
        eprintln!("default keybinding JSON is invalid: {error}");
        empty_keybind_settings_fallback()
    })
}

fn default_editable_keybindings() -> BTreeMap<String, Vec<String>> {
    default_keybind_settings_from_json().bindings
}

fn default_locked_keybindings() -> BTreeMap<String, Vec<String>> {
    default_keybind_settings_from_json().locked_bindings
}

fn default_language_messages() -> BTreeMap<String, String> {
    BTreeMap::from([
        ("dialog.ok".to_string(), "OK".to_string()),
        ("dialog.cancel".to_string(), "Cancel".to_string()),
        ("dialog.close".to_string(), "Close".to_string()),
        (
            "operation.confirmTitle".to_string(),
            "Confirm {label}".to_string(),
        ),
        (
            "operation.failedTitle".to_string(),
            "{label} Failed".to_string(),
        ),
        (
            "operation.executing".to_string(),
            "Executing...".to_string(),
        ),
        ("location.title".to_string(), "Location Manager".to_string()),
        ("search.title".to_string(), "Search".to_string()),
        (
            "externalCommand.title".to_string(),
            "External Commands".to_string(),
        ),
        (
            "terminal.copyMode".to_string(),
            "Terminal copy mode: move to select, Enter copies, Esc cancels.".to_string(),
        ),
        (
            "viewer.openFailed".to_string(),
            "Viewer failed: {error}".to_string(),
        ),
        (
            "settings.loadFailed".to_string(),
            "Settings load failed: {error}".to_string(),
        ),
    ])
}

pub(crate) fn config_dir() -> Result<PathBuf, String> {
    dirs::config_dir()
        .ok_or_else(|| "Config directory could not be resolved.".to_string())
        .map(|path| path.join("windy"))
}

fn operation_failure_log_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("operation-failures.log"))
}

fn external_commands_path() -> Result<PathBuf, String> {
    Ok(config_dir()?.join("commands.json"))
}

pub(crate) fn load_app_settings() -> Result<AppSettings, String> {
    load_app_settings_from_dir(&config_dir()?)
}

pub(crate) fn load_appearance_settings() -> Result<AppearanceSettings, String> {
    let config_root = config_dir()?;
    load_appearance_settings_from_path(&config_root.join("settings/appearance.json"))
}

pub(crate) fn load_keybind_settings() -> Result<KeybindSettings, String> {
    let config_root = config_dir()?;
    load_keybind_settings_from_path(&config_root.join("settings/keybind.json"))
}

pub(crate) fn load_language_settings() -> Result<LanguageSettings, String> {
    let config_root = config_dir()?;
    load_language_settings_from_path(&config_root.join("settings/language.json"))
}

pub(crate) fn save_language_settings(settings: &LanguageSettings) -> Result<(), String> {
    let config_root = config_dir()?;
    save_language_settings_to_path(&config_root.join("settings/language.json"), settings)
}

pub(crate) fn save_appearance_settings(settings: &AppearanceSettings) -> Result<(), String> {
    let config_root = config_dir()?;
    save_appearance_settings_to_path(&config_root.join("settings/appearance.json"), settings)
}

pub(crate) fn save_keybind_settings(settings: &KeybindSettings) -> Result<(), String> {
    let config_root = config_dir()?;
    save_keybind_settings_to_path(&config_root.join("settings/keybind.json"), settings)
}

pub(crate) fn save_app_settings(settings: &AppSettings) -> Result<(), String> {
    save_app_settings_to_dir(&config_dir()?, settings)
}

pub(crate) fn backup_existing_settings_files(label: &str) -> Result<Vec<PathBuf>, String> {
    backup_settings_files_from_dir(&config_dir()?, label)
}

pub(crate) fn reset_all_settings_to_defaults() -> Result<(), String> {
    let config_root = config_dir()?;
    reset_all_settings_to_defaults_in_dir(&config_root)
}

pub(crate) fn backup_settings_files_from_dir(
    config_root: &Path,
    label: &str,
) -> Result<Vec<PathBuf>, String> {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0);
    let backup_root = config_root
        .join("backups")
        .join(format!("{label}-{timestamp}"));
    let candidates = [
        config_root.join("settings.json"),
        config_root.join("settings/operation.json"),
        config_root.join("settings/sftp.json"),
        config_root.join("settings/appearance.json"),
        config_root.join("settings/keybind.json"),
        config_root.join("settings/language.json"),
        config_root.join("commands.json"),
        config_root.join("locations.json"),
    ];
    let mut backups = Vec::new();
    for path in candidates {
        if !path.exists() {
            continue;
        }
        let relative = path.strip_prefix(config_root).unwrap_or(path.as_path());
        let destination = backup_root.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format_io_error("create settings backup directory", parent, error)
            })?;
        }
        fs::copy(&path, &destination)
            .map_err(|error| format_io_error("backup settings file", &path, error))?;
        backups.push(destination);
    }
    Ok(backups)
}

pub(crate) fn reset_all_settings_to_defaults_in_dir(config_root: &Path) -> Result<(), String> {
    save_app_settings_to_dir(config_root, &AppSettings::default())?;
    save_appearance_settings_to_path(
        &config_root.join("settings/appearance.json"),
        &AppearanceSettings::default(),
    )?;
    save_keybind_settings_to_path(
        &config_root.join("settings/keybind.json"),
        &KeybindSettings::default(),
    )?;
    save_language_settings_to_path(
        &config_root.join("settings/language.json"),
        &LanguageSettings::default(),
    )
}

pub(crate) fn language_presets() -> Vec<LanguagePresetInfo> {
    vec![
        LanguagePresetInfo {
            locale: default_language_locale(),
            name: "English".to_string(),
        },
        LanguagePresetInfo {
            locale: "ja".to_string(),
            name: "Japanese".to_string(),
        },
        LanguagePresetInfo {
            locale: "qya-Latn".to_string(),
            name: "Quenya Latin".to_string(),
        },
    ]
}

pub(crate) fn language_preset_settings(locale: &str) -> Result<LanguageSettings, String> {
    match locale {
        "en" => Ok(LanguageSettings::default()),
        "ja" => serde_json::from_str(include_str!("../../docs/examples/language.ja.json"))
            .map_err(|error| format!("Parse Japanese language preset failed: {error}")),
        "qya-Latn" => {
            serde_json::from_str(include_str!("../../docs/examples/language.qya-Latn.json"))
                .map_err(|error| format!("Parse Quenya language preset failed: {error}"))
        }
        _ => Err(format!("Unknown language preset: {locale}")),
    }
}

pub(crate) fn save_operation_failure_log(
    label: &str,
    failed: &[FileOperationResultItem],
) -> Result<String, String> {
    save_operation_failure_log_to_path(&operation_failure_log_path()?, label, failed)
}

pub(crate) fn default_external_commands() -> ExternalCommandsFile {
    ExternalCommandsFile {
        commands: vec![
            ExternalCommandDefinition {
                id: "echo-selected-paths".to_string(),
                name: "Echo selected paths".to_string(),
                description: "Print selected local paths in the terminal.".to_string(),
                template: "printf '%s\\n' {args}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "list-selected-details".to_string(),
                name: "List selected details".to_string(),
                description: "Run ls -ld for selected local paths.".to_string(),
                template: "ls -ld {args}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "show-active-and-other-directory".to_string(),
                name: "Show active and other directory".to_string(),
                description: "Demonstrates {cwd} and {otherCwd}.".to_string(),
                template: "printf 'active: %s\\nother:  %s\\n' {cwd} {otherCwd}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "show-selected-names".to_string(),
                name: "Show selected names".to_string(),
                description: "Demonstrates {names}.".to_string(),
                template: "printf '%s\\n' {names}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "show-first-selection".to_string(),
                name: "Show first selection".to_string(),
                description: "Demonstrates {first}.".to_string(),
                template: "printf 'first: %s\\n' {first}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "show-marked-in-active-pane".to_string(),
                name: "Show marked in active pane".to_string(),
                description: "Demonstrates {marked} and {markedNames}; empty if nothing is marked."
                    .to_string(),
                template: "printf 'paths:\\n%s\\nnames:\\n%s\\n' {marked} {markedNames}"
                    .to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "show-marked-in-other-pane".to_string(),
                name: "Show marked in other pane".to_string(),
                description: "Demonstrates {otherMarked} and {otherMarkedNames}.".to_string(),
                template: "printf 'other paths:\\n%s\\nother names:\\n%s\\n' {otherMarked} {otherMarkedNames}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "count-lines-in-selection".to_string(),
                name: "Count lines in selection".to_string(),
                description: "Read-only example that runs wc -l with {args}.".to_string(),
                template: "wc -l {args}".to_string(),
                argument_mode: None,
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "repeat-show-each-target".to_string(),
                name: "Repeat: show each target".to_string(),
                description:
                    "Demonstrates argumentMode=repeat by running once per selected path."
                        .to_string(),
                template: "printf 'target: %s\\n' {path}".to_string(),
                argument_mode: Some("repeat".to_string()),
                item_template: None,
                item_separator: None,
                return_focus: Some(false),
            },
            ExternalCommandDefinition {
                id: "join-show-item-lines".to_string(),
                name: "Join: show item lines".to_string(),
                description: "Demonstrates argumentMode=join by expanding {items}.".to_string(),
                template: "printf 'items:\\n%s\\n' {items}".to_string(),
                argument_mode: Some("join".to_string()),
                item_template: Some("{index}: {path}".to_string()),
                item_separator: Some("\\n".to_string()),
                return_focus: Some(false),
            },
        ],
    }
}

pub(crate) fn load_external_commands() -> Result<ExternalCommandsFile, String> {
    load_external_commands_from_path(&external_commands_path()?)
}

pub(crate) fn load_external_commands_from_path(
    path: &Path,
) -> Result<ExternalCommandsFile, String> {
    if !path.exists() {
        let commands = default_external_commands();
        save_external_commands_to_path(path, &commands)?;
        return Ok(commands);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format_io_error("read external commands", path, error))?;
    let commands = match serde_json::from_str::<ExternalCommandsConfig>(&content)
        .map_err(|error| format!("Parse external commands failed: {error}"))?
    {
        ExternalCommandsConfig::Wrapped(commands) => commands,
        ExternalCommandsConfig::List(commands) => ExternalCommandsFile { commands },
    };
    validate_external_commands(&commands)?;
    Ok(commands)
}

pub(crate) fn save_external_commands_to_path(
    path: &Path,
    commands: &ExternalCommandsFile,
) -> Result<(), String> {
    validate_external_commands(commands)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create external command directory", parent, error))?;
    }
    let content = serde_json::to_string_pretty(commands)
        .map_err(|error| format!("Serialize external commands failed: {error}"))?;
    fs::write(path, content)
        .map_err(|error| format_io_error("write external commands", path, error))
}

fn validate_external_commands(commands: &ExternalCommandsFile) -> Result<(), String> {
    for command in &commands.commands {
        if command.id.trim().is_empty() {
            return Err("External command id is required.".to_string());
        }
        if command.name.trim().is_empty() {
            return Err(format!("External command name is required: {}", command.id));
        }
        if command.template.trim().is_empty() {
            return Err(format!(
                "External command template is required: {}",
                command.id
            ));
        }
        if let Some(argument_mode) = command.argument_mode.as_deref() {
            if !["args", "repeat", "join"].contains(&argument_mode) {
                return Err(format!(
                    "External command argumentMode must be args, repeat, or join: {}",
                    command.id
                ));
            }
        }
    }
    Ok(())
}

pub(crate) fn load_app_settings_from_path(path: &Path) -> Result<AppSettings, String> {
    if !path.exists() {
        let settings = AppSettings::default();
        save_app_settings_to_path(path, &settings)?;
        return Ok(settings);
    }

    let content =
        fs::read_to_string(path).map_err(|error| format_io_error("read settings", path, error))?;
    let settings: AppSettings = serde_json::from_str(&content)
        .map_err(|error| format!("Parse settings failed: {error}"))?;
    let normalized = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Serialize settings failed: {error}"))?;
    if normalized.trim() != content.trim() {
        save_app_settings_to_path(path, &settings)?;
    }
    Ok(settings)
}

pub(crate) fn save_app_settings_to_path(path: &Path, settings: &AppSettings) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create settings directory", parent, error))?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Serialize settings failed: {error}"))?;
    fs::write(path, content).map_err(|error| format_io_error("write settings", path, error))
}

pub(crate) fn load_app_settings_from_dir(config_root: &Path) -> Result<AppSettings, String> {
    let settings_dir = config_root.join("settings");
    let operation_path = settings_dir.join("operation.json");
    let sftp_path = settings_dir.join("sftp.json");
    let legacy_path = config_root.join("settings.json");

    if !operation_path.exists() && !sftp_path.exists() && legacy_path.exists() {
        let settings = load_app_settings_from_path(&legacy_path)?;
        save_app_settings_to_dir(config_root, &settings)?;
        ensure_customization_settings_from_dir(config_root)?;
        return Ok(settings);
    }

    let operation = load_operation_settings_from_path(&operation_path)?;
    let sftp = load_sftp_settings_from_path(&sftp_path)?;
    ensure_customization_settings_from_dir(config_root)?;

    Ok(AppSettings {
        use_trash: operation.use_trash,
        operation_result: operation.operation_result,
        operation_cancel: operation.operation_cancel,
        external_editor: operation.external_editor,
        sftp_session: sftp.sftp_session,
        sftp_transfer: sftp.sftp_transfer,
    })
}

pub(crate) fn save_app_settings_to_dir(
    config_root: &Path,
    settings: &AppSettings,
) -> Result<(), String> {
    let settings_dir = config_root.join("settings");
    save_operation_settings_to_path(
        &settings_dir.join("operation.json"),
        &OperationSettings {
            use_trash: settings.use_trash,
            operation_result: settings.operation_result.clone(),
            operation_cancel: settings.operation_cancel.clone(),
            external_editor: settings.external_editor.clone(),
        },
    )?;
    save_sftp_settings_to_path(
        &settings_dir.join("sftp.json"),
        &SftpSettings {
            sftp_session: settings.sftp_session.clone(),
            sftp_transfer: settings.sftp_transfer.clone(),
        },
    )
}

pub(crate) fn load_operation_settings_from_path(path: &Path) -> Result<OperationSettings, String> {
    load_json_settings_from_path(path, OperationSettings::default(), "operation settings")
}

pub(crate) fn save_operation_settings_to_path(
    path: &Path,
    settings: &OperationSettings,
) -> Result<(), String> {
    save_json_settings_to_path(path, settings, "operation settings")
}

pub(crate) fn load_sftp_settings_from_path(path: &Path) -> Result<SftpSettings, String> {
    load_json_settings_from_path(path, SftpSettings::default(), "SFTP settings")
}

pub(crate) fn save_sftp_settings_to_path(
    path: &Path,
    settings: &SftpSettings,
) -> Result<(), String> {
    save_json_settings_to_path(path, settings, "SFTP settings")
}

pub(crate) fn ensure_customization_settings_from_dir(config_root: &Path) -> Result<(), String> {
    let settings_dir = config_root.join("settings");
    load_appearance_settings_from_path(&settings_dir.join("appearance.json"))?;
    load_keybind_settings_from_path(&settings_dir.join("keybind.json"))?;
    load_language_settings_from_path(&settings_dir.join("language.json"))?;
    Ok(())
}

pub(crate) fn load_appearance_settings_from_path(
    path: &Path,
) -> Result<AppearanceSettings, String> {
    load_json_settings_from_path(path, AppearanceSettings::default(), "appearance settings")
}

pub(crate) fn save_appearance_settings_to_path(
    path: &Path,
    settings: &AppearanceSettings,
) -> Result<(), String> {
    save_json_settings_to_path(path, settings, "appearance settings")
}

pub(crate) fn load_keybind_settings_from_path(path: &Path) -> Result<KeybindSettings, String> {
    let mut settings =
        load_json_settings_from_path(path, KeybindSettings::default(), "keybind settings")?;
    if merge_missing_keybinding_defaults(&mut settings) {
        save_json_settings_to_path(path, &settings, "keybind settings")?;
    }
    Ok(settings)
}

pub(crate) fn save_keybind_settings_to_path(
    path: &Path,
    settings: &KeybindSettings,
) -> Result<(), String> {
    let mut settings = settings.clone();
    merge_missing_keybinding_defaults(&mut settings);
    save_json_settings_to_path(path, &settings, "keybind settings")
}

fn merge_missing_keybinding_defaults(settings: &mut KeybindSettings) -> bool {
    let defaults = KeybindSettings::default();
    let mut changed = false;
    for (command_id, keys) in defaults.bindings {
        if let std::collections::btree_map::Entry::Vacant(entry) =
            settings.bindings.entry(command_id)
        {
            entry.insert(keys);
            changed = true;
        }
    }
    for (command_id, keys) in defaults.locked_bindings {
        if let std::collections::btree_map::Entry::Vacant(entry) =
            settings.locked_bindings.entry(command_id)
        {
            entry.insert(keys);
            changed = true;
        }
    }
    changed
}

pub(crate) fn load_language_settings_from_path(path: &Path) -> Result<LanguageSettings, String> {
    load_json_settings_from_path(path, LanguageSettings::default(), "language settings")
}

pub(crate) fn save_language_settings_to_path(
    path: &Path,
    settings: &LanguageSettings,
) -> Result<(), String> {
    save_json_settings_to_path(path, settings, "language settings")
}

fn load_json_settings_from_path<T>(path: &Path, default_value: T, label: &str) -> Result<T, String>
where
    T: DeserializeOwned + Serialize,
{
    if !path.exists() {
        save_json_settings_to_path(path, &default_value, label)?;
        return Ok(default_value);
    }

    let content = fs::read_to_string(path)
        .map_err(|error| format_io_error(&format!("read {label}"), path, error))?;
    let settings: T =
        serde_json::from_str(&content).map_err(|error| format!("Parse {label} failed: {error}"))?;
    let normalized = serde_json::to_string_pretty(&settings)
        .map_err(|error| format!("Serialize {label} failed: {error}"))?;
    if normalized.trim() != content.trim() {
        save_json_settings_to_path(path, &settings, label)?;
    }
    Ok(settings)
}

fn save_json_settings_to_path<T>(path: &Path, settings: &T, label: &str) -> Result<(), String>
where
    T: Serialize,
{
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format_io_error(&format!("create {label} directory"), parent, error)
        })?;
    }
    let content = serde_json::to_string_pretty(settings)
        .map_err(|error| format!("Serialize {label} failed: {error}"))?;
    fs::write(path, content)
        .map_err(|error| format_io_error(&format!("write {label}"), path, error))
}

pub(crate) fn save_operation_failure_log_to_path(
    path: &Path,
    label: &str,
    failed: &[FileOperationResultItem],
) -> Result<String, String> {
    if failed.is_empty() {
        return Ok(path_to_string(path));
    }
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create operation log directory", parent, error))?;
    }

    let timestamp = std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs().to_string())
        .unwrap_or_else(|_| "unknown-time".to_string());
    let mut content = format!("[{timestamp}] {label}: {} failed\n", failed.len());
    for item in failed {
        content.push_str(&format!(
            "- {}: {}\n",
            if item.path.is_empty() {
                "-"
            } else {
                &item.path
            },
            item.message
        ));
    }
    content.push('\n');

    let mut file = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(path)
        .map_err(|error| format_io_error("open operation log", path, error))?;
    file.write_all(content.as_bytes())
        .map_err(|error| format_io_error("write operation log", path, error))?;
    Ok(path_to_string(path))
}

fn format_io_error(action: &str, path: &Path, error: std::io::Error) -> String {
    format!("{action} failed for {}: {error}", path.display())
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::BTreeSet;

    const JAPANESE_LANGUAGE_JSON: &str = include_str!("../../docs/examples/language.ja.json");
    const QUENYA_LATIN_LANGUAGE_JSON: &str =
        include_str!("../../docs/examples/language.qya-Latn.json");

    #[test]
    fn bundled_keybind_defaults_parse() {
        let settings = default_keybind_settings_from_json();

        assert!(settings.bindings.contains_key("file.copy"));
        assert!(settings.locked_bindings.contains_key("terminal.break"));
    }

    #[test]
    fn invalid_keybind_json_is_reported_as_parse_error() {
        assert!(keybind_settings_from_json("{").is_err());
    }

    #[test]
    fn language_presets_are_compatible_with_default_messages() {
        assert_language_preset_compatibility("Japanese", "ja", JAPANESE_LANGUAGE_JSON);
        assert_language_preset_compatibility(
            "Quenya Latin",
            "qya-Latn",
            QUENYA_LATIN_LANGUAGE_JSON,
        );
    }

    fn assert_language_preset_compatibility(name: &str, expected_locale: &str, json: &str) {
        let preset: LanguageSettings = serde_json::from_str(json)
            .unwrap_or_else(|error| panic!("parse {name} language preset: {error}"));
        let defaults = default_language_messages();

        assert_eq!(preset.schema_version, default_settings_schema_version());
        assert_eq!(preset.locale, expected_locale);
        assert_eq!(
            message_keys(&preset.messages),
            message_keys(&defaults),
            "{name} preset must provide exactly the default message keys"
        );

        for (key, default_message) in defaults {
            let translated = preset
                .messages
                .get(&key)
                .unwrap_or_else(|| panic!("missing {name} message for {key}"));
            assert_eq!(
                placeholders(translated),
                placeholders(&default_message),
                "placeholder mismatch for {name} message {key}"
            );
        }
    }

    fn message_keys(messages: &BTreeMap<String, String>) -> BTreeSet<String> {
        messages.keys().cloned().collect()
    }

    fn placeholders(message: &str) -> BTreeSet<String> {
        let mut placeholders = BTreeSet::new();
        let mut rest = message;
        while let Some(open) = rest.find('{') {
            let after_open = &rest[open + 1..];
            let Some(close) = after_open.find('}') else {
                break;
            };
            let name = &after_open[..close];
            if !name.is_empty()
                && name
                    .chars()
                    .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
            {
                placeholders.insert(name.to_string());
            }
            rest = &after_open[close + 1..];
        }
        placeholders
    }
}
