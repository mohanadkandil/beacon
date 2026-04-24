import { NextRequest, NextResponse } from "next/server";
import { executeTool } from "@/lib/wire/composio";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId") || "";
  if (!userId) return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });

  try {
    const raw = (await executeTool(
      "SLACK_LIST_ALL_CHANNELS",
      { exclude_archived: true, limit: 200, types: "public_channel,private_channel" },
      userId,
    )) as unknown;

    const r = raw as { data?: { channels?: Array<{ id?: string; name?: string; is_private?: boolean; is_member?: boolean }> } };
    const items = r?.data?.channels ?? [];
    const channels = items
      .filter((c) => c?.name)
      .map((c) => ({
        id: c.id ?? "",
        name: `#${c.name}`,
        isPrivate: !!c.is_private,
        isMember: c.is_member !== false,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ ok: true, channels });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 200 });
  }
}
