/**
 * Composio v3 integration — multi-tenant.
 *
 * Per-user connect flow needs an authConfigId (Composio-side artifact). For
 * each toolkit we look up an existing Composio-managed auth config, or create
 * one on the fly (uses Composio's pre-registered OAuth app — no client OAuth
 * registration needed). We cache the ID in-process to avoid round-trips.
 */

import { Composio } from "@composio/core";

let _client: Composio | null = null;
function client(): Composio {
  if (!_client) {
    const apiKey = process.env.COMPOSIO_API_KEY;
    if (!apiKey) throw new Error("COMPOSIO_API_KEY not set in .env.local");
    _client = new Composio({ apiKey, toolkitVersions: "latest" });
  }
  return _client;
}

const AUTH_CONFIG_CACHE = new Map<string, string>(); // toolkit slug -> auth config id

async function ensureAuthConfig(toolkit: string): Promise<{ id?: string; error?: string }> {
  const cached = AUTH_CONFIG_CACHE.get(toolkit);
  if (cached) return { id: cached };
  const c = client();
  try {
    // 1. Look up existing Composio-managed auth configs for this toolkit
    const listed = await (c as unknown as {
      authConfigs: { list: (q: { toolkit?: string; isComposioManaged?: boolean }) => Promise<{ items: Array<{ id: string }> }> };
    }).authConfigs.list({ toolkit, isComposioManaged: true });

    let id = listed.items?.[0]?.id;

    // 2. Create one if missing
    if (!id) {
      const created = await (c as unknown as {
        authConfigs: { create: (toolkit: string, opts: { type: string; name: string }) => Promise<{ id: string }> };
      }).authConfigs.create(toolkit, {
        type: "use_composio_managed_auth",
        name: `yappr · ${toolkit}`,
      });
      id = created.id;
    }
    if (!id) return { error: `Composio returned no auth config id for ${toolkit}` };
    AUTH_CONFIG_CACHE.set(toolkit, id);
    return { id };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function executeTool(
  toolSlug: string,
  args: Record<string, unknown>,
  userId: string,
): Promise<unknown> {
  if (!userId) throw new Error("executeTool: userId is required");
  const c = client();
  // Composio errors on manual execute() unless toolkit version is concrete.
  // We use "latest" globally (set on init) and skip the version gate here —
  // production should pin a concrete catalog version per toolkit instead.
  return await c.tools.execute(toolSlug, { userId, arguments: args, dangerouslySkipVersionCheck: true });
}

export async function listConnectedToolkits(userId: string): Promise<string[]> {
  if (!userId) return [];
  try {
    const c = client();
    const connections = await (c as unknown as {
      connectedAccounts: { list: (args: { userIds: string[] }) => Promise<{ items: Array<{ toolkit: { slug: string }; status?: string }> }> };
    }).connectedAccounts.list({ userIds: [userId] });
    return (connections.items ?? [])
      .filter((it) => !it.status || it.status === "ACTIVE")
      .map((it) => (it.toolkit?.slug ?? "").toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

export async function initiateConnection(toolkit: string, userId: string): Promise<{ redirectUrl: string | null; error?: string }> {
  if (!userId) return { redirectUrl: null, error: "userId is required" };
  try {
    const cfg = await ensureAuthConfig(toolkit);
    if (!cfg.id) return { redirectUrl: null, error: cfg.error ?? "no auth config id" };

    const c = client();
    const result = await (c as unknown as {
      connectedAccounts: {
        link: (userId: string, authConfigId: string) => Promise<{ redirectUrl?: string }>;
      };
    }).connectedAccounts.link(userId, cfg.id);
    return { redirectUrl: result?.redirectUrl ?? null };
  } catch (err) {
    return { redirectUrl: null, error: (err as Error).message };
  }
}
