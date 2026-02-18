#!/bin/bash
# fix-quarantine.sh — Remove macOS quarantine flag from Charon.app
#
# macOS Gatekeeper blocks unsigned apps downloaded from the internet.
# Run this script after installing Charon to /Applications.
#
# Usage:
#   chmod +x fix-quarantine.sh && ./fix-quarantine.sh
#
# Or manually:
#   xattr -cr /Applications/Charon.app

set -euo pipefail

APP_PATH="/Applications/Charon.app"

if [ ! -d "$APP_PATH" ]; then
    echo "❌ Charon.app not found at $APP_PATH"
    echo "   Install Charon first by dragging it to Applications."
    exit 1
fi

echo "🔧 Removing quarantine flag from Charon.app..."
xattr -cr "$APP_PATH"
echo "✅ Done! You can now open Charon normally."
