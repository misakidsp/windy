use crate::path_utils::{format_io_error, path_to_string};
use crate::{sort_entries, ArchiveDirectoryListing, EntryKind, FileEntry};
use flate2::{read::GzDecoder, write::GzEncoder, Compression};
use std::{
    collections::BTreeMap,
    fs,
    io::{self, Read, Write},
    path::{Component, Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tar::{Archive, Builder};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipArchive, ZipWriter};

struct ArchiveMember {
    name: String,
    is_dir: bool,
    size: u64,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum ArchiveKind {
    Zip,
    Tar,
    TarGz,
}

pub(crate) enum CreateArchiveKind {
    Zip,
    Tar,
    TarGz,
}

pub(crate) fn list_archive_directory_blocking(
    archive_path: PathBuf,
    inner_path: String,
) -> Result<ArchiveDirectoryListing, String> {
    match archive_kind(&archive_path)? {
        ArchiveKind::Zip => list_zip_archive_directory_blocking(archive_path, inner_path),
        ArchiveKind::Tar | ArchiveKind::TarGz => {
            list_tar_archive_directory_blocking(archive_path, inner_path)
        }
    }
}

fn list_zip_archive_directory_blocking(
    archive_path: PathBuf,
    inner_path: String,
) -> Result<ArchiveDirectoryListing, String> {
    if !is_supported_archive_path(&archive_path) {
        return Err(format!(
            "Unsupported archive type: {}",
            path_to_string(&archive_path)
        ));
    }

    let file = fs::File::open(&archive_path)
        .map_err(|error| format_io_error("open archive", &archive_path, error))?;
    let mut archive =
        ZipArchive::new(file).map_err(|error| format!("Read archive failed: {error}"))?;
    let normalized_inner = normalize_archive_inner_path(&inner_path);
    let mut members = Vec::new();

    for index in 0..archive.len() {
        let Ok(file) = archive.by_index(index) else {
            continue;
        };
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        members.push(ArchiveMember {
            name: path_to_archive_name(&enclosed_name, file.is_dir()),
            is_dir: file.is_dir(),
            size: file.size(),
        });
    }

    Ok(archive_listing_from_members(
        &archive_path,
        &normalized_inner,
        members,
    ))
}

fn list_tar_archive_directory_blocking(
    archive_path: PathBuf,
    inner_path: String,
) -> Result<ArchiveDirectoryListing, String> {
    let normalized_inner = normalize_archive_inner_path(&inner_path);
    let mut archive = open_tar_archive(&archive_path)?;
    let mut members = Vec::new();

    for entry in archive
        .entries()
        .map_err(|error| format!("Read archive entries failed: {error}"))?
    {
        let Ok(entry) = entry else {
            continue;
        };
        let Ok(path) = entry.path() else {
            continue;
        };
        let is_dir = entry.header().entry_type().is_dir();
        let Some(name) = safe_archive_name(&path, is_dir) else {
            continue;
        };
        members.push(ArchiveMember {
            name,
            is_dir,
            size: entry.size(),
        });
    }

    Ok(archive_listing_from_members(
        &archive_path,
        &normalized_inner,
        members,
    ))
}

fn archive_listing_from_members(
    archive_path: &Path,
    normalized_inner: &str,
    members: Vec<ArchiveMember>,
) -> ArchiveDirectoryListing {
    let mut entries: BTreeMap<String, FileEntry> = BTreeMap::new();

    for member in members {
        if member.name.is_empty() || !member.name.starts_with(normalized_inner) {
            continue;
        }

        let remainder = &member.name[normalized_inner.len()..];
        if remainder.is_empty() {
            continue;
        }
        let first_segment = remainder
            .trim_end_matches('/')
            .split('/')
            .next()
            .unwrap_or("");
        if first_segment.is_empty() {
            continue;
        }

        let is_immediate = remainder.trim_end_matches('/') == first_segment;
        let is_directory = !is_immediate || member.is_dir;
        let entry_inner_path = if is_directory {
            format!("{normalized_inner}{first_segment}/")
        } else {
            format!("{normalized_inner}{first_segment}")
        };
        let entry_path = archive_entry_display_path(archive_path, &entry_inner_path);

        entries
            .entry(entry_inner_path.clone())
            .or_insert(FileEntry {
                key: entry_path.clone(),
                name: first_segment.to_string(),
                path: entry_path,
                kind: if is_directory {
                    EntryKind::Directory
                } else {
                    EntryKind::File
                },
                size: if is_directory {
                    None
                } else {
                    Some(member.size)
                },
                modified_at: None,
                hidden: first_segment.starts_with('.'),
                readonly: true,
                mode: None,
            });
    }

    let mut entries: Vec<FileEntry> = entries.into_values().collect();
    sort_entries(&mut entries);

    ArchiveDirectoryListing {
        archive_path: path_to_string(archive_path),
        inner_path: normalized_inner.trim_end_matches('/').to_string(),
        display_path: archive_directory_display_path(archive_path, normalized_inner),
        entries,
    }
}

fn is_supported_archive_path(path: &Path) -> bool {
    archive_kind(path).is_ok()
}

fn archive_kind(path: &Path) -> Result<ArchiveKind, String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if name.ends_with(".zip") {
        Ok(ArchiveKind::Zip)
    } else if name.ends_with(".tar") {
        Ok(ArchiveKind::Tar)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        Ok(ArchiveKind::TarGz)
    } else {
        Err(format!("Unsupported archive type: '{}'", path.display()))
    }
}

fn open_tar_archive(path: &Path) -> Result<Archive<Box<dyn Read>>, String> {
    let file =
        fs::File::open(path).map_err(|error| format_io_error("open archive", path, error))?;
    let reader: Box<dyn Read> = match archive_kind(path)? {
        ArchiveKind::Tar => Box::new(file),
        ArchiveKind::TarGz => Box::new(GzDecoder::new(file)),
        ArchiveKind::Zip => return Err(format!("Not a tar archive: '{}'", path.display())),
    };
    Ok(Archive::new(reader))
}

fn normalize_archive_inner_path(path: &str) -> String {
    let trimmed = path.trim_matches('/');
    if trimmed.is_empty() {
        String::new()
    } else {
        format!("{trimmed}/")
    }
}

fn path_to_archive_name(path: &Path, is_dir: bool) -> String {
    let mut name = path
        .components()
        .map(|component| component.as_os_str().to_string_lossy())
        .collect::<Vec<_>>()
        .join("/");
    if is_dir && !name.ends_with('/') {
        name.push('/');
    }
    name
}

fn archive_directory_display_path(archive_path: &Path, normalized_inner_path: &str) -> String {
    let trimmed = normalized_inner_path.trim_end_matches('/');
    if trimmed.is_empty() {
        format!("{}::/", path_to_string(archive_path))
    } else {
        format!("{}::/{trimmed}", path_to_string(archive_path))
    }
}

fn archive_entry_display_path(archive_path: &Path, inner_path: &str) -> String {
    format!("{}::/{inner_path}", path_to_string(archive_path))
}

pub(crate) fn extract_archive_to_directory(
    archive_path: &Path,
    destination_dir: &Path,
) -> Result<PathBuf, String> {
    let kind = archive_kind(archive_path)?;
    if !destination_dir.is_dir() {
        return Err(format!(
            "Destination is not a directory: '{}'",
            destination_dir.display()
        ));
    }

    let archive_stem = archive_destination_stem(archive_path)?;
    let destination_root = destination_dir.join(archive_stem);
    if destination_root.exists() {
        return Err(format!(
            "Destination already exists: '{}'",
            destination_root.display()
        ));
    }

    let extraction_result = match kind {
        ArchiveKind::Zip => extract_zip_archive_to_directory(archive_path, &destination_root),
        ArchiveKind::Tar | ArchiveKind::TarGz => {
            extract_tar_archive_to_directory(archive_path, &destination_root)
        }
    };

    if extraction_result.is_err() && destination_root.exists() {
        let _ = fs::remove_dir_all(&destination_root);
    }

    extraction_result
}

pub(crate) fn create_archive_from_sources(
    sources: &[PathBuf],
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    if sources.is_empty() {
        return Err("No archive sources were resolved.".to_string());
    }
    if destination.exists() {
        return Err(format!(
            "Destination already exists: '{}'",
            destination.display()
        ));
    }
    if let Some(parent) = destination.parent() {
        if !parent.is_dir() {
            return Err(format!(
                "Destination parent is not a directory: '{}'",
                parent.display()
            ));
        }
    }
    for source in sources {
        if !source.exists() {
            return Err(format!(
                "Archive source does not exist: '{}'",
                source.display()
            ));
        }
        ensure_archive_destination_is_not_inside_source(source, destination)?;
    }

    let kind = create_archive_kind(destination)?;
    let part_destination = archive_part_path(destination)?;
    if part_destination.exists() {
        return Err(format!(
            "Temporary archive already exists: '{}'",
            part_destination.display()
        ));
    }

    let result = match kind {
        CreateArchiveKind::Zip => create_zip_archive(sources, &part_destination, cancellation),
        CreateArchiveKind::Tar => create_tar_archive(sources, &part_destination, cancellation),
        CreateArchiveKind::TarGz => create_tar_gz_archive(sources, &part_destination, cancellation),
    };

    if let Err(message) = result {
        let _ = fs::remove_file(&part_destination);
        return Err(message);
    }

    fs::rename(&part_destination, destination).map_err(|error| {
        let _ = fs::remove_file(&part_destination);
        format_io_error("finish archive", &part_destination, error)
    })
}

pub(crate) fn create_archive_kind(path: &Path) -> Result<CreateArchiveKind, String> {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if name.ends_with(".zip") {
        Ok(CreateArchiveKind::Zip)
    } else if name.ends_with(".tar") {
        Ok(CreateArchiveKind::Tar)
    } else if name.ends_with(".tar.gz") || name.ends_with(".tgz") {
        Ok(CreateArchiveKind::TarGz)
    } else {
        Err("Archive name must end with .zip, .tar, .tar.gz, or .tgz.".to_string())
    }
}

fn archive_part_path(destination: &Path) -> Result<PathBuf, String> {
    let file_name = destination
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| format!("Destination has no file name: '{}'", destination.display()))?;
    Ok(destination.with_file_name(format!("{file_name}.part")))
}

pub(crate) fn archive_creation_canceled_message() -> &'static str {
    "Archive creation canceled."
}

fn archive_creation_canceled(cancellation: &Arc<AtomicBool>) -> bool {
    cancellation.load(Ordering::SeqCst)
}

fn create_zip_archive(
    sources: &[PathBuf],
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    let file = fs::File::create(destination)
        .map_err(|error| format_io_error("create archive", destination, error))?;
    let mut writer = ZipWriter::new(file);
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    for source in sources {
        if archive_creation_canceled(cancellation) {
            return Err(archive_creation_canceled_message().to_string());
        }
        let archive_name = source_archive_name(source)?;
        append_zip_source(&mut writer, source, &archive_name, options, cancellation)?;
    }

    writer
        .finish()
        .map_err(|error| format!("Finish zip archive failed: {error}"))?;
    Ok(())
}

fn append_zip_source(
    writer: &mut ZipWriter<fs::File>,
    source: &Path,
    archive_name: &str,
    options: SimpleFileOptions,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    if archive_creation_canceled(cancellation) {
        return Err(archive_creation_canceled_message().to_string());
    }
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format_io_error("read archive source metadata", source, error))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Archiving symlinks is not supported yet: '{}'",
            source.display()
        ));
    }
    if metadata.is_dir() {
        let directory_name = format!("{}/", archive_name.trim_end_matches('/'));
        writer
            .add_directory(directory_name, options)
            .map_err(|error| {
                format!(
                    "Add zip directory failed for '{}': {error}",
                    source.display()
                )
            })?;
        for entry in fs::read_dir(source)
            .map_err(|error| format_io_error("read archive source directory", source, error))?
        {
            let entry = entry
                .map_err(|error| format_io_error("read archive directory entry", source, error))?;
            let child_name = archive_child_name(archive_name, &entry.file_name().to_string_lossy());
            append_zip_source(writer, &entry.path(), &child_name, options, cancellation)?;
        }
        return Ok(());
    }
    if !metadata.is_file() {
        return Err(format!(
            "Unsupported archive source type: '{}'",
            source.display()
        ));
    }

    writer
        .start_file(archive_name, options)
        .map_err(|error| format!("Add zip file failed for '{}': {error}", source.display()))?;
    let mut input = fs::File::open(source)
        .map_err(|error| format_io_error("open archive source", source, error))?;
    io::copy(&mut input, writer)
        .map_err(|error| format_io_error("write archive source", source, error))?;
    Ok(())
}

fn create_tar_archive(
    sources: &[PathBuf],
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    let file = fs::File::create(destination)
        .map_err(|error| format_io_error("create archive", destination, error))?;
    let mut builder = Builder::new(file);
    append_tar_sources(&mut builder, sources, cancellation)?;
    Ok(())
}

fn create_tar_gz_archive(
    sources: &[PathBuf],
    destination: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    let file = fs::File::create(destination)
        .map_err(|error| format_io_error("create archive", destination, error))?;
    let encoder = GzEncoder::new(file, Compression::default());
    let mut builder = Builder::new(encoder);
    append_tar_sources(&mut builder, sources, cancellation)?;
    let encoder = builder
        .into_inner()
        .map_err(|error| format!("Finish tar.gz archive failed: {error}"))?;
    encoder
        .finish()
        .map_err(|error| format!("Finish gzip stream failed: {error}"))?;
    Ok(())
}

fn append_tar_sources<W: Write>(
    builder: &mut Builder<W>,
    sources: &[PathBuf],
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    for source in sources {
        if archive_creation_canceled(cancellation) {
            return Err(archive_creation_canceled_message().to_string());
        }
        let archive_name = source_archive_name(source)?;
        append_tar_source(builder, source, Path::new(&archive_name), cancellation)?;
    }
    builder
        .finish()
        .map_err(|error| format!("Finish tar entries failed: {error}"))
}

fn append_tar_source<W: Write>(
    builder: &mut Builder<W>,
    source: &Path,
    archive_path: &Path,
    cancellation: &Arc<AtomicBool>,
) -> Result<(), String> {
    if archive_creation_canceled(cancellation) {
        return Err(archive_creation_canceled_message().to_string());
    }
    let metadata = fs::symlink_metadata(source)
        .map_err(|error| format_io_error("read archive source metadata", source, error))?;
    if metadata.file_type().is_symlink() {
        return Err(format!(
            "Archiving symlinks is not supported yet: '{}'",
            source.display()
        ));
    }
    if metadata.is_dir() {
        builder
            .append_dir(archive_path, source)
            .map_err(|error| format_io_error("append tar directory", source, error))?;
        for entry in fs::read_dir(source)
            .map_err(|error| format_io_error("read archive source directory", source, error))?
        {
            let entry = entry
                .map_err(|error| format_io_error("read archive directory entry", source, error))?;
            append_tar_source(
                builder,
                &entry.path(),
                &archive_path.join(entry.file_name()),
                cancellation,
            )?;
        }
        return Ok(());
    }
    if metadata.is_file() {
        builder
            .append_path_with_name(source, archive_path)
            .map_err(|error| format_io_error("append tar file", source, error))?;
        return Ok(());
    }
    Err(format!(
        "Unsupported archive source type: '{}'",
        source.display()
    ))
}

fn source_archive_name(source: &Path) -> Result<String, String> {
    source
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.is_empty())
        .ok_or_else(|| format!("Archive source has no file name: '{}'", source.display()))
}

fn archive_child_name(parent: &str, child: &str) -> String {
    format!("{}/{}", parent.trim_end_matches('/'), child)
}

fn ensure_archive_destination_is_not_inside_source(
    source: &Path,
    destination: &Path,
) -> Result<(), String> {
    if !source.is_dir() {
        return Ok(());
    }
    let source = fs::canonicalize(source)
        .map_err(|error| format_io_error("resolve archive source", source, error))?;
    let destination_parent = destination.parent().ok_or_else(|| {
        format!(
            "Archive destination has no parent: '{}'",
            destination.display()
        )
    })?;
    let destination_parent = if destination_parent.exists() {
        destination_parent.to_path_buf()
    } else {
        destination_parent
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| {
                format!(
                    "Archive destination parent cannot be resolved: '{}'",
                    destination_parent.display()
                )
            })?
    };
    let destination_parent = fs::canonicalize(&destination_parent).map_err(|error| {
        format_io_error(
            "resolve archive destination parent",
            &destination_parent,
            error,
        )
    })?;
    if destination_parent.starts_with(source) {
        return Err("Cannot create an archive inside a selected source directory.".to_string());
    }
    Ok(())
}

fn archive_destination_stem(archive_path: &Path) -> Result<String, String> {
    let file_name = archive_path
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Archive has no valid file name: '{}'",
                archive_path.display()
            )
        })?;
    let lower_name = file_name.to_ascii_lowercase();

    let stem = if lower_name.ends_with(".tar.gz") {
        &file_name[..file_name.len() - ".tar.gz".len()]
    } else if lower_name.ends_with(".tgz") {
        &file_name[..file_name.len() - ".tgz".len()]
    } else {
        archive_path
            .file_stem()
            .and_then(|value| value.to_str())
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                format!(
                    "Archive has no valid file name: '{}'",
                    archive_path.display()
                )
            })?
    };

    if stem.is_empty() {
        return Err(format!(
            "Archive has no valid file name: '{}'",
            archive_path.display()
        ));
    }

    Ok(stem.to_string())
}

fn extract_zip_archive_to_directory(
    archive_path: &Path,
    destination_root: &Path,
) -> Result<PathBuf, String> {
    let archive_file = fs::File::open(archive_path)
        .map_err(|error| format_io_error("open archive", archive_path, error))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Read archive failed: {error}"))?;
    fs::create_dir(destination_root)
        .map_err(|error| format_io_error("create extraction directory", destination_root, error))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Read archive entry failed: {error}"))?;
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        let destination = archive_destination_path(destination_root, &enclosed_name)?;

        if file.is_dir() {
            fs::create_dir_all(&destination).map_err(|error| {
                format_io_error("create extracted directory", &destination, error)
            })?;
            continue;
        }

        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format_io_error("create extracted parent directory", parent, error)
            })?;
        }
        if destination.exists() {
            return Err(format!(
                "Extracted destination already exists: '{}'",
                destination.display()
            ));
        }

        let mut output = fs::File::create(&destination)
            .map_err(|error| format_io_error("create extracted file", &destination, error))?;
        io::copy(&mut file, &mut output)
            .map_err(|error| format_io_error("write extracted file", &destination, error))?;
    }

    Ok(destination_root.to_path_buf())
}

fn extract_tar_archive_to_directory(
    archive_path: &Path,
    destination_root: &Path,
) -> Result<PathBuf, String> {
    fs::create_dir(destination_root)
        .map_err(|error| format_io_error("create extraction directory", destination_root, error))?;
    let mut archive = open_tar_archive(archive_path)?;
    for entry in archive
        .entries()
        .map_err(|error| format!("Read archive entries failed: {error}"))?
    {
        let mut entry = entry.map_err(|error| format!("Read archive entry failed: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("Read archive entry path failed: {error}"))?;
        let safe_relative = safe_archive_relative_path(&path)
            .ok_or_else(|| format!("Archive entry has an unsafe path: '{}'", path.display()))?;
        let destination = archive_destination_path(destination_root, &safe_relative)?;
        unpack_tar_entry(&mut entry, &destination)?;
    }
    Ok(destination_root.to_path_buf())
}

pub(crate) fn copy_archive_entry_to_directory(
    archive_path: &Path,
    inner_path: &str,
    destination_dir: &Path,
) -> Result<PathBuf, String> {
    if !destination_dir.is_dir() {
        return Err(format!(
            "Destination is not a directory: '{}'",
            destination_dir.display()
        ));
    }

    let normalized_inner = normalize_archive_inner_path_for_entry(inner_path)?;
    let leaf_name = archive_inner_leaf_name(&normalized_inner)?;
    let destination_root = destination_dir.join(leaf_name);
    if destination_root.exists() {
        return Err(format!(
            "Destination already exists: '{}'",
            destination_root.display()
        ));
    }

    match archive_kind(archive_path)? {
        ArchiveKind::Zip => {
            copy_zip_archive_entry_to_directory(archive_path, &normalized_inner, destination_root)
        }
        ArchiveKind::Tar | ArchiveKind::TarGz => {
            copy_tar_archive_entry_to_directory(archive_path, &normalized_inner, destination_root)
        }
    }
}

fn copy_zip_archive_entry_to_directory(
    archive_path: &Path,
    normalized_inner: &str,
    destination_root: PathBuf,
) -> Result<PathBuf, String> {
    let archive_file = fs::File::open(archive_path)
        .map_err(|error| format_io_error("open archive", archive_path, error))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Read archive failed: {error}"))?;
    let directory_prefix = format!("{}/", normalized_inner.trim_end_matches('/'));

    let mut copied = false;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Read archive entry failed: {error}"))?;
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        let archive_name = path_to_archive_name(&enclosed_name, file.is_dir());

        if archive_name == normalized_inner {
            extract_zip_file_entry(&mut file, &destination_root)?;
            copied = true;
        } else if archive_name == directory_prefix || archive_name.starts_with(&directory_prefix) {
            let relative = archive_name[directory_prefix.len()..].trim_end_matches('/');
            let destination = if relative.is_empty() {
                destination_root.clone()
            } else {
                archive_destination_path(&destination_root, Path::new(relative))?
            };
            extract_zip_file_entry(&mut file, &destination)?;
            copied = true;
        }
    }

    if copied {
        Ok(destination_root)
    } else {
        Err(format!(
            "Archive entry was not found: '{}::/{}'",
            archive_path.display(),
            normalized_inner
        ))
    }
}

fn copy_tar_archive_entry_to_directory(
    archive_path: &Path,
    normalized_inner: &str,
    destination_root: PathBuf,
) -> Result<PathBuf, String> {
    let directory_prefix = format!("{}/", normalized_inner.trim_end_matches('/'));
    let mut archive = open_tar_archive(archive_path)?;
    let mut copied = false;

    for entry in archive
        .entries()
        .map_err(|error| format!("Read archive entries failed: {error}"))?
    {
        let mut entry = entry.map_err(|error| format!("Read archive entry failed: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("Read archive entry path failed: {error}"))?;
        let Some(archive_name) = safe_archive_name(&path, entry.header().entry_type().is_dir())
        else {
            continue;
        };

        if archive_name == normalized_inner {
            unpack_tar_entry(&mut entry, &destination_root)?;
            copied = true;
        } else if archive_name.starts_with(&directory_prefix) {
            let relative = archive_name[directory_prefix.len()..].trim_end_matches('/');
            let destination = if relative.is_empty() {
                destination_root.clone()
            } else {
                archive_destination_path(&destination_root, Path::new(relative))?
            };
            unpack_tar_entry(&mut entry, &destination)?;
            copied = true;
        }
    }

    if copied {
        Ok(destination_root)
    } else {
        Err(format!(
            "Archive entry was not found: '{}::/{}'",
            archive_path.display(),
            normalized_inner
        ))
    }
}

pub(crate) fn read_archive_entry_bytes(
    archive_path: &Path,
    inner_path: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    let normalized_inner = normalize_archive_inner_path_for_entry(inner_path)?;
    match archive_kind(archive_path)? {
        ArchiveKind::Zip => {
            read_zip_archive_entry_bytes(archive_path, &normalized_inner, max_bytes)
        }
        ArchiveKind::Tar | ArchiveKind::TarGz => {
            read_tar_archive_entry_bytes(archive_path, &normalized_inner, max_bytes)
        }
    }
}

fn read_zip_archive_entry_bytes(
    archive_path: &Path,
    normalized_inner: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    let archive_file = fs::File::open(archive_path)
        .map_err(|error| format_io_error("open archive", archive_path, error))?;
    let mut archive =
        ZipArchive::new(archive_file).map_err(|error| format!("Read archive failed: {error}"))?;

    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| format!("Read archive entry failed: {error}"))?;
        let Some(enclosed_name) = file.enclosed_name() else {
            continue;
        };
        let archive_name = path_to_archive_name(&enclosed_name, file.is_dir());
        if archive_name != normalized_inner {
            continue;
        }
        if file.is_dir() {
            return Err(format!("Archive entry is a directory: {normalized_inner}"));
        }
        if file.size() > max_bytes {
            return Err(format!(
                "Archive entry is too large for the internal viewer: {} bytes",
                file.size()
            ));
        }

        let mut bytes = Vec::new();
        Read::by_ref(&mut file)
            .take(max_bytes + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Read archive entry bytes failed: {error}"))?;
        return Ok(bytes);
    }

    Err(format!(
        "Archive entry was not found: '{}::/{}'",
        archive_path.display(),
        normalized_inner
    ))
}

fn read_tar_archive_entry_bytes(
    archive_path: &Path,
    normalized_inner: &str,
    max_bytes: u64,
) -> Result<Vec<u8>, String> {
    let mut archive = open_tar_archive(archive_path)?;
    for entry in archive
        .entries()
        .map_err(|error| format!("Read archive entries failed: {error}"))?
    {
        let mut entry = entry.map_err(|error| format!("Read archive entry failed: {error}"))?;
        let path = entry
            .path()
            .map_err(|error| format!("Read archive entry path failed: {error}"))?;
        let Some(archive_name) = safe_archive_name(&path, entry.header().entry_type().is_dir())
        else {
            continue;
        };
        if archive_name != normalized_inner {
            continue;
        }
        if entry.header().entry_type().is_dir() {
            return Err(format!("Archive entry is a directory: {normalized_inner}"));
        }
        if entry.size() > max_bytes {
            return Err(format!(
                "Archive entry is too large for the internal viewer: {} bytes",
                entry.size()
            ));
        }

        let mut bytes = Vec::new();
        Read::by_ref(&mut entry)
            .take(max_bytes + 1)
            .read_to_end(&mut bytes)
            .map_err(|error| format!("Read archive entry bytes failed: {error}"))?;
        return Ok(bytes);
    }

    Err(format!(
        "Archive entry was not found: '{}::/{}'",
        archive_path.display(),
        normalized_inner
    ))
}

fn extract_zip_file_entry(
    file: &mut zip::read::ZipFile<'_>,
    destination: &Path,
) -> Result<(), String> {
    if file.is_dir() {
        fs::create_dir_all(destination)
            .map_err(|error| format_io_error("create extracted directory", destination, error))?;
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create extracted parent directory", parent, error))?;
    }
    if destination.exists() {
        return Err(format!(
            "Extracted destination already exists: '{}'",
            destination.display()
        ));
    }

    let mut output = fs::File::create(destination)
        .map_err(|error| format_io_error("create extracted file", destination, error))?;
    io::copy(file, &mut output)
        .map_err(|error| format_io_error("write extracted file", destination, error))?;
    Ok(())
}

fn archive_destination_path(
    destination_root: &Path,
    relative_path: &Path,
) -> Result<PathBuf, String> {
    let safe_relative = safe_archive_relative_path(relative_path).ok_or_else(|| {
        format!(
            "Archive entry has an unsafe path: '{}'",
            relative_path.display()
        )
    })?;
    let destination = destination_root.join(safe_relative);
    if !destination.starts_with(destination_root) {
        return Err(format!(
            "Archive entry would extract outside the destination: '{}'",
            relative_path.display()
        ));
    }
    Ok(destination)
}

fn unpack_tar_entry<R: Read>(
    entry: &mut tar::Entry<'_, R>,
    destination: &Path,
) -> Result<(), String> {
    let entry_type = entry.header().entry_type();
    if entry_type.is_symlink() || entry_type.is_hard_link() {
        return Err("Archive links are not allowed for extraction.".to_string());
    }
    if !(entry_type.is_file() || entry_type.is_dir()) {
        return Err("Archive special entries are not allowed for extraction.".to_string());
    }

    if entry_type.is_dir() {
        fs::create_dir_all(destination)
            .map_err(|error| format_io_error("create extracted directory", destination, error))?;
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format_io_error("create extracted parent directory", parent, error))?;
    }
    if destination.exists() {
        return Err(format!(
            "Extracted destination already exists: '{}'",
            destination.display()
        ));
    }

    entry
        .unpack(destination)
        .map(|_| ())
        .map_err(|error| format_io_error("unpack tar entry", destination, error))
}

fn safe_archive_name(path: &Path, is_dir: bool) -> Option<String> {
    safe_archive_relative_path(path).map(|relative| path_to_archive_name(&relative, is_dir))
}

fn safe_archive_relative_path(path: &Path) -> Option<PathBuf> {
    let mut relative = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => relative.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }

    if relative.as_os_str().is_empty() {
        None
    } else {
        Some(relative)
    }
}

pub(crate) fn parse_archive_entry_path(path: &str) -> Option<(PathBuf, String)> {
    let (archive_path, inner_path) = path.split_once("::/")?;
    Some((PathBuf::from(archive_path), inner_path.to_string()))
}

fn normalize_archive_inner_path_for_entry(inner_path: &str) -> Result<String, String> {
    let normalized = inner_path.trim_start_matches('/');
    if normalized.is_empty() {
        return Err("Archive entry path is empty.".to_string());
    }
    Ok(normalized.to_string())
}

fn archive_inner_leaf_name(inner_path: &str) -> Result<&str, String> {
    inner_path
        .trim_end_matches('/')
        .rsplit('/')
        .next()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Archive entry has no file name.".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn archive_destination_rejects_parent_traversal() {
        let root = Path::new("/tmp/windy-extract");

        let result = archive_destination_path(root, Path::new("../outside.txt"));

        assert!(result.is_err());
    }

    #[test]
    fn archive_destination_keeps_safe_paths_inside_root() {
        let root = Path::new("/tmp/windy-extract");

        let destination =
            archive_destination_path(root, Path::new("docs/readme.txt")).expect("safe path");

        assert_eq!(destination, root.join("docs").join("readme.txt"));
    }
}
