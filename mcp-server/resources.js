/**
 * Resources loader — exposes the repo's markdown context as MCP resources.
 *
 * Three roots:
 *   1. context/                         — top-level domain reference
 *      → URIs like dataviz://context/data-sources.md
 *
 *   2. skills/<skill>/SKILL.md          — per-skill instructions (top-level
 *      operating guidance for analysts; e.g. agent-report, upload-report)
 *      → URIs like dataviz://skill/<skill>/SKILL.md
 *
 *   3. skills/<skill>/context/...       — per-skill drill-down (e.g. edikted-ba)
 *      → URIs like dataviz://skill/<skill>/context/<path>
 *
 * The LLM can fetch these on demand via resources/read once it sees the
 * URIs in resources/list. Skill markdown can reference these URIs and the
 * client knows where to fetch.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, '..');
const TOP_CONTEXT_DIR = resolve(REPO_ROOT, 'context');
const SKILLS_DIR = process.env.SKILLS_DIR
  ? resolve(process.env.SKILLS_DIR)
  : resolve(REPO_ROOT, 'skills');

const URI_PREFIX = 'dataviz://';

/** Recursive walk; returns absolute file paths matching predicate. */
function walk(dir, predicate) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) {
      out.push(...walk(full, predicate));
    } else if (predicate(full)) {
      out.push(full);
    }
  }
  return out;
}

const isMarkdown = (p) => p.endsWith('.md');

let cached = null;

/**
 * Build the resource registry. Returns a Map: uri → { uri, name, description, path, mimeType }.
 */
export function loadResources() {
  if (cached) return cached;
  const result = new Map();

  // 1. Top-level context/
  for (const file of walk(TOP_CONTEXT_DIR, isMarkdown)) {
    const rel = relative(TOP_CONTEXT_DIR, file);
    const uri = `${URI_PREFIX}context/${rel}`;
    result.set(uri, {
      uri,
      name: `context/${rel}`,
      description: firstHeadingOf(file) || rel,
      path: file,
      mimeType: 'text/markdown',
    });
  }

  // 2. skills/<skill>/SKILL.md  +  3. skills/<skill>/context/...
  let skillEntries = [];
  try { skillEntries = readdirSync(SKILLS_DIR); } catch { /* none */ }
  for (const skill of skillEntries) {
    // 2a. Per-skill SKILL.md (top-level operating instructions)
    const skillFile = join(SKILLS_DIR, skill, 'SKILL.md');
    try {
      if (statSync(skillFile).isFile()) {
        const uri = `${URI_PREFIX}skill/${skill}/SKILL.md`;
        result.set(uri, {
          uri,
          name: `skill/${skill}/SKILL.md`,
          description: firstHeadingOf(skillFile) || `${skill}: SKILL.md`,
          path: skillFile,
          mimeType: 'text/markdown',
        });
      }
    } catch { /* no SKILL.md for this skill */ }

    // 2b. Per-skill context/ drill-down
    const skillContextDir = join(SKILLS_DIR, skill, 'context');
    let isDir = false;
    try { isDir = statSync(skillContextDir).isDirectory(); } catch { /* none */ }
    if (!isDir) continue;
    for (const file of walk(skillContextDir, isMarkdown)) {
      const rel = relative(skillContextDir, file);
      const uri = `${URI_PREFIX}skill/${skill}/context/${rel}`;
      result.set(uri, {
        uri,
        name: `skill/${skill}/context/${rel}`,
        description: firstHeadingOf(file) || `${skill}: ${rel}`,
        path: file,
        mimeType: 'text/markdown',
      });
    }
  }

  cached = result;
  console.error(`[dataviz-mcp] Loaded ${result.size} resources`);
  return result;
}

function firstHeadingOf(file) {
  try {
    const raw = readFileSync(file, 'utf8');
    const m = /^#\s+(.+?)\s*$/m.exec(raw);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** MCP resources/list payload. */
export function listResources() {
  const all = loadResources();
  return {
    resources: Array.from(all.values()).map(({ uri, name, description, mimeType }) => ({
      uri,
      name,
      description,
      mimeType,
    })),
  };
}

/** MCP resources/read payload. */
export function readResource(uri) {
  const all = loadResources();
  const entry = all.get(uri);
  if (!entry) {
    const err = new Error(`Unknown resource: ${uri}`);
    err.code = -32602;
    throw err;
  }
  let text;
  try {
    text = readFileSync(entry.path, 'utf8');
  } catch (e) {
    const err = new Error(`Could not read resource ${uri}: ${e.message}`);
    err.code = -32603;
    throw err;
  }
  return {
    contents: [
      {
        uri: entry.uri,
        mimeType: entry.mimeType,
        text,
      },
    ],
  };
}
