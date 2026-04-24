/**
 * yappr cron — Cloudflare Worker.
 *
 * Runs on a schedule (configured in wrangler.toml `[triggers] crons`) and
 * fires the yappr Wire scheduler tick by POST-ing to YAPPR_TICK_URL.
 *
 * Same payload as the in-browser poll, just triggered server-side every minute.
 * Cloudflare Workers cron is free up to 1000 triggers/day on the Free plan.
 */

interface Env {
  YAPPR_TICK_URL?: string;       // e.g. https://yappr.ai/api/wire/cron-tick
  YAPPR_CRON_SECRET?: string;    // optional shared secret — recommended
  BEACON_TICK_URL?: string;      // legacy alias
  BEACON_CRON_SECRET?: string;   // legacy alias
}

const worker = {
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const tickUrl = env.YAPPR_TICK_URL || env.BEACON_TICK_URL;
    const secret = env.YAPPR_CRON_SECRET || env.BEACON_CRON_SECRET;
    if (!tickUrl) {
      console.error("YAPPR_TICK_URL is not set");
      return;
    }
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "YapprCron/1.0",
    };
    if (secret) {
      headers["X-Yappr-Cron-Secret"] = secret;
      headers.Authorization = `Bearer ${secret}`;
    }

    ctx.waitUntil(
      (async () => {
        try {
          const res = await fetch(tickUrl, {
            method: "POST",
            headers,
            body: JSON.stringify({
              source: "cloudflare-worker",
              cron: event.cron,
              scheduledTime: event.scheduledTime,
            }),
          });
          const body = await res.text();
          console.log(`tick ${res.status} · cron=${event.cron} · body=${body.slice(0, 200)}`);
        } catch (err) {
          console.error("tick failed:", (err as Error).message);
        }
      })()
    );
  },

  // Optional: GET /__health for sanity checks. Not required.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/__health") {
      return new Response(JSON.stringify({
        ok: true,
        target: env.YAPPR_TICK_URL || env.BEACON_TICK_URL || null,
        hasSecret: !!(env.YAPPR_CRON_SECRET || env.BEACON_CRON_SECRET),
      }), { headers: { "Content-Type": "application/json" } });
    }
    return new Response("yappr cron worker — see /__health", { status: 200 });
  },
};

export default worker;
