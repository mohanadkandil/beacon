/**
 * Saved patches — file-backed JSON store. Survives dev HMR + server restarts.
 *
 * Path: <cwd>/.beacon-state/patches.json
 * Each patch is an entry in a single JSON file. Writes are atomic (tmp + rename).
 *
 * Production swap: replace `load`/`persist` with Postgres / D1. Same surface,
 * same callers — only the storage adapter changes.
 */

import { promises as fs } from "node:fs";
import path from "node:path";
import type { CanvasNode, CanvasEdge } from "./graph-builder";

export type SavedPatch = {
  id: string;
  name: string;
  ownerId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  createdAt: number;
  updatedAt: number;
};

const STATE_DIR = process.env.YAPPR_DATA_DIR || process.env.BEACON_DATA_DIR || path.join(process.cwd(), ".yappr-state");
const PATCHES_FILE = path.join(STATE_DIR, "patches.json");

// In-memory cache so reads don't hit disk every time. Loaded lazily.
const CACHE = new Map<string, SavedPatch>();
let LOADED = false;
let LOADING: Promise<void> | null = null;

async function load(): Promise<void> {
  if (LOADED) return;
  if (LOADING) return LOADING;
  LOADING = (async () => {
    try {
      const raw = await fs.readFile(PATCHES_FILE, "utf8");
      const arr = JSON.parse(raw) as SavedPatch[];
      for (const p of arr) CACHE.set(p.id, p);
    } catch (err) {
      // ENOENT = first run, fine. Other errors = log + continue with empty.
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") console.error("[patches-store] load failed:", e.message);
    }
    LOADED = true;
    LOADING = null;
  })();
  return LOADING;
}

async function persist(): Promise<void> {
  try {
    await fs.mkdir(STATE_DIR, { recursive: true });
    const arr = [...CACHE.values()];
    const tmp = PATCHES_FILE + ".tmp";
    await fs.writeFile(tmp, JSON.stringify(arr, null, 2), "utf8");
    await fs.rename(tmp, PATCHES_FILE);
  } catch (err) {
    console.error("[patches-store] persist failed:", (err as Error).message);
  }
}

export function generatePatchId(): string {
  const rand = Array.from({ length: 12 }, () =>
    "0123456789abcdefghijklmnopqrstuvwxyz"[Math.floor(Math.random() * 36)]
  ).join("");
  return `p_${rand}`;
}

export function isUserPatchId(id: string): boolean {
  return id.startsWith("p_");
}

export async function getSavedPatch(id: string): Promise<SavedPatch | null> {
  await load();
  return CACHE.get(id) ?? null;
}

export async function upsertSavedPatch(args: {
  id: string;
  name: string;
  ownerId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}): Promise<SavedPatch> {
  await load();
  const existing = CACHE.get(args.id);
  const now = Date.now();
  const patch: SavedPatch = {
    id: args.id,
    name: args.name,
    ownerId: args.ownerId,
    nodes: args.nodes,
    edges: args.edges,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  CACHE.set(args.id, patch);
  await persist();
  return patch;
}

export async function listUserPatches(ownerId: string): Promise<SavedPatch[]> {
  await load();
  return [...CACHE.values()]
    .filter((p) => p.ownerId === ownerId)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function deleteSavedPatch(id: string, ownerId: string): Promise<boolean> {
  await load();
  const p = CACHE.get(id);
  if (!p || p.ownerId !== ownerId) return false;
  CACHE.delete(id);
  await persist();
  return true;
}

import type { Recipe } from "./recipes";

/**
 * Async variant — wraps a SavedPatch in a Recipe shape so the scheduler can
 * feed user-saved patches through the same `runRecipe` pipeline as built-ins.
 * The runner detects `p_*` ids and routes to the stub agent.
 */
export async function getSavedPatchRecipeAsync(id: string, ownerId: string): Promise<Recipe | null> {
  const p = await getSavedPatch(id);
  if (!p || p.ownerId !== ownerId) return null;
  return {
    id: p.id,
    name: p.name,
    description: "User-saved patch",
    pigment: "lavender",
    emoji: "🧩",
    trigger: { kind: "manual", humanLabel: "manual" },
    reads: [],
    writes: "",
    status: "stub",
    requiresEnv: [],
  };
}

/**
 * Sync variant — same shape, but reads from the in-memory cache only (no
 * disk hit). Safe inside the scheduler tick where load() has already run.
 * Returns null if the patch isn't cached, isn't owned by the user, or doesn't
 * exist. The scheduler will quietly skip it on this tick and pick it up next.
 */
export function getSavedPatchRecipe(id: string, ownerId: string): Recipe | null {
  const p = CACHE.get(id);
  if (!p || p.ownerId !== ownerId) return null;
  return {
    id: p.id,
    name: p.name,
    description: "User-saved patch",
    pigment: "lavender",
    emoji: "🧩",
    trigger: { kind: "manual", humanLabel: "manual" },
    reads: [],
    writes: "",
    status: "stub",
    requiresEnv: [],
  };
}
