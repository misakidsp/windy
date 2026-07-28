import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { translateMessage } from "../src/routes/localization";
import { operationResultItemMessage, operationResultStatus, operationResultTerminalLines } from "../src/routes/operationResultModel";
import type { LanguageSettings } from "../src/routes/types";

const result = {
  succeeded: Array.from({ length: 12 }, (_, index) => ({
    path: `/dest/${index}.txt`,
    message: "copied",
  })),
  failed: [{ path: "", message: "blocked" }],
};

assert.equal(operationResultStatus("Copy", result), "Copy: 12 succeeded / 1 failed");
assert.deepEqual(operationResultTerminalLines("Copy", result).slice(0, 3), [
  "",
  "[failed] -: blocked",
  "[ok] /dest/0.txt: copied",
]);
assert.equal(operationResultTerminalLines("Copy", result).at(-2), "[ok] ...and 2 more");
assert.equal(operationResultTerminalLines("Copy", { ...result, canceled: true }).at(-1), "[operation] Copy canceled: 12 succeeded / 1 failed");

const t = (id: string, values: Record<string, string | number> = {}) => {
  if (id === "operation.resultMessage.refreshCompleted") return "更新が完了しました。";
  if (id === "operation.resultMessage.copiedTo") return `コピー先: ${values.destination}`;
  return id;
};

assert.equal(operationResultItemMessage({ path: "", message: "Refresh completed." }, t), "更新が完了しました。");
assert.equal(operationResultItemMessage({ path: "", message: "Copied to '/tmp/example'." }, t), "コピー先: /tmp/example");

const japaneseSettings = JSON.parse(readFileSync("docs/examples/language.ja.json", "utf8")) as LanguageSettings;
const ja = (id: string, values: Record<string, string | number> = {}) => translateMessage(japaneseSettings, id, values);

assert.equal(
  operationResultItemMessage({ path: "", message: "Failed to create file '/tmp/example.txt': denied" }, ja),
  "'/tmp/example.txt' のファイル作成に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Rename SFTP entry failed for '/remote/old.txt': denied" }, ja),
  "'/remote/old.txt' のSFTPエントリのリネームに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read archive failed: corrupt" }, ja),
  "アーカイブ読み込みに失敗しました: corrupt",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Move to Trash failed for C:\\Users\\me\\a.txt: denied" }, ja),
  "'C:\\Users\\me\\a.txt' のゴミ箱への移動に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Run git status failed: not a repository" }, ja),
  "git status実行に失敗しました: not a repository",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Open PTY failed: unavailable" }, ja),
  "PTYを開く処理に失敗しました: unavailable",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Invalid name regex: unclosed group" }, ja),
  "name regexが不正です: unclosed group",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SFTP host is required." }, ja),
  "SFTP hostが必要です。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SFTP connection is not available: session-1" }, ja),
  "SFTP接続を利用できません: session-1",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive links are not allowed for extraction." }, ja),
  "アーカイブ内のリンクは展開できません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Unsupported image extension: .webp" }, ja),
  "未対応の画像拡張子です: .webp",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Create SSH session failed: handshake unavailable" }, ja),
  "SSH session作成に失敗しました: handshake unavailable",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SFTP connection state is unavailable." }, ja),
  "SFTP接続状態を利用できません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Terminal state lock poisoned." }, ja),
  "ターミナル状態ロックが破損しています。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Uploading symlinks to SFTP is not implemented yet." }, ja),
  "SFTPへのsymlinkアップロードはまだ未実装です。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "left path does not exist: /tmp/missing" }, ja),
  "left pathが存在しません: /tmp/missing",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Terminal cwd is not a directory: '/tmp/file.txt'" }, ja),
  "ターミナルcwdはディレクトリではありません: '/tmp/file.txt'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "External command name is required: demo" }, ja),
  "外部コマンド名が必要です: demo",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Safe Mode startup failed: denied" }, ja),
  "Safe Mode起動に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "test private key authentication failed: denied" }, ja),
  "test private key認証に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SSH host key mismatch for example.com:22. Check /home/me/.ssh/known_hosts before connecting." }, ja),
  "example.com:22 のSSH host keyが一致しません。接続前に /home/me/.ssh/known_hosts を確認してください。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read SSH known_hosts failed (/home/me/.ssh/known_hosts): denied" }, ja),
  "SSH known_hostsの読み込みに失敗しました (/home/me/.ssh/known_hosts): denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Failed to read directory entry: denied" }, ja),
  "ディレクトリエントリの読み込みに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Detailed diff task failed: canceled" }, ja),
  "詳細差分タスクに失敗しました: canceled",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive creation canceled." }, ja),
  "アーカイブ作成をキャンセルしました。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Detailed diff canceled." }, ja),
  "詳細差分をキャンセルしました。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Text editor is not configured. Register it from Settings > Text Editor." }, ja),
  "テキストエディタが未設定です。Settings > Text Editorから登録してください。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Text editor target must be a local file: /tmp/demo" }, ja),
  "テキストエディタで開ける対象はローカルファイルのみです: /tmp/demo",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Path must resolve to a local absolute path: ../demo" }, ja),
  "パスはローカルの絶対パスとして解決できる必要があります: ../demo",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Create SSH known_hosts directory failed (/home/me/.ssh): denied" }, ja),
  "SSH known_hostsディレクトリの作成に失敗しました (/home/me/.ssh): denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Write SSH known_hosts failed (/home/me/.ssh/known_hosts): denied" }, ja),
  "SSH known_hostsの書き込みに失敗しました (/home/me/.ssh/known_hosts): denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Connect to SFTP host failed for example.com:22. Tried: 192.0.2.1:22 (timeout)" }, ja),
  "SFTP hostへの接続に失敗しました example.com:22。試行: 192.0.2.1:22 (timeout)",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Temporary archive already exists: '/tmp/archive.zip.part'" }, ja),
  "一時アーカイブがすでに存在します: '/tmp/archive.zip.part'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SFTP part file already exists: '/remote/file.txt.part'" }, ja),
  "SFTP一時ファイルがすでに存在します: '/remote/file.txt.part'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive entry was not found: '/tmp/archive.zip::/docs/readme.txt'" }, ja),
  "アーカイブエントリが見つかりません: '/tmp/archive.zip::/docs/readme.txt'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive destination has no parent: '/tmp/archive.zip'" }, ja),
  "アーカイブdestinationに親ディレクトリがありません: '/tmp/archive.zip'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive destination parent cannot be resolved: '/tmp/missing'" }, ja),
  "アーカイブdestinationの親ディレクトリを解決できません: '/tmp/missing'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Failed to resolve archive destination parent '/tmp/missing': denied" }, ja),
  "'/tmp/missing' のアーカイブdestination親ディレクトリ解決に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Extracted destination already exists: '/tmp/readme.txt'" }, ja),
  "展開先がすでに存在します: '/tmp/readme.txt'",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Home directory could not be resolved for known_hosts." }, ja),
  "known_hosts用のホームディレクトリを解決できません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Config directory could not be resolved." }, ja),
  "設定ディレクトリを解決できません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Destination path is not set." }, ja),
  "destination pathが設定されていません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Name is not set." }, ja),
  "nameが設定されていません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Mode is not set." }, ja),
  "modeが設定されていません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Windows attribute expression is not set." }, ja),
  "Windows attribute expressionが設定されていません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive entry has no file name." }, ja),
  "アーカイブエントリにファイル名がありません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Search root is not a directory: /tmp/missing" }, ja),
  "検索rootはディレクトリではありません: /tmp/missing",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Local favorite path is not a directory: /tmp/file.txt" }, ja),
  "ローカルfavorite pathはディレクトリではありません: /tmp/file.txt",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Git root could not be resolved for /tmp." }, ja),
  "/tmp のGit rootを解決できません。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "git status failed." }, ja),
  "git statusに失敗しました。",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "git rev-parse failed: not a git repository" }, ja),
  "git rev-parseに失敗しました: not a git repository",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Change SFTP mode failed for '/remote/file.txt': denied" }, ja),
  "'/remote/file.txt' のSFTP mode変更に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Create SFTP file failed: denied" }, ja),
  "SFTPファイル作成に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read SFTP metadata failed for '/remote/file.txt': denied" }, ja),
  "'/remote/file.txt' のSFTP metadata読み込みに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read SFTP directory failed for '/remote/docs': denied" }, ja),
  "'/remote/docs' のSFTPディレクトリ読み込みに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Write SFTP file failed for '/remote/file.txt.part': denied" }, ja),
  "'/remote/file.txt.part' のSFTPファイル書き込みに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Open SFTP file failed for '/remote/file.txt': denied" }, ja),
  "'/remote/file.txt' のSFTPファイルを開く処理に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Finalize SFTP part file failed for '/remote/file.txt.part': denied" }, ja),
  "'/remote/file.txt.part' のSFTP一時ファイル確定に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Remove SFTP directory failed for '/remote/docs': denied" }, ja),
  "'/remote/docs' のSFTPディレクトリ削除に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Move to Trash failed for '/tmp/file.txt': denied" }, ja),
  "'/tmp/file.txt' のゴミ箱への移動に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read archive entry bytes failed: corrupt" }, ja),
  "アーカイブエントリ内容の読み込みに失敗しました: corrupt",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Add zip file failed for '/tmp/source.txt': denied" }, ja),
  "'/tmp/source.txt' のzipファイル追加に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Finish tar.gz archive failed: denied" }, ja),
  "tar.gzアーカイブ確定に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Open PTY failed: unavailable" }, ja),
  "PTYを開く処理に失敗しました: unavailable",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Image reader task failed: unsupported" }, ja),
  "画像readerタスクに失敗しました: unsupported",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Archive image reader task failed: unsupported" }, ja),
  "アーカイブ画像readerタスクに失敗しました: unsupported",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Clone PTY reader failed: unavailable" }, ja),
  "PTY readerの複製に失敗しました: unavailable",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Resize terminal failed: unavailable" }, ja),
  "ターミナルresizeに失敗しました: unavailable",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SFTP connection task failed: timeout" }, ja),
  "SFTP接続タスクに失敗しました: timeout",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "SSH handshake failed: refused" }, ja),
  "SSH handshakeに失敗しました: refused",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Set SFTP read timeout failed: denied" }, ja),
  "SFTP read timeout設定に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Create SSH session failed: denied" }, ja),
  "SSH session作成に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Read SFTP directory failed: denied" }, ja),
  "SFTPディレクトリ読み込みに失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Parse location profiles failed: invalid json" }, ja),
  "location profilesの解析に失敗しました: invalid json",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Serialize external commands failed: denied" }, ja),
  "外部コマンド設定の保存形式化に失敗しました: denied",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Parse Japanese language preset failed: invalid json" }, ja),
  "Japanese language presetの解析に失敗しました: invalid json",
);
assert.equal(
  operationResultItemMessage({ path: "", message: "Serialize appearance settings failed: denied" }, ja),
  "appearance settingsの保存形式化に失敗しました: denied",
);
