/**
 * Auth module — handles login, token caching, and auto-refresh.
 *
 * Credentials resolution (first match wins):
 *   1. ~/.config/dataviz/credentials.json  (standard per-user config)
 *   2. DATAVIZ_EMAIL + DATAVIZ_PASSWORD env vars (dev / override)
 *
 * The URL is taken from the credentials file, else from DATAVIZ_URL env,
 * else defaults to production.
 *
 * Claude never sees the password — only this module touches it.
 */
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const CREDENTIALS_PATH = join(homedir(), '.config', 'dataviz', 'credentials.json');
const DEFAULT_URL = 'https://dataviz.edikted.tech';
const SETUP_HINT =
  'Run the `dataviz-setup` skill (ask Claude: "setup dataviz credentials") to create it.';

let cachedToken = null;
let tokenExpiry = 0;
let cachedConfig = null;

function loadFromFile() {
  try {
    const raw = readFileSync(CREDENTIALS_PATH, 'utf8');
    const json = JSON.parse(raw);
    if (json.email && json.password) {
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
  const config = loadFromFile() || loadFromEnv();
  if (!config) {
    throw new Error(
      `No Dataviz credentials found at ${CREDENTIALS_PATH} and no DATAVIZ_EMAIL/DATAVIZ_PASSWORD env vars set. ${SETUP_HINT}`,
    );
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
      hint = ` Your credentials may be wrong — re-run \`dataviz-setup\` to update them.`;
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
