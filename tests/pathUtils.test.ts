import assert from "node:assert/strict";
import { normalizeSftpRemotePath, sftpRemotePathFromEntryPath, sftpParentRemotePath } from "../src/routes/pathUtils";

assert.equal(normalizeSftpRemotePath(""), "/");
for (const suffix of [" ", "\t", "\u3000"]) {
  const parent = `/folder${suffix}`;
  const path = `${parent}/report${suffix}`;
  assert.equal(normalizeSftpRemotePath(path), path);
  assert.equal(normalizeSftpRemotePath(`folder${suffix}`), parent);
  assert.equal(sftpRemotePathFromEntryPath(`sftp://session${path}`), path);
  assert.equal(sftpParentRemotePath(path), parent);
  assert.equal(sftpParentRemotePath(`${parent}/`), "/");
}
assert.equal(normalizeSftpRemotePath(" report "), "/ report ");
