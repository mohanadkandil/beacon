# yappr

yappr is a writing surface and an execution layer for marketers who want to be cited by AI search engines. You write in it, see what's missing against your real Peec data, and ship the fix as a real artifact (a GitHub PR, a Slack post, a Linear ticket) without leaving the page.

Live at https://www.useyappr.app.

![yappr architecture](./public/yapperarch.png)

## Why this exists

If you sell anything online and you're paying attention, you've already noticed that your traffic graph looks fine while your AI citation graph looks terrible. ChatGPT and Perplexity quote your competitors. Your marketing team finds out three weeks late. Then they spend a Tuesday afternoon screenshotting the Peec dashboard into Slack and writing a Notion brief that takes another six days to turn into a shipped page.

yappr is what happens when you put the dashboard, the brief, and the deploy in one room.

## What's in the box

Three surfaces, all driven by the user's own Peec project.

### Quill

A doc editor with a live lint sidebar. Paste a URL or write a draft. yappr pulls your brand report, URL report, and topic coverage from Peec, then surfaces concrete weaknesses: missing JSON LD, weak H1 framing, competitor URLs cited on prompts where you're absent. Each lint has an Apply button that rewrites the section through OpenRouter with structured outputs. The diff is visible before you accept.

### Wire

The execution layer. Ten built in patches, each one a complete read, think, act loop. Schema Sweeper opens a GitHub PR with JSON LD for your top cited pages. Citation Watch fires a Slack post when visibility drops two sigma below the rolling mean. Anomaly Autopsy explains why a metric moved, with confidence levels and evidence. Slack Brief, Notion Drafter, Linear Triager, Gmail Pitcher round out the catalog.

Click run and a real artifact lands. The run feed on the right is per user and persists across reloads.

### Canvas

Where the custom workflows live. Drag any of the 27 Peec MCP tools (15 read, 12 write) onto the canvas. Connect them through one of ten purpose built agents (Citation Hunter, Schema.org Author, Competitor Counter Move, Prompt Suggester, and friends), each with an editable system prompt and an editable structured output schema. Wire the agent into a Composio action: Slack channel, GitHub repo, Linear team, Notion page, Gmail recipient.

Type a sentence at the bottom of the canvas and the synthesizer plans the graph for you. It cannot hallucinate a tool slug because the JSON schema only accepts slugs from the literal catalog.

Hit test run and the canvas walks upstream Peec reads, fires the agent on real rows, then walks downstream actions and ships each one through Composio MCP. The Cursor button at the top exports the patch as a markdown skill you can drop into `.cursor/skills/` or `.claude/skills/`. From inside your editor, your coding agent can then call the patch like any other tool.

## Try it

Open https://www.useyappr.app/studio. You can paste your own Peec API key or click Try the demo to run against a sample project (the prism vs. Juicebox AI sourcing tools example).

## How it's built

A single Next.js 16 app on Vercel. A Cloudflare Worker hits a cron tick endpoint every minute for scheduled patches.

The interesting bits.

**Zod enums of the entire Peec MCP catalog.** The synthesizer takes a sentence, plans a graph, and the JSON schema enum gates it to slugs that actually exist. No "the tool you asked for doesn't exist" failures at runtime, and no LLM creativity around tool names.

**Multi tenant from day one.** Every browser gets an anonymous yappr.userId. All state (user config, saved patches, run history, Composio connections) is keyed on that id. The Peec API key never leaves the server side store. The exported Cursor skill carries only the userId.

**Two MCPs glued in.** Peec MCP for the reads (via REST proxy because Peec MCP itself wants an OAuth redirect that only interactive clients can complete). Composio MCP for the writes, so the user authorizes GitHub, Slack, Notion, Linear, and Gmail through Composio's OAuth flow and yappr never holds a token.

**File backed state for the demo, swap path documented.** Patches, runs, and user config live in `/tmp/yappr-state` JSON files behind tiny stores that match a Postgres surface one for one. The day this needs to be a real product, the data layer changes; the call sites do not.

## Local dev

```
git clone git@github.com:mohanadkandil/yappr.git
cd yappr
bun install
cp .env.example .env.local
# fill in PEEC_API_KEY, OPENROUTER_API_KEY, COMPOSIO_API_KEY at minimum
bun dev
```

Then open `http://localhost:3000/studio` and use Try the demo.

## What's next

A real canvas executor for saved patches (today only built ins fire). Linear team and Notion database dropdowns so the last "paste a UUID" step disappears. An MCP server endpoint that exposes yappr's patches as tools to any MCP capable client (Cursor, Claude Desktop, Claude Code) instead of one off skill files. The skill export is the sketch; the MCP version is the same idea wired up properly.
