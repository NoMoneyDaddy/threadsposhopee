import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { updateAiAgent, deleteAiAgent, getAiAgent } from "@/lib/agents-store";
import { userOwnsThreadsAccount } from "@/lib/store";
import { getAiDomain } from "@/lib/ai-domains";
import { isDemoMode } from "@/lib/env";

export const dynamic = "force-dynamic";

// 更新代理人：enabled 開關、改名/口吻，以及完整編輯（領域、取材來源、關鍵字、發文帳號、短連結、免審直發）。
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅管理員可使用 AI 部落客" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) || {};
  const patch: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();
  if (typeof body.tone === "string") patch.tone = body.tone.slice(0, 300);
  if (typeof body.use_redirect === "boolean") patch.use_redirect = body.use_redirect;
  if (typeof body.auto_publish === "boolean") patch.auto_publish = body.auto_publish;

  // 領域（可複選，相容單一 domain）：給定時必須至少一個有效領域。
  if (body.domains !== undefined || typeof body.domain === "string") {
    const raw: string[] = Array.isArray(body.domains)
      ? body.domains.filter((d: unknown): d is string => typeof d === "string")
      : typeof body.domain === "string"
        ? [body.domain]
        : [];
    const domains = Array.from(new Set(raw.filter((d) => getAiDomain(d))));
    if (!domains.length) return NextResponse.json({ ok: false, error: "請至少選一個領域" }, { status: 400 });
    patch.domains = domains;
    patch.domain = domains[0];
  }
  if (body.source_mode !== undefined)
    patch.source_mode = body.source_mode === "threads_search" || body.source_mode === "web_search" ? body.source_mode : "rss";
  if (typeof body.search_query === "string") patch.search_query = body.search_query.trim().slice(0, 100);

  // 發文帳號：null＝取消指定；給字串需驗證歸屬（多租戶，不落跨租戶/不存在 id）。
  let nextAccountId: string | null | undefined;
  if (body.threads_account_id === null) {
    nextAccountId = null;
    patch.threads_account_id = null;
  } else if (typeof body.threads_account_id === "string") {
    nextAccountId = body.threads_account_id.trim() || null;
    if (nextAccountId && !isDemoMode && !(await userOwnsThreadsAccount(nextAccountId, user.id))) {
      return NextResponse.json({ ok: false, error: "發文帳號不存在或不屬於你" }, { status: 403 });
    }
    patch.threads_account_id = nextAccountId;
  }

  // 自訂主題（custom）必須有關鍵字（與建立一致）。
  const finalDomains = (patch.domains as string[] | undefined) ?? undefined;
  const finalQuery = patch.search_query as string | undefined;
  if (finalDomains?.includes("custom")) {
    const q = finalQuery ?? (await getAiAgent(params.id, user.id).then((a) => a?.search_query ?? "").catch(() => ""));
    if (!q) return NextResponse.json({ ok: false, error: "自訂主題請填搜尋關鍵字" }, { status: 400 });
  }

  if (Object.keys(patch).length === 0) return NextResponse.json({ ok: false, error: "無可更新欄位" }, { status: 400 });
  try {
    // 開啟免審直接排程前，確認此小編（更新後）有指定發文帳號，否則產出無帳號可發、會卡住。
    // demo 模式 getAiAgent 一律回 null，跳過此前置檢查避免誤判 404。
    if (!isDemoMode && body.auto_publish === true) {
      const agent = await getAiAgent(params.id, user.id);
      if (!agent) return NextResponse.json({ ok: false, error: "找不到小編" }, { status: 404 });
      const effectiveAccount = nextAccountId !== undefined ? nextAccountId : agent.threads_account_id;
      if (!effectiveAccount) {
        return NextResponse.json({ ok: false, error: "此小編未指定發文帳號，無法開啟免審直接排程" }, { status: 400 });
      }
    }
    await updateAiAgent(params.id, user.id, patch);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "請先登入" }, { status: 401 });
  if (!user.isOwner) return NextResponse.json({ ok: false, error: "僅管理員可使用 AI 部落客" }, { status: 403 });
  await deleteAiAgent(params.id, user.id);
  return NextResponse.json({ ok: true });
}
