import { NextResponse } from "next/server";
import { getMaterial, createDraftFromMaterial, updateDraft, getGeminiKey, getCopyPrefs, userOwnsThreadsAccount } from "@/lib/store";
import { withNextSlot } from "@/services/publish/slots";
import { generateCopy } from "@/services/ai/provider";
import { getCurrentUser } from "@/lib/auth";
import type { Draft, Material } from "@/lib/types";

export const dynamic = "force-dynamic";

// vary=true：重發時用 AI 重寫文案，避免跨帳號/多次重發出現重複措辭（降觸及/封號頭號訊號）。
// 重寫失敗（無金鑰/AI 故障）→ 優雅退回原文案，附 note 提示。
async function maybeVary(draft: Draft, material: Material, ownerId: string): Promise<{ draft: Draft; note?: string }> {
  try {
    const [geminiKey, copyPrefs] = await Promise.all([getGeminiKey(ownerId), getCopyPrefs(ownerId)]);
    const copy = await generateCopy(
      {
        productName: material.product_name ?? "這個好物",
        shopeeShortLink: material.affiliate_short_link ?? "",
        mediaUrl: material.cloudinary_media_url,
        mediaType: (material.media_type as "image" | "video" | "none") ?? "none"
      },
      geminiKey,
      copyPrefs
    );
    const updated = await updateDraft(draft.id, ownerId, {
      main_text: copy.mainText,
      reply_text: copy.replyText,
      ai_raw: copy.raw
    });
    return { draft: updated ?? draft };
  } catch (e) {
    // 細節只記伺服器端 log，對外回固定文案（不洩漏內部/供應商錯誤）
    console.error("repost 文案重寫失敗：", e instanceof Error ? e.message : e);
    return { draft, note: "文案重寫失敗，沿用原文案" };
  }
}

// 重發：從既有素材再產生一篇草稿（重用連結/媒體，不重燒 token）。
// action: "queue"（排進下一個空時段，approved）｜"draft"（存待審，預設）。
// vary: true 時用 AI 重寫文案（防重複措辭）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    const ownerId = user.id;

    const body = await req.json();
    if (!body.material_id || !body.threads_account_id) {
      return NextResponse.json({ ok: false, error: "缺少 material_id 或 threads_account_id" }, { status: 400 });
    }
    const material = await getMaterial(body.material_id, ownerId);
    if (!material) return NextResponse.json({ ok: false, error: "找不到素材" }, { status: 404 });

    // 多租戶：發文/建草稿前先驗證該 Threads 帳號確屬本人（擋跨租戶冒用 account id）
    if (!(await userOwnsThreadsAccount(body.threads_account_id, ownerId))) {
      return NextResponse.json({ ok: false, error: "找不到 Threads 帳號" }, { status: 404 });
    }

    const action = body.action === "queue" ? "queue" : "draft";
    const vary = body.vary === true;

    let draft: Draft | null;
    let scheduledAt: string | null = null;
    if (action === "queue") {
      draft = await withNextSlot(ownerId, (slot) =>
        createDraftFromMaterial(material, {
          owner_id: ownerId,
          threads_account_id: body.threads_account_id,
          status: "approved",
          scheduled_at: slot
        })
      );
      if (!draft) return NextResponse.json({ ok: false, error: "30 天內時段已滿" }, { status: 409 });
      scheduledAt = draft.scheduled_at ?? null;
    } else {
      draft = await createDraftFromMaterial(material, {
        owner_id: ownerId,
        threads_account_id: body.threads_account_id,
        status: "draft"
      });
    }

    let note: string | undefined;
    if (vary) ({ draft, note } = await maybeVary(draft, material, ownerId));

    return NextResponse.json({ ok: true, draft, scheduledAt, note });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
