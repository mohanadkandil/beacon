/**
 * Run history — file-backed JSON store, scoped per userId.
 *
 * Why file-backed: on Vercel each invocation is a fresh process, so a plain
 * in-memory array would drop every run between requests. Writes go to
 * YAPPR_DATA_DIR (set to /tmp/yappr-state on Vercel) so they persist for
 * the warm life of the function instance.
 *
 * Why scoped per-user: different visitors should see their own runs, not
 * everyone's. ownerId comes from the browser-generated yappr.userId.
 *
 * Production swap: Postgres. Same surface.
 */

import { promises as fs } from "node:fs";
import path from "node:path";

export type RunStatus = "running" | "success" | "failed" | "no-op";

export type Run = {
  id: string;
  recipeId: string;
  recipeName: string;
  recipeEmoji?: string;
  startedAt: string;
  endedAt?: string;
  status: RunStatus;
  message: string;
  artifactUrl?: string;
  artifactLabel?: string;
  trace?: string[];
  error?: string;
  /** Browser user id that triggered the run. Anonymous (system) runs use "system". */
  ownerId?: string;
};

const STATE_DIR = process.env.YAPPR_DATA_DIR || process.env.BEACON_DATA_DIR || path.join(process.cwd(), ".yappr-state");
const FILE = path.join(STATE_DIR, "runs.json");
const MAX_PER_USER = 50;

// owner id → newest-first run list
const CACHE = new Map<string, Run[]>();
let LOADED = false;
let LOADING: Promise<void> | null = null;

async function load(): Promise<void> {
  if (LOADED) return;
  if (LOADING) return LOADING;
  LOADING = (async () => {
    try {
      const raw = await fs.readFile(FILE, "utf8");
      const parsed = JSON.parse(raw) as Record<string, Run[]>;
      for (const [owner, runs] of Object.entries(parsed)) {
        if (Array.isArray(runs)) CACHE.set(owner, runs.slice(0, MAX_PER_USER));
      }
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") console.error("[runs] load failed:", e.message);
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
    const obj: Record<string, Run[]> = {};
    for (const [owner, runs] of CACHE.entries()) obj[owner] = runs;
    await fs.writeFile(tmp, JSON.stringify(obj, null, 2), "utf8");
    await fs.rename(tmp, FILE);
  } catch (err) {
    console.error("[runs] persist failed:", (err as Error).message);
  }
}

export async function appendRun(run: Run, ownerId: string = "system"): Promise<void> {
  await load();
  const owner = ownerId || "system";
  const runs = CACHE.get(owner) ?? [];
  runs.unshift({ ...run, ownerId: owner });
  if (runs.length > MAX_PER_USER) runs.length = MAX_PER_USER;
  CACHE.set(owner, runs);
  await persist();
}

export async function getRuns(ownerId: string = "system"): Promise<Run[]> {
  await load();
  return [...(CACHE.get(ownerId || "system") ?? [])];
}

export function newRunId(): string {
  return `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
