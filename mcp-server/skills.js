/**
 * Skills loader — exposes the repo's skills/<name>/SKILL.md files as
 * MCP prompts so remote clients (Claude Desktop, claude.ai) get the
 * same skill experience as a locally-installed plugin.
 *
 * Skill frontmatter shape (YAML-lite, lines we care about):
 *
 *   ---
 *   name: optional-explicit-name        # falls back to directory name
 *   description: required short blurb
 *   argument-hint: optional argument hint (single string arg)
 *   ---
 *   <markdown body that becomes the prompt content>
 *
 * Skills are loaded once at startup. The server lists them via
 * prompts/list and returns the body via prompts/get.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// `skills/` lives one level up from `mcp-server/`. SKILLS_DIR can be
// overridden in tests / non-standard layouts via env.
const DEFAULT_SKILLS_DIR = resolve(here, '..', 'skills');
const SKILLS_DIR = process.env.SKILLS_DIR
  ? resolve(process.env.SKILLS_DIR)
  : DEFAULT_SKILLS_DIR;

/** Parse minimal `--- key: value ---` frontmatter. Returns { meta, body }. */
function parseFrontmatter(raw) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(line);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  return { meta, body: match[2] };
}

function safeReadDir(dir) {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

let cached = null;

/**
 * Walk the skills directory once, return a Map keyed by skill name.
 * Each entry: { name, description, argumentHint, body, dir }.
 */
export function loadSkills() {
  if (cached) return cached;
  const result = new Map();

  for (const entry of safeReadDir(SKILLS_DIR)) {
    const dir = join(SKILLS_DIR, entry);
    let isDir = false;
    try { isDir = statSync(dir).isDirectory(); } catch { /* ignore */ }
    if (!isDir) continue;

    const skillPath = join(dir, 'SKILL.md');
    let raw;
    try {
      raw = readFileSync(skillPath, 'utf8');
    } catch {
      continue; // not a skill dir
    }

    const { meta, body } = parseFrontmatter(raw);
    const name = meta.name || entry;
    if (!meta.description) {
      console.error(`[dataviz-mcp] Skill ${name} has no description; skipping`);
      continue;
    }

    result.set(name, {
      name,
      description: meta.description,
      argumentHint: meta['argument-hint'] || null,
      body: body.trim(),
      dir: entry, // directory name (may differ from name)
    });
  }

  cached = result;
  console.error(`[dataviz-mcp] Loaded ${result.size} skills from ${SKILLS_DIR}`);
  return result;
}

/** MCP prompts/list payload. */
export function listPrompts() {
  const skills = loadSkills();
  return {
    prompts: Array.from(skills.values()).map((s) => ({
      name: s.name,
      description: s.description,
      arguments: s.argumentHint
        ? [
            {
              name: 'topic',
              description: s.argumentHint,
              required: false,
            },
          ]
        : [],
    })),
  };
}

/** MCP prompts/get payload for a given skill. */
export function getPrompt(name, args) {
  const skills = loadSkills();
  const skill = skills.get(name);
  if (!skill) {
    const err = new Error(`Unknown prompt: ${name}`);
    err.code = -32602; // InvalidParams
    throw err;
  }

  const topic = args?.topic;
  const userText = topic
    ? `${skill.body}\n\n---\n\n**Topic:** ${topic}`
    : skill.body;

  return {
    description: skill.description,
    messages: [
      {
        role: 'user',
        content: { type: 'text', text: userText },
      },
    ],
  };
}
