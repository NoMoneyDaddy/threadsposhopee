import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createAiAgent } from "@/lib/agents-store";
import { getAiDomain } from "@/lib/ai-domains";

export const dynamic = "force-dynamic";

const EMOJI = ["none", "light", "heavy"];

// 建立 AI 代理人。body: { name, domain, tone?, emoji_level?, hashtag_pool?, length?, threads_account_id?, use_redirect? }
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return NextResponse.json({ ok: false, error: "請填小編名稱" }, { status: 400 });
    if (!getAiDomain(body.domain)) return NextResponse.json({ ok: false, error: "領域不存在" }, { status: 400 });

    const searchQuery = typeof body.search_query === "string" ? body.search_query.trim().slice(0, 100) : "";
    if (body.domain === "custom" && !searchQuery) {
      return NextResponse.json({ ok: false, error: "自訂主題請填搜尋關鍵字" }, { status: 400 });
    }

    const emoji = EMOJI.includes(body.emoji_level) ? body.emoji_level : "light";
    const length = Number(body.length);
    const tags = Array.isArray(body.hashtag_pool)
      ? body.hashtag_pool.filter((t: unknown): t is string => typeof t === "string").slice(0, 8)
      : [];

    const agent = await createAiAgent(user.id, {
      name,
      domain: body.domain,
      tone: typeof body.tone === "string" ? body.tone.slice(0, 300) : "",
      emoji_level: emoji,
      hashtag_pool: tags,
      length: Number.isInteger(length) && length >= 50 && length <= 500 ? length : 200,
      search_query: searchQuery,
      threads_account_id: typeof body.threads_account_id === "string" ? body.threads_account_id : null,
      use_redirect: body.use_redirect === true,
      auto_publish: body.auto_publish === true
    });
    return NextResponse.json({ ok: true, id: agent.id });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
