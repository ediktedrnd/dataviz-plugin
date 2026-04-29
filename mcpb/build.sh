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
(cd "$BUILD" && zip -rq "$OUT" manifest.json server)

echo "[mcpb] built: $OUT ($(du -h "$OUT" | cut -f1))"
