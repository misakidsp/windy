# ユーザーガイド

[English](USER_GUIDE.md)

Windy は、キーボード操作を中心にした左右2ペイン型のファイルマネージャーです。

画面の中心には2つのファイルペインがあります。下部にはターミナルペインがあり、選択中のパスを挿入したり、アプリを離れずにコマンドライン作業を行ったりできます。

ファイルペイン操作はキーボード中心です。マウス操作中心のファイル操作は対象外ですが、Preferences/settings UIでは、カラーピッカーなどのフォーム操作にマウスを使えます。

## ナビゲーション

| キー | 操作 |
| --- | --- |
| `up` / `down` または `k` / `j` | カーソル移動 |
| `left` / `right` または `h` / `l` | ペイン移動または親ディレクトリへ移動 |
| `enter` | フォーカス中のディレクトリまたはファイルを開く |
| `shift+enter` | OS既定アプリで開く |
| `space` | フォーカス項目のマーク切り替え |
| `ctrl+r` | 現在のペインを再読み込み |
| `?` | キーヘルプを表示 |

左右キーは、内向きのキーで反対ペインへ移動し、外向きのキーで親ディレクトリへ移動します。

## ファイル操作

多くの操作はマーク済み項目を対象にします。何もマークされていない場合は、フォーカス中の項目を対象にします。

| キー | 操作 |
| --- | --- |
| `c` | 反対ペインへコピー |
| `m` | 反対ペインへ移動 |
| `r` | リネーム |
| `e` | フォーカス中のローカルファイルを設定済みテキストエディタで編集 |
| `d` / `delete` | 削除 |
| `shift+delete` | 完全削除 |
| `n d` | フォルダ作成 |
| `n f` | 空ファイル作成 |
| `u` | 選択したアーカイブを展開 |
| `a` | 権限または属性を変更 |

ローカルファイルの削除は、対応しているOSではゴミ箱を使います。完全削除とSFTP上の削除はゴミ箱を使いません。

`e` は常にフォーカス中の1ファイルだけを対象にします。マーク済みファイルは対象にしません。local、search、diff、operation result、Git statusなど、ローカル通常ファイルとして解決できる項目で使えます。SFTP項目やアーカイブ内項目は直接編集しません。

## ビューア

`enter` で対応ファイルを Windy の内蔵ビューアで開きます。

対応しているビューア:

- テキストファイル
- 一般的な画像ファイル
- 対応アーカイブ内のファイル

内蔵ビューアで開けないファイルは、`shift+enter` でOS既定アプリから開けます。

内蔵ビューアでローカルファイルを表示している場合、`e` でそのファイルを設定済みテキストエディタで開けます。

## アーカイブ

Windy は以下のアーカイブ形式を仮想ディレクトリとして閲覧できます。

- ZIP
- TAR
- TAR.GZ
- TGZ

アーカイブ内では、`c` で選択項目を反対側のローカルペインへ展開します。`u` では選択したアーカイブを新しいディレクトリへ展開します。

## 検索とフィルタ

| キー | 操作 |
| --- | --- |
| `/` | 現在のペインでクイックフィルタ |
| `ctrl+f` | ローカル詳細検索を開く |
| `s` | ソート切り替え |
| `.` | 隠しファイル表示切り替え |

詳細検索は検索結果ペインを作成します。検索結果の項目は、対応している範囲で通常のローカル項目と同じように開いたりコピーしたりできます。

## 差分とGit

| キー | 操作 |
| --- | --- |
| `, d` | 現在の左右ペインの項目を比較 |
| `, c` | ローカルペインを再帰的にMD5付きで比較 |
| `, g` | 現在のローカルペインのGit変更ファイルを開く |

Git status は変更ファイルの一覧ペインを作成します。差分Sourceは読み取り専用の比較ビューです。

## Location Manager

`ctrl+n` で Location Manager を開きます。

Location Manager では以下を切り替えられます。

- ローカル場所
- 保存済みローカルお気に入り
- 保存済み検索プロファイル
- 保存済みSFTPプロファイル
- 新規SFTP接続フォーム

`enter` で選択した場所を開きます。`esc` で閉じます。

## SFTP

Windy は基本的なSFTP閲覧とローカル/SFTP間の転送に対応しています。

Location Manager でSFTPプロファイルを作成または選択します。プロファイルには、host、port、user、初期パス、認証方式を保存できます。パスワードや鍵パスフレーズは長期保存する前提ではありません。

SFTPペインでの操作:

| キー | 操作 |
| --- | --- |
| `enter` | リモートディレクトリを開く |
| `c` | SFTPとローカルペイン間でコピー |
| `r` | リモート項目をリネーム |
| `d` | リモート項目を完全削除 |
| `n d` | リモートフォルダ作成 |
| `n f` | リモート空ファイル作成 |
| `x` | ターミナルペインでSSHセッションを開く |

Windy は OpenSSH 互換の `known_hosts` 検証を使います。host key が変わった場合、Windy は接続を拒否します。接続先を確認したうえで、必要に応じてユーザー自身で `known_hosts` を更新してください。

## ターミナル

`x` で下部ターミナルペインへフォーカスを移動します。`ctrl+x` で下部ターミナルペインからファイルペインへ戻ります。

パスコピーとターミナル連携:

| キー | 操作 |
| --- | --- |
| `y y` | 選択中のローカルパスをコピー |
| `y p` | 現在のローカルディレクトリパスをコピー |
| `y n` | 選択中のローカルファイル名をコピー |
| `ctrl+shift+y` | 選択中のローカルパスをターミナルへ挿入 |
| `:` または `, x` | 登録済み外部コマンドを開く |

## Preferences

設定画面はアプリケーションメニューから開きます。

- macOS: `Windy > Preferences...`
- Windows/Linux: `Settings > Preferences...`

設定画面では以下を変更できます。

- `e` で使う標準テキストエディタ
- キーバインド
- ファイルペインのフォントサイズとUIカラー
- カラーピッカー付きの拡張子カラー
- 言語ファイルプリセット
- 設定リセット
- Safe Mode

`Language File` メニューから、同梱プリセットの `English`、`Japanese`、`Quenya Latin` を `settings/language.json` に適用できます。

Safe Modeは、現在の主要設定を退避して、general、appearance、keybinding、language設定を初期値で再生成します。設定画面から手動で入れるほか、起動時に `WINDY_SAFE_MODE=1` を指定するか、実行ファイルへ `--safe-mode` を渡して起動できます。

## 設定ファイル

Windy は、OSごとのアプリ設定ディレクトリにユーザー設定を保存します。具体的な場所はプラットフォームによって異なります。

代表的な保存先は以下です。

- macOS: `~/Library/Application Support/windy`
- Windows: `%APPDATA%\windy`
- Linux: `$XDG_CONFIG_HOME/windy` または `~/.config/windy`

Windy は必要になったタイミングで設定ファイルを作成します。主なファイルは以下です。

| ファイル | 用途 |
| --- | --- |
| `commands.json` | 登録済み外部コマンドテンプレート |
| `locations.json` | ローカルお気に入り、保存済み検索、SFTPプロファイル |
| `operation-failures.log` | ファイル操作失敗時の任意ログ |
| `settings/operation.json` | 削除挙動、操作結果表示、キャンセル挙動 |
| `settings/sftp.json` | SFTPセッションと転送挙動 |
| `settings/appearance.json` | フォント、UIカラー、拡張子カラー |
| `settings/keybind.json` | 編集可能なキーバインド |
| `settings/language.json` | UIメッセージ上書きとlocale |

`settings/operation.json` の例:

```json
{
  "useTrash": true,
  "operationResult": {
    "showStatus": true,
    "showFailureDialog": true,
    "printToTerminal": false,
    "saveFailureLog": true
  },
  "operationCancel": {
    "doubleEscEnabled": true,
    "doubleEscWindowMs": 700
  },
  "externalEditor": {
    "command": "",
    "args": []
  }
}
```

`externalEditor` は `e` で起動するテキストエディタ設定です。`command` は実行ファイル名または実行ファイルパス、`args` は1引数1要素の配列です。`args` のいずれかに `{path}` を含めると、Windyはその場所へ対象ファイルパスを差し込みます。`{path}` がない場合は、最後の引数として対象ファイルパスを追加します。

例:

```json
{
  "externalEditor": {
    "command": "code",
    "args": ["--reuse-window", "{path}"]
  }
}
```

macOSでアプリ名を指定して開く場合は、次のような設定もできます。

```json
{
  "externalEditor": {
    "command": "open",
    "args": ["-a", "CotEditor", "{path}"]
  }
}
```

`settings/sftp.json` の例:

```json
{
  "sftpSession": {
    "lifecycle": "keepRecent",
    "maxSessions": 2,
    "idleDisconnectMinutes": 0
  },
  "sftpTransfer": {
    "partFileThresholdBytes": 1048576
  }
}
```

`settings/appearance.json` の一部例:

```json
{
  "schemaVersion": 1,
  "fonts": {
    "uiFamily": "UDEV Gothic",
    "terminalFamily": "UDEV Gothic",
    "uiSize": 12,
    "terminalSize": 12,
    "viewerSize": 12
  },
  "extensionColors": {
    ".md": "#f9d65c",
    ".rs": "#fb923c",
    ".ts": "#7dd3fc"
  }
}
```

`commands.json` の例:

```json
{
  "commands": [
    {
      "id": "echo-selected-paths",
      "name": "Echo selected paths",
      "description": "Print selected local paths in the terminal.",
      "template": "printf '%s\\n' {args}",
      "returnFocus": false
    }
  ]
}
```

外部コマンドでよく使うプレースホルダ:

| プレースホルダ | 意味 |
| --- | --- |
| `{args}` | 選択中のローカルパス。コマンド引数としてshell quoteされる |
| `{cwd}` | アクティブペインの現在のローカルディレクトリ |
| `{otherCwd}` | 反対ペインの現在のローカルディレクトリ |
| `{names}` | 選択中のファイル名 |
| `{first}` | 最初の選択ローカルパス |
| `{marked}` | アクティブペインのマーク済みローカルパス |
| `{otherMarked}` | 反対ペインのマーク済みローカルパス |

初回生成されるサンプル外部コマンドは、安全側の内容に限定されています。手動で設定ファイルを編集する場合は、Windyを閉じてから編集するか、編集後に該当画面を再読み込みしてください。
