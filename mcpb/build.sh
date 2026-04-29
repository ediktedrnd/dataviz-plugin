#!/usr/bin/env bash
# Build dataviz-toolkit.mcpb — a portable MCP bundle for Claude Desktop / Cowork.
# Produces ./dist/dataviz-toolkit-<version>.mcpb with node_modules baked in.
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
BUILD="$HERE/build"
DIST="$HERE/dist"
VERSION="$(cd "$HERE" && node -p "require('./manifest.json').version")"
OUT="$DIST/dataviz-toolkit-$VERSION.mcpb"

rm -rf "$BUILD"
mkdir -p "$BUILD/server" "$DIST"

cp "$HERE/manifest.json" "$BUILD/manifest.json"
cp "$ROOT/mcp-server/index.js" "$BUILD/server/index.js"
cp "$ROOT/mcp-server/auth.js"  "$BUILD/server/auth.js"
cp "$ROOT/mcp-server/tools.js" "$BUILD/server/tools.js"
cp "$ROOT/mcp-server/package.json" "$BUILD/server/package.json"

echo "[mcpb] installing production deps…"
(cd "$BUILD/server" && npm install --omit=dev --no-audit --no-fund --loglevel=error)

echo "[mcpb] zipping → $OUT"
rm -f "$OUT"
if command -v zip >/dev/null 2>&1; then
  (cd "$BUILD" && zip -rq "$OUT" manifest.json server)
elif command -v powershell.exe >/dev/null 2>&1; then
  # Windows fallback when `zip` is not installed in Git Bash / WSL.
  WIN_BUILD="$(cygpath -w "$BUILD")"
  WIN_OUT="$(cygpath -w "$OUT")"
  powershell.exe -NoProfile -Command \
    "Add-Type -AssemblyName System.IO.Compression.FileSystem; [System.IO.Compression.ZipFile]::CreateFromDirectory('$WIN_BUILD', '$WIN_OUT')"
else
  echo "[mcpb] no zip tool available — install \`zip\` or run on a host with powershell.exe" >&2
  exit 1
fi

echo "[mcpb] built: $OUT ($(du -h "$OUT" | cut -f1))"
