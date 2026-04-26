/**
 * Wire scheduler — in-memory schedule state + tick logic.
 *
 * Demo: client-side polls `/api/wire/cron-tick` every 30s while Wire is open.
 * Each tick reads scheduled patches, checks which are due, runs them.
 *
 * Production: replace state with Postgres/Redis + replace client polling with
 * Vercel Cron (`/api/wire/cron-tick` hit every minute) OR Cloudflare Workers
 * Cron Triggers. The tick logic is identical — only the trigger source changes.
 */

import { getRecipe } from "./recipes";
import { getSavedPatchRecipe } from "./patches-store";
import { runRecipe } from "./agents";
import { appendRun } from "./runs";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type SchedulePreset =
  | "every-1-min"   // demo-friendly fast schedule
  | "every-5-min"
  | "every-15-min"
  | "every-1-hour"
  | "every-6-hours"
  | "every-1-day"
  | "weekly-mon"
  | "off";

export type Schedule = {
  /** Unique key: ${userId}:${patchId} */
  key: string;
  userId: string;
  patchId: string;
  preset: SchedulePreset;
  /** Last successful tick time, ms since epoch. */
  lastRunAt: number | null;
  /** When this schedule was created. */
  createdAt: number;
  /** Project id to run against. */
  projectId: string;
};

const SCHEDULES = new Map<string, Schedule>();
const RUNNING = new Set<string>(); // prevent double-fire while a run is in flight
const STORE_PATH = join(process.env.YAPPR_DATA_DIR || process.env.BEACON_DATA_DIR || join(process.cwd(), ".yappr-data"), "wire-schedules.json");
let loaded = false;

function loadSchedules() {
  if (loaded) return;
  loaded = true;
  if (!existsSync(STORE_PATH)) return;
  try {
    const parsed = JSON.parse(readFileSync(STORE_PATH, "utf8")) as { schedules?: Schedule[] };
    for (const s of parsed.schedules ?? []) {
      if (s?.key && s.userId && s.patchId && s.preset && s.projectId) {
        SCHEDULES.set(s.key, s);
      }
    }
  } catch (err) {
    console.warn(`Could not read Wire schedules from ${STORE_PATH}:`, (err as Error).message);
  }
}

function persistSchedules() {
  loadSchedules();
  mkdirSync(dirname(STORE_PATH), { recursive: true });
  const tmp = `${STORE_PATH}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify({ schedules: [...SCHEDULES.values()] }, null, 2));
  renameSync(tmp, STORE_PATH);
}

function makeKey(userId: string, patchId: string) {
  return `${userId}:${patchId}`;
}

export function setSchedule(args: {
  userId: string; patchId: string; preset: SchedulePreset;
  projectId: string;
}): Schedule {
  loadSchedules();
  const key = makeKey(args.userId, args.patchId);
  const existing = SCHEDULES.get(key);
  const sched: Schedule = {
    key, userId: args.userId, patchId: args.patchId,
    preset: args.preset, projectId: args.projectId,
    lastRunAt: existing?.lastRunAt ?? null,
    createdAt: existing?.createdAt ?? Date.now(),
  };
  if (args.preset === "off") {
    SCHEDULES.delete(key);
  } else {
    SCHEDULES.set(key, sched);
  }
  persistSchedules();
  return sched;
}

export function getSchedules(userId: string): Schedule[] {
  loadSchedules();
  return [...SCHEDULES.values()].filter((s) => s.userId === userId);
}

export function getSchedule(userId: string, patchId: string): Schedule | null {
  loadSchedules();
  return SCHEDULES.get(makeKey(userId, patchId)) ?? null;
}

/** Return the interval in ms for each preset. */
export function presetIntervalMs(preset: SchedulePreset): number {
  switch (preset) {
    case "every-1-min":   return 60_000;
    case "every-5-min":   return 5 * 60_000;
    case "every-15-min":  return 15 * 60_000;
    case "every-1-hour":  return 60 * 60_000;
    case "every-6-hours": return 6 * 60 * 60_000;
    case "every-1-day":   return 24 * 60 * 60_000;
    case "weekly-mon":    return 7 * 24 * 60 * 60_000;
    case "off":           return Infinity;
  }
}

/** Compute the next firing time, given lastRunAt + preset. */
export function nextFiringAt(s: Schedule): number {
  const interval = presetIntervalMs(s.preset);
  if (!isFinite(interval)) return Infinity;
  return (s.lastRunAt ?? s.createdAt) + interval;
}

export function presetLabel(preset: SchedulePreset): string {
  switch (preset) {
    case "every-1-min":   return "every minute";
    case "every-5-min":   return "every 5 minutes";
    case "every-15-min":  return "every 15 minutes";
    case "every-1-hour":  return "hourly";
    case "every-6-hours": return "every 6 hours";
    case "every-1-day":   return "daily";
    case "weekly-mon":    return "weekly · Monday";
    case "off":           return "off";
  }
}

/**
 * Fire all due schedules. Returns a list of runs that fired.
 * Called by /api/wire/cron-tick (client poll OR external cron service).
 */
export async function tick(): Promise<{ fired: number; runs: { patchId: string; userId: string; status: string; message: string }[] }> {
  loadSchedules();
  const now = Date.now();
  const due = [...SCHEDULES.values()].filter((s) => {
    if (RUNNING.has(s.key)) return false;
    const next = nextFiringAt(s);
    return now >= next;
  });

  const results: { patchId: string; userId: string; status: string; message: string }[] = [];

  for (const s of due) {
    const recipe = getRecipe(s.patchId) ?? getSavedPatchRecipe(s.patchId, s.userId);
    if (!recipe) continue;
    if (recipe.status === "coming_soon") continue;
    RUNNING.add(s.key);
    try {
      const run = await runRecipe(recipe, s.projectId, s.userId);
      await appendRun(run, s.userId);
      // Update lastRunAt regardless of success — we don't want to retry-storm a
      // failing schedule every tick. Failed runs are still recorded in the feed.
      s.lastRunAt = Date.now();
      SCHEDULES.set(s.key, s);
      persistSchedules();
      results.push({ patchId: s.patchId, userId: s.userId, status: run.status, message: run.message });
    } catch (err) {
      results.push({ patchId: s.patchId, userId: s.userId, status: "thrown", message: (err as Error).message });
      s.lastRunAt = Date.now();
      SCHEDULES.set(s.key, s);
      persistSchedules();
    } finally {
      RUNNING.delete(s.key);
    }
  }

  return { fired: results.length, runs: results };
}
