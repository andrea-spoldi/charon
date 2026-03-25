#!/bin/sh
set -eu

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

echo "Bumping version to ${VERSION}"

# package.json
sed -i"" -e "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json

# src-tauri/Cargo.toml (only the first occurrence under [package])
# macOS sed does not support 0,/pattern/ — use awk to replace only the first match
awk -v ver="$VERSION" '!done && /^version = ".*"/ { print "version = \"" ver "\""; done=1; next } { print }' src-tauri/Cargo.toml > src-tauri/Cargo.toml.tmp && mv src-tauri/Cargo.toml.tmp src-tauri/Cargo.toml

# src-tauri/tauri.conf.json
sed -i"" -e "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

echo "Version bumped to ${VERSION} in package.json, Cargo.toml, tauri.conf.json"
