export function fileExtension(name: string): string {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function archiveInnerPathFromEntryPath(path: string): string {
  const marker = "::/";
  const markerIndex = path.indexOf(marker);
  if (markerIndex < 0) return "";
  return path.slice(markerIndex + marker.length).replace(/\/$/, "");
}

export function archiveEntryPath(path: string): boolean {
  return path.includes("::/");
}

export function sftpEntryPath(path: string): boolean {
  return path.startsWith("sftp://");
}

export function normalizeSftpRemotePath(path: string): string {
  const trimmed = path.trim() || "/";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

export function sftpRemotePathFromEntryPath(path: string): string {
  if (!sftpEntryPath(path)) return normalizeSftpRemotePath(path);
  const withoutScheme = path.slice("sftp://".length);
  const slashIndex = withoutScheme.indexOf("/");
  return slashIndex >= 0 ? normalizeSftpRemotePath(withoutScheme.slice(slashIndex)) : "/";
}

export function sftpParentRemotePath(path: string): string | null {
  const normalized = normalizeSftpRemotePath(path).replace(/\/$/, "") || "/";
  if (normalized === "/") return null;
  const slashIndex = normalized.lastIndexOf("/");
  return slashIndex <= 0 ? "/" : normalized.slice(0, slashIndex);
}

export function archiveParentInnerPath(innerPath: string): string | null {
  const trimmed = innerPath.replace(/\/$/, "");
  if (!trimmed) return null;
  const slashIndex = trimmed.lastIndexOf("/");
  return slashIndex >= 0 ? trimmed.slice(0, slashIndex) : "";
}

export function parentDirectoryFromArchivePath(archivePath: string): string {
  const slashIndex = Math.max(archivePath.lastIndexOf("/"), archivePath.lastIndexOf("\\"));
  return slashIndex > 0 ? archivePath.slice(0, slashIndex) : archivePath;
}
