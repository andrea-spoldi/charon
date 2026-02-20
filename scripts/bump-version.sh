#!/usr/bin/env bash
set -euo pipefail

VERSION="$1"

if [ -z "$VERSION" ]; then
  echo "Usage: $0 <version>" >&2
  exit 1
fi

echo "Bumping version to ${VERSION}"

# package.json
sed -i"" -e "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" package.json

# src-tauri/Cargo.toml (only the first occurrence under [package])
sed -i"" -e "0,/^version = \".*\"/s//version = \"${VERSION}\"/" src-tauri/Cargo.toml

# src-tauri/tauri.conf.json
sed -i"" -e "s/\"version\": \".*\"/\"version\": \"${VERSION}\"/" src-tauri/tauri.conf.json

echo "Version bumped to ${VERSION} in package.json, Cargo.toml, tauri.conf.json"
