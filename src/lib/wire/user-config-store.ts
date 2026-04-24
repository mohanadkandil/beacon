/**
 * Per-user config — file-backed JSON store.
 *
 * Stores per-(userId, key) string values. Used to hold the user's destinations
 * for each connected tool — Slack channel, GitHub repo, Notion parent page,
 * etc. — so the demo doesn't need env vars set per agent.
 *
 * Path: <cwd>/.beacon-state/user-config.json
 *
 * Production swap: Postgres / D1, same surface.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

const STATE_DIR = path.join(process.cwd(), ".beacon-state");
const FILE = path.join(STATE_DIR, "user-config.json");

// Top-level map: userId -> { key -> value }
type Config = Record<string, Record<string, string>>;

const CACHE: Config = {};
let LOADED = false;
let LOADING: Promise<void> | null = null;

async function load(): Promise<void> {
  if (LOADED) return;
  if (LOADING) return LOADING;
  LOADING = (async () => {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      const parsed = JSON.parse(raw) as Config;
      for (const [uid, kv] of Object.entries(parsed)) {
        CACHE[uid] = { ...kv };
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") console.error("[user-config] load failed:", e.message);
    }
    LOADED = true;
    LOADING = null;
  })();
  return LOADING;
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const tmp = FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(CACHE, null, 2), "utf8");
    await fs.rename(tmp, FILE);
  } catch (err) {
    console.error("[user-config] persist failed:", (err as Error).message);
  }
}

/** Lookup order: per-user → env → default. Used by agents. */
export async function getUserConfig(
  userId: string,
  key: string,
  envFallback?: string,
  defaultValue?: string,
): Promise<string | undefined> {
  await load();
  const v = CACHE[userId]?.[key];
  if (v !== undefined && v !== "") return v;
  if (envFallback && process.env[envFallback]) return process.env[envFallback];
  return defaultValue;
}

export async function getAllUserConfig(userId: string): Promise<Record<string, string>> {
  await load();
  return { ...(CACHE[userId] ?? {}) };
}

export async function setUserConfig(userId: string, key: string, value: string): Promise<void> {
  await load();
  if (!CACHE[userId]) CACHE[userId] = {};
  if (value === "" || value === undefined) {
    delete CACHE[userId][key];
  } else {
    CACHE[userId][key] = value;
  }
  await persist();
}

/** Standardized config keys used by agents — keep this source of truth thin. */
export const CONFIG_KEYS = {
  slack: { channel: "slack.channel" },
  github: { repo: "github.repo" },
  notion: { parentPageId: "notion.parentPageId" },
  linear: { teamId: "linear.teamId" },
  gmail: { pitchTo: "gmail.pitchTo" },
} as const;
