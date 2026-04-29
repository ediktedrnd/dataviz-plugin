/**
 * Auth module — handles login, token caching, and auto-refresh.
 *
 * Credentials resolution (first match wins):
 *   1. Per-user credentials file (see credentialsPath below)
 *       - Windows: %APPDATA%\dataviz\credentials.json
 *       - macOS / Linux: ~/.config/dataviz/credentials.json
 *   2. DATAVIZ_EMAIL + DATAVIZ_PASSWORD env vars (dev / override)
 *
 * The URL is taken from the credentials file, else from DATAVIZ_URL env,
 * else defaults to production.
 *
 * Claude never sees the password — only this module touches it.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { dirname, join } from 'node:path';

function credentialsPath() {
  if (platform() === 'win32') {
    const base = process.env.APPDATA || join(homedir(), 'AppData', 'Roaming');
    return join(base, 'dataviz', 'credentials.json');
  }
  return join(homedir(), '.config', 'dataviz', 'credentials.json');
}

const CREDENTIALS_PATH = credentialsPath();
const DEFAULT_URL = 'https://dataviz.edikted.tech';
const TEMPLATE = {
  url: DEFAULT_URL,
  email: 'your-email@edikted.com',
  password: 'YOUR_PASSWORD',
};

function ensureTemplate() {
  if (existsSync(CREDENTIALS_PATH)) return false;
  try {
    mkdirSync(dirname(CREDENTIALS_PATH), { recursive: true });
    writeFileSync(CREDENTIALS_PATH, JSON.stringify(TEMPLATE, null, 2) + '\n', { mode: 0o600 });
    return true;
  } catch {
    return false;
  }
}

const SETUP_HINT = `Open ${CREDENTIALS_PATH} and replace "email" and "password" with your Dataviz login.`;

let cachedToken = null;
let tokenExpiry = 0;
let cachedConfig = null;

function loadFromFile() {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf8');
    const json = JSON.parse(raw);
    if (
      json.email && json.password &&
      json.email !== TEMPLATE.email && json.password !== TEMPLATE.password
    ) {
      return {
        url: (json.url || process.env.DATAVIZ_URL || DEFAULT_URL).replace(/\/$/, ''),
        email: json.email,
        password: json.password,
      };
    }
  } catch (e) {
    if (e.code !== 'ENOENT') {
      throw new Error(`Could not read ${CREDENTIALS_PATH}: ${e.message}. ${SETUP_HINT}`);
    }
  }
  return null;
}

function loadFromEnv() {
  const email = process.env.DATAVIZ_EMAIL;
  const password = process.env.DATAVIZ_PASSWORD;
  if (email && password) {
    return {
      url: (process.env.DATAVIZ_URL || DEFAULT_URL).replace(/\/$/, ''),
      email,
      password,
    };
  }
  return null;
}

function getConfig() {
  if (cachedConfig) return cachedConfig;
  // Env vars take precedence so Cowork's user_config injection wins.
  // Falls back to the per-user credentials file for Claude Code (which
  // does not substitute ${user_config.*} placeholders).
  const config = loadFromEnv() || loadFromFile();
  if (!config) {
    const created = ensureTemplate();
    const prefix = created
      ? `Created a credentials template at ${CREDENTIALS_PATH}.`
      : `No Dataviz credentials found at ${CREDENTIALS_PATH}.`;
    throw new Error(`${prefix} ${SETUP_HINT}`);
  }
  cachedConfig = config;
  return config;
}

export async function getToken() {
  if (cachedToken && Date.now() < tokenExpiry - 300_000) {
    return cachedToken;
  }

  const { url, email, password } = getConfig();
  const res = await fetch(`${url}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const status = res.status;
    let hint = '';
    if (status === 401) {
      hint = ` Your credentials in ${CREDENTIALS_PATH} may be wrong — open the file and update "email" / "password".`;
    }
    throw new Error(`Dataviz login failed (${status}): ${err.error || 'Unknown error'}.${hint}`);
  }

  const data = await res.json();
  cachedToken = data.token;
  tokenExpiry = Date.now() + 23 * 60 * 60 * 1000;
  return cachedToken;
}

export async function apiFetch(path, options = {}) {
  const { url } = getConfig();
  const token = await getToken();
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });
  return res;
}

export async function apiJson(path, options = {}) {
  const res = await apiFetch(path, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`API error ${res.status} on ${path}: ${data.error || JSON.stringify(data)}`);
  }
  return data;
}

export function getBaseUrl() {
  return getConfig().url;
}
