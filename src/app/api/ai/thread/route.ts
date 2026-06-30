import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getGeminiKey, resolveGeminiModel, getCopyPrefs } from "@/lib/store";
import { generateThreadCopy } from "@/services/ai/provider";
import { geminiErrorMessage } from "@/services/ai/gemini";
import { isDemoMode } from "@/lib/env";
import { apiError } from "@/lib/api-error";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// AI 生成「多段串文」：依商品名／來源內容產出主文＋數段後續，分潤連結由系統附在最後一段。
// 只用使用者自綁的 Gemini 金鑰。回傳 { mainText, replyText, extraSegments } 直接填入編輯器。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "request body 必須是 JSON 物件" }, { status: 400 });
    }
    const b = body as { productName?: unknown; affiliateLink?: unknown; sourceText?: unknown; segments?: unknown; mediaUrl?: unknown; mediaType?: unknown };
    const productName = typeof b.productName === "string" ? b.productName.trim() : "";
    const affiliateLink = typeof b.affiliateLink === "string" ? b.affiliateLink.trim() : "";
    const sourceText = typeof b.sourceText === "string" ? b.sourceText.slice(0, 2000) : "";
    // 預設 0＝自動偵測段數（能一則講完就一則、內容多才拆串文）；前端不傳 segments 即走自動。
    const segments = typeof b.segments === "number" ? b.segments : 0;
    // 參考媒體（吃圖／影片）：只收 http(s) URL，型別非 video 一律當圖片。
    const mediaUrl = typeof b.mediaUrl === "string" && /^https?:\/\//.test(b.mediaUrl) ? b.mediaUrl : null;
    const mediaType: "image" | "video" | "none" = mediaUrl ? (b.mediaType === "video" ? "video" : "image") : "none";
    if (!productName && !affiliateLink) {
      return NextResponse.json({ ok: false, error: "缺少商品資訊（productName / affiliateLink）" }, { status: 400 });
    }

    const key = await getGeminiKey(user.id);
    if (!isDemoMode && !key) {
      return NextResponse.json({ ok: false, error: "請先到帳號管理綁定自己的 Gemini 金鑰" }, { status: 400 });
    }

    const [prefs, model] = await Promise.all([getCopyPrefs(user.id), resolveGeminiModel(user.id)]);
    const t = await generateThreadCopy(
      { productName: productName || "這個好物", shopeeShortLink: affiliateLink, sourceText, mediaUrl, mediaType },
      key,
      segments,
      prefs,
      model
    );
    return NextResponse.json({ ok: true, mainText: t.mainText, replyText: t.replyText, extraSegments: t.extraSegments });
  } catch (e) {
    return apiError("AI 生成串文失敗", e, { clientMessage: geminiErrorMessage(e, "生成失敗，請稍後再試") });
  }
}
