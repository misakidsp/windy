import assert from "node:assert/strict";
import { buildLocationOptions } from "../src/routes/locationManagerModel";
import type { PaneState } from "../src/routes/types";

function pane(path: string): PaneState {
  return {
    id: "left",
    title: "left",
    source: { kind: "local", location: path, displayName: path },
    currentPath: path,
    entries: [],
    cursorKey: null,
    cursorIndex: 0,
    selectedKeys: new Set(),
    quickFilterQuery: "",
    quickFilterInputActive: false,
    showHiddenFiles: false,
    sortMode: "name",
    loading: false,
    error: null,
  };
}

const unixOptions = buildLocationOptions({
  activePane: pane("/work"),
  homePath: "/home/windy",
  localRoots: ["/"],
  localFavorites: [],
  searchProfiles: [],
  activeSftpSessions: [],
  sftpProfiles: [],
});
assert.deepEqual(unixOptions.slice(0, 3).map((option) => [option.label, option.path ?? ""]), [
  ["<Local>", ""],
  ["<Root>", "/"],
  ["<Home>", "/home/windy"],
]);

const windowsOptions = buildLocationOptions({
  activePane: pane("C:\\Users\\windy"),
  homePath: "C:\\Users\\windy",
  localRoots: ["C:\\", "D:\\"],
  localFavorites: [],
  searchProfiles: [],
  activeSftpSessions: [],
  sftpProfiles: [],
});
assert.deepEqual(windowsOptions.slice(0, 4).map((option) => [option.label, option.path ?? ""]), [
  ["<Local>", ""],
  ["<C:>", "C:\\"],
  ["<D:>", "D:\\"],
  ["<Home>", "C:\\Users\\windy"],
]);

const t = (id: string, values: Record<string, string | number> = {}) => {
  if (id === "location.option.local") return "<ローカル>";
  if (id === "location.option.localCurrent") return "現在のローカルsourceに留まります";
  if (id === "location.option.home") return "<ホーム>";
  if (id === "location.option.homeUnresolved") return "(ホーム未解決)";
  if (id === "location.option.newSftp") return "<新規SFTP接続>";
  if (id === "location.option.newSftpDetail") return "SFTPプロファイルの作成または接続テスト";
  if (id === "location.auth.privateKey") return "秘密鍵";
  if (id === "location.option.sftpProfileDetail") return `${values.username}@${values.host}:${values.port}${values.remotePath} (${values.authKind})`;
  return id;
};

const sftpOptions = buildLocationOptions({
  activePane: pane("/work"),
  homePath: "/home/windy",
  localRoots: [],
  localFavorites: [],
  searchProfiles: [],
  activeSftpSessions: [],
  sftpProfiles: [{
    id: "sftp-1",
    name: "Deploy",
    host: "example.com",
    port: 22,
    username: "windy",
    remotePath: "/var/www",
    authKind: "privateKey",
    privateKeyPath: "~/.ssh/id_ed25519",
  }],
}, t);
assert.equal(sftpOptions.find((option) => option.kind === "sftpProfile")?.detail, "windy@example.com:22/var/www (秘密鍵)");
