/**
 * Peec REST client.
 *
 * Why REST and not MCP: Peec's MCP uses an OAuth redirect flow that only works
 * for interactive clients (Claude Desktop, Cursor, VS Code). yappr Studio is a
 * server-rendered Next.js app that needs to call Peec from the server with a
 * pre-issued API key. The REST API exposes the same data with X-API-Key auth.
 *
 * Non-fabrication rule: every REST call returns real rows or an empty list. If
 * the API returns no data, callers render empty. Never invent rows.
 *
 * Mirrors the working pattern from `yappr` (the user's existing CLI repo):
 *   GET  /projects
 *   GET  /brands?project_id=
 *   GET  /topics?project_id=
 *   GET  /models?project_id=
 *   GET  /chats?project_id=&start_date=&end_date=&limit=&offset=
 *   POST /reports/brands  body { project_id, start_date, end_date, dimensions, filters, limit }
 *   POST /reports/domains
 *   POST /reports/urls
 */

const BASE = process.env.PEEC_API_URL || "https://api.peec.ai/customer/v1";
export const PROJECT_SCOPED_ID = "project-scoped";

function projectParam(projectId?: string): string | undefined {
  return projectId === PROJECT_SCOPED_ID ? undefined : projectId;
}

function authHeaders(apiKey?: string): HeadersInit {
  const key = apiKey || process.env.PEEC_API_KEY;
  if (!key) throw new Error("Peec API key missing. Sign in via the onboarding screen or set PEEC_API_KEY in .env.local.");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    "X-API-Key": key,
  };
}

async function request<T>(method: "GET" | "POST", path: string, init: { params?: Record<string, string | number | undefined>; body?: unknown; apiKey?: string } = {}): Promise<T> {
  const url = new URL(BASE.replace(/\/+$/, "") + path);
  if (init.params) {
    for (const [k, v] of Object.entries(init.params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    method,
    headers: authHeaders(init.apiKey),
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let detail = "";
    try {
      const j = await res.json();
      detail = j?.message || j?.error || j?.detail || JSON.stringify(j).slice(0, 200);
    } catch {
      detail = await res.text().catch(() => "");
    }
    if (res.status === 401) throw new Error(`Peec rejected the API key (401). Check PEEC_API_KEY.`);
    throw new Error(`Peec ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

/** Tabular shape Peec returns for most endpoints. */
type Tabular = { rows?: unknown[]; data?: unknown[]; projects?: unknown[]; items?: unknown[]; totalCount?: number };

function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
  if (payload && typeof payload === "object") {
    const p = payload as Tabular;
    for (const key of ["rows", "data", "projects", "items"] as const) {
      const v = p[key];
      if (Array.isArray(v)) return v.filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null);
    }
  }
  return [];
}

// --- Public API -------------------------------------------------------------

export type Project = { id: string; name: string; status?: string };
export type Brand = { id: string; name: string; domains?: string[]; is_own?: boolean };
export type Topic = { id: string; name: string };
export type AIModel = { id: string; name: string; is_active?: boolean };
export type BrandReportRow = {
  brand_id?: string;
  brand_name?: string;
  visibility?: number;
  mention_count?: number;
  share_of_voice?: number;
  sentiment?: number;
  position?: number;
  visibility_count?: number;
  visibility_total?: number;
  [k: string]: unknown;
};
export type URLReportRow = {
  url: string;
  classification?: string | null;
  title?: string | null;
  channel_title?: string | null;
  citation_count?: number;
  retrievals?: number;
  citation_rate?: number;
  mentioned_brand_ids?: string[];
  [k: string]: unknown;
};

export async function listProjects(apiKey?: string): Promise<Project[]> {
  const payload = await request<unknown>("GET", "/projects", { apiKey });
  return extractRows(payload) as Project[];
}

export async function listBrands(projectId?: string, apiKey?: string): Promise<Brand[]> {
  const payload = await request<unknown>("GET", "/brands", { params: { project_id: projectParam(projectId) }, apiKey });
  return extractRows(payload) as Brand[];
}

export async function listTopics(projectId?: string, apiKey?: string): Promise<Topic[]> {
  const payload = await request<unknown>("GET", "/topics", { params: { project_id: projectParam(projectId) }, apiKey });
  return extractRows(payload) as Topic[];
}

export async function listModels(projectId?: string, apiKey?: string): Promise<AIModel[]> {
  const payload = await request<unknown>("GET", "/models", { params: { project_id: projectParam(projectId) }, apiKey });
  return extractRows(payload) as AIModel[];
}

type ReportArgs = {
  projectId?: string;
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  dimensions?: string[];
  filters?: Array<{ field: string; operator: string; value?: unknown; values?: unknown[] }>;
  limit?: number;
  apiKey?: string;
};

function reportBody(args: ReportArgs): Record<string, unknown> {
  const body: Record<string, unknown> = {
    start_date: args.startDate,
    end_date: args.endDate,
    limit: args.limit ?? 1000,
    offset: 0,
  };
  const projectId = projectParam(args.projectId);
  if (projectId) body.project_id = projectId;
  if (args.dimensions) body.dimensions = args.dimensions;
  if (args.filters) body.filters = args.filters;
  return body;
}

export async function getBrandReport(args: ReportArgs): Promise<BrandReportRow[]> {
  const payload = await request<unknown>("POST", "/reports/brands", { body: reportBody(args), apiKey: args.apiKey });
  return extractRows(payload) as BrandReportRow[];
}

export async function getDomainReport(args: ReportArgs): Promise<Record<string, unknown>[]> {
  const payload = await request<unknown>("POST", "/reports/domains", { body: reportBody(args), apiKey: args.apiKey });
  return extractRows(payload);
}

export async function getURLReport(args: ReportArgs): Promise<URLReportRow[]> {
  const payload = await request<unknown>("POST", "/reports/urls", { body: reportBody(args), apiKey: args.apiKey });
  return extractRows(payload) as URLReportRow[];
}

/** Convenience for the smoke gate — pings /projects to verify auth. */
export async function smoke(): Promise<{ ok: true; projectCount: number; projects: Project[] } | { ok: false; error: string }> {
  try {
    const projects = await listProjects();
    return { ok: true, projectCount: projects.length, projects };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
