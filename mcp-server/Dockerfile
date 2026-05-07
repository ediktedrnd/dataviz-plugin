# syntax=docker/dockerfile:1.6
#
# Dataviz MCP server — remote HTTP transport for ECS Fargate (linux/arm64).
#
# Layout inside the image mirrors the source repo so the relative path
# math in skills.js / resources.js (which walks ../skills, ../context)
# works without environment overrides:
#
#   /app/
#     ├── mcp-server/            ← Node app (entrypoint http.js)
#     │   ├── http.js, server.js, etc.
#     │   └── node_modules/
#     ├── skills/                ← exposed as MCP prompts
#     ├── context/               ← exposed as MCP resources
#     └── CLAUDE.md              ← server instructions
#
# Build context expected: REPO ROOT (not mcp-server/). The repo's
# .dockerignore strips local-distribution artifacts that don't ship.

FROM node:22-alpine AS deps
WORKDIR /app/mcp-server
COPY mcp-server/package.json mcp-server/package-lock.json* ./
# Using `npm install --omit=dev` (not `npm ci`) so the build works while
# the lockfile is out of sync with the new express+jose deps. Switch back
# to `npm ci` once a synced package-lock.json is committed.
RUN npm install --omit=dev --no-audit --no-fund

FROM node:22-alpine AS runtime
WORKDIR /app

RUN apk add --no-cache curl tini

ENV NODE_ENV=production
ENV PORT=3000
ENV NODE_OPTIONS=--enable-source-maps

# Server runtime
COPY mcp-server/ ./mcp-server/
COPY --from=deps /app/mcp-server/node_modules ./mcp-server/node_modules

# Plugin assets exposed via MCP
#   - skills/                          → prompts   (skills.js)
#   - context/                         → resources (resources.js)
#   - mcp-server/REMOTE_INSTRUCTIONS.md → already inside ./mcp-server/ above
#                                         (used by server.js for the
#                                         InitializeResult `instructions`
#                                         field). The repo-root CLAUDE.md
#                                         is intentionally NOT shipped — it
#                                         contains local-install setup
#                                         guidance (credentials.json) that
#                                         doesn't apply to remote OAuth users.
COPY skills/ ./skills/
COPY context/ ./context/

USER node
WORKDIR /app/mcp-server

EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "http.js"]
