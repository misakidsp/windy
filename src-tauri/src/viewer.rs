use crate::archive::{parse_archive_entry_path, read_archive_entry_bytes};
use crate::path_utils::{format_io_error, path_to_string};
use encoding_rs::{Encoding, EUC_JP, ISO_2022_JP, SHIFT_JIS, UTF_8};
use serde::Serialize;
use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TextFileContent {
    pub(crate) path: String,
    pub(crate) content: String,
    pub(crate) encoding: String,
    pub(crate) truncated: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ImageFileContent {
    pub(crate) path: String,
    pub(crate) data_url: String,
    pub(crate) mime_type: String,
}

pub(crate) const TEXT_VIEWER_MAX_BYTES: u64 = 1024 * 1024;
pub(crate) const IMAGE_VIEWER_MAX_BYTES: u64 = 32 * 1024 * 1024;

#[tauri::command]
pub(crate) async fn read_image_file(path: String) -> Result<ImageFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_image_file_blocking(PathBuf::from(path)))
        .await
        .map_err(|error| format!("Image reader task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn read_archive_image_file(path: String) -> Result<ImageFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_archive_image_file_blocking(path))
        .await
        .map_err(|error| format!("Archive image reader task failed: {error}"))?
}

pub(crate) fn read_image_file_blocking(path: PathBuf) -> Result<ImageFileContent, String> {
    let metadata = fs::metadata(&path)
        .map_err(|error| format_io_error("read image metadata", &path, error))?;
    if !metadata.is_file() {
        return Err(format!(
            "Image path is not a file: {}",
            path_to_string(&path)
        ));
    }
    if metadata.len() > IMAGE_VIEWER_MAX_BYTES {
        return Err(format!(
            "Image is too large for the internal viewer: {} bytes",
            metadata.len()
        ));
    }

    let bytes =
        fs::read(&path).map_err(|error| format_io_error("read image file", &path, error))?;
    image_content_from_bytes(path_to_string(&path), &path, bytes)
}

pub(crate) fn read_archive_image_file_blocking(path: String) -> Result<ImageFileContent, String> {
    let (archive_path, inner_path) = parse_archive_entry_path(&path)
        .ok_or_else(|| format!("Invalid archive entry path: {path}"))?;
    let bytes = read_archive_entry_bytes(&archive_path, &inner_path, IMAGE_VIEWER_MAX_BYTES)?;
    image_content_from_bytes(path, Path::new(&inner_path), bytes)
}

fn image_content_from_bytes(
    path: String,
    mime_source_path: &Path,
    bytes: Vec<u8>,
) -> Result<ImageFileContent, String> {
    let mime_type = image_mime_type(mime_source_path)?;
    let data_url = format!("data:{mime_type};base64,{}", encode_base64(&bytes));
    Ok(ImageFileContent {
        path,
        data_url,
        mime_type,
    })
}

fn image_mime_type(path: &Path) -> Result<String, String> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    match extension.as_str() {
        "png" => Ok("image/png".to_string()),
        "jpg" | "jpeg" => Ok("image/jpeg".to_string()),
        "gif" => Ok("image/gif".to_string()),
        "webp" => Ok("image/webp".to_string()),
        "bmp" => Ok("image/bmp".to_string()),
        "svg" => Ok("image/svg+xml".to_string()),
        _ => Err(format!("Unsupported image extension: .{extension}")),
    }
}

pub(crate) fn encode_base64(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut output = String::with_capacity(bytes.len().div_ceil(3) * 4);

    for chunk in bytes.chunks(3) {
        let first = chunk[0];
        let second = *chunk.get(1).unwrap_or(&0);
        let third = *chunk.get(2).unwrap_or(&0);

        output.push(TABLE[(first >> 2) as usize] as char);
        output.push(TABLE[(((first & 0b0000_0011) << 4) | (second >> 4)) as usize] as char);
        if chunk.len() > 1 {
            output.push(TABLE[(((second & 0b0000_1111) << 2) | (third >> 6)) as usize] as char);
        } else {
            output.push('=');
        }
        if chunk.len() > 2 {
            output.push(TABLE[(third & 0b0011_1111) as usize] as char);
        } else {
            output.push('=');
        }
    }

    output
}

#[tauri::command]
pub(crate) async fn read_text_file(path: String) -> Result<TextFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_text_file_blocking(PathBuf::from(path)))
        .await
        .map_err(|error| format!("Text viewer task failed: {error}"))?
}

#[tauri::command]
pub(crate) async fn read_archive_text_file(path: String) -> Result<TextFileContent, String> {
    tauri::async_runtime::spawn_blocking(move || read_archive_text_file_blocking(path))
        .await
        .map_err(|error| format!("Archive text viewer task failed: {error}"))?
}

pub(crate) fn read_text_file_blocking(path: PathBuf) -> Result<TextFileContent, String> {
    let metadata =
        fs::metadata(&path).map_err(|error| format_io_error("read metadata", &path, error))?;
    if !metadata.is_file() {
        return Err(format!("Not a regular file: '{}'", path.display()));
    }

    let mut file =
        fs::File::open(&path).map_err(|error| format_io_error("open file", &path, error))?;
    let mut bytes = Vec::new();
    Read::by_ref(&mut file)
        .take(TEXT_VIEWER_MAX_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|error| format_io_error("read file", &path, error))?;
    let truncated =
        bytes.len() > TEXT_VIEWER_MAX_BYTES as usize || metadata.len() > TEXT_VIEWER_MAX_BYTES;
    bytes.truncate(TEXT_VIEWER_MAX_BYTES as usize);

    Ok(text_content_from_bytes(
        path_to_string(&path),
        bytes,
        truncated,
    ))
}

pub(crate) fn read_archive_text_file_blocking(path: String) -> Result<TextFileContent, String> {
    let (archive_path, inner_path) = parse_archive_entry_path(&path)
        .ok_or_else(|| format!("Invalid archive entry path: {path}"))?;
    let bytes = read_archive_entry_bytes(&archive_path, &inner_path, TEXT_VIEWER_MAX_BYTES)?;
    let truncated = bytes.len() > TEXT_VIEWER_MAX_BYTES as usize;
    let mut bytes = bytes;
    bytes.truncate(TEXT_VIEWER_MAX_BYTES as usize);
    Ok(text_content_from_bytes(path, bytes, truncated))
}

fn text_content_from_bytes(path: String, bytes: Vec<u8>, truncated: bool) -> TextFileContent {
    let decoded = decode_text_bytes(&bytes);
    TextFileContent {
        path,
        content: decoded.content,
        encoding: decoded.encoding,
        truncated,
    }
}

struct DecodedText {
    content: String,
    encoding: String,
}

fn decode_text_bytes(bytes: &[u8]) -> DecodedText {
    if bytes.starts_with(&[0xef, 0xbb, 0xbf]) {
        return decode_with_encoding(bytes, UTF_8, "UTF-8");
    }
    if looks_like_iso_2022_jp(bytes) {
        let decoded = decode_with_encoding(bytes, ISO_2022_JP, "ISO-2022-JP");
        if !decoded.content.contains('\u{fffd}') {
            return decoded;
        }
    }
    if std::str::from_utf8(bytes).is_ok() {
        return decode_with_encoding(bytes, UTF_8, "UTF-8");
    }

    [SHIFT_JIS, EUC_JP, ISO_2022_JP]
        .into_iter()
        .map(|encoding| decode_with_encoding(bytes, encoding, encoding.name()))
        .max_by_key(|decoded| decoded_text_score(&decoded.content))
        .unwrap_or_else(|| DecodedText {
            content: String::from_utf8_lossy(bytes).to_string(),
            encoding: "UTF-8 lossy".to_string(),
        })
}

fn decode_with_encoding(bytes: &[u8], encoding: &'static Encoding, label: &str) -> DecodedText {
    let (content, _, _) = encoding.decode(bytes);
    DecodedText {
        content: content.into_owned(),
        encoding: label.to_string(),
    }
}

fn looks_like_iso_2022_jp(bytes: &[u8]) -> bool {
    bytes.windows(3).any(|window| {
        matches!(
            window,
            [0x1b, 0x24, 0x40]
                | [0x1b, 0x24, 0x42]
                | [0x1b, 0x28, 0x42]
                | [0x1b, 0x28, 0x4a]
                | [0x1b, 0x28, 0x49]
        )
    })
}

fn decoded_text_score(text: &str) -> i32 {
    text.chars()
        .map(|ch| {
            if ch == '\u{fffd}' {
                -100
            } else if ch.is_control() && ch != '\n' && ch != '\r' && ch != '\t' {
                -10
            } else if is_japanese_char(ch) {
                3
            } else if ch.is_ascii() {
                1
            } else {
                2
            }
        })
        .sum()
}

fn is_japanese_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3040..=0x309f
            | 0x30a0..=0x30ff
            | 0x3400..=0x4dbf
            | 0x4e00..=0x9fff
            | 0xff66..=0xff9f
    )
}
