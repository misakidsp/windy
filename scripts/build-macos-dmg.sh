#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="Windy"
VERSION="$(node -p "require('${ROOT_DIR}/package.json').version")"
HOST_ARCH="$(uname -m)"

case "${HOST_ARCH}" in
  arm64)
    TAURI_ARCH="aarch64"
    ;;
  x86_64)
    TAURI_ARCH="x64"
    ;;
  *)
    echo "Unsupported macOS architecture: ${HOST_ARCH}" >&2
    exit 1
    ;;
esac

APP_PATH="${ROOT_DIR}/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
BUNDLE_DIR="${ROOT_DIR}/src-tauri/target/release/bundle/dmg"
DMG_PATH="${BUNDLE_DIR}/${APP_NAME}_${VERSION}_${TAURI_ARCH}.dmg"
STAGE_DIR="$(mktemp -d "/private/tmp/windy-dmg-stage.XXXXXX")"

clean_bundle_xattrs() {
  local bundle_path="$1"
  xattr -crs "${bundle_path}"
  xattr -d com.apple.FinderInfo "${bundle_path}" 2>/dev/null || true
}

cleanup() {
  rm -rf "${STAGE_DIR}"
}
trap cleanup EXIT

cd "${ROOT_DIR}"

rm -rf "${APP_PATH}"
CI=true ./node_modules/.bin/tauri build --bundles app --ci

clean_bundle_xattrs "${APP_PATH}"
codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

mkdir -p "${BUNDLE_DIR}"
rm -f "${DMG_PATH}"
cp -R "${APP_PATH}" "${STAGE_DIR}/"
ln -s /Applications "${STAGE_DIR}/Applications"
clean_bundle_xattrs "${STAGE_DIR}/${APP_NAME}.app"

hdiutil create \
  -volname "${APP_NAME}" \
  -fs HFS+ \
  -srcfolder "${STAGE_DIR}" \
  -format UDZO \
  "${DMG_PATH}"

hdiutil verify "${DMG_PATH}"

echo "Created ${DMG_PATH}"
