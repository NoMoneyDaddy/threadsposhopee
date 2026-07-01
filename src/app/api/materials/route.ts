import { NextResponse } from "next/server";
import { resolveMaterialFromUrl } from "@/services/materials/fromUrl";
import { getCurrentUser } from "@/lib/auth";
import { getDefaultShareMaterials, setMaterialShared, getFeatureFlags } from "@/lib/store";
import { log } from "@/lib/logger";
import type { DraftMedia } from "@/lib/types";

const MAX_MEDIA = 20; // Threads 輪播上限（對齊 MAX_CAROUSEL_ITEMS）

// 解析自帶媒體陣列（同一篇多圖／影片）：逐項驗 url 非空字串＋type 白名單，取前 20。
function parseMediaList(raw: unknown): DraftMedia[] {
  if (!Array.isArray(raw)) return [];
  const out: DraftMedia[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") continue;
    const url = typeof (m as { url?: unknown }).url === "string" ? (m as { url: string }).url.trim() : "";
    const t = (m as { type?: unknown }).type;
    if (!url || (t !== "image" && t !== "video")) continue;
    out.push({ url, type: t });
    if (out.length >= MAX_MEDIA) break;
  }
  return out;
}

export const dynamic = "force-dynamic";
// Shopee 還原 + 分潤 + Cloudinary 中轉 + Gemini 文案的多 API 串接，放寬逾時上限
export const maxDuration = 60;

// 手動建立素材：貼蝦皮商品連結 → 還原商品 → 換分潤連結 →（可選）AI 文案 → 存素材。
// owner 用環境變數的 Shopee 金鑰；member 只能用自己的金鑰（沒設則直接用貼上的連結）。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    const body = await req.json();
    const url: string = (body.shopee_url ?? "").trim();
    if (!url) return NextResponse.json({ ok: false, error: "缺少 shopee_url" }, { status: 400 });

    // 自帶媒體（選填）：取代爬到的商品圖。優先收多媒體陣列 media[]（同一篇多圖／影片），
    // 否則退回舊單一 media_url/media_type（向後相容）。type 走白名單，無效值不靜默當 image。
    const mediaList = parseMediaList(body.media);
    const mediaUrl = typeof body.media_url === "string" && body.media_url.trim() ? body.media_url.trim() : null;
    // 舊單一 media_type 僅在「無 media[]、實際採用 media_url」時才驗；避免新舊欄位並送時誤擋以 media[] 為準的請求。
    if (
      mediaList.length === 0 &&
      mediaUrl &&
      body.media_type !== undefined &&
      body.media_type !== null &&
      !["image", "video"].includes(body.media_type)
    ) {
      return NextResponse.json({ ok: false, error: "媒體類型只支援 image 或 video" }, { status: 400 });
    }
    const media =
      mediaList.length === 0 && mediaUrl
        ? { url: mediaUrl, type: (body.media_type === "video" ? "video" : "image") as "image" | "video" }
        : undefined;

    const { material, reused, notes } = await resolveMaterialFromUrl(url, user, body.generate_copy !== false, media, mediaList);
    // 預設分享：新建立（非沿用既有）的素材，依使用者「新素材預設分享」設定自動分享到共享庫。
    // 共享庫未開放時略過。既有素材（reused）不動其分享設定。失敗只記 log，不擋素材建立。
    if (!reused) {
      try {
        if ((await getFeatureFlags()).shared && (await getDefaultShareMaterials(user.id))) {
          await setMaterialShared(material.id, user.id, true);
          material.shared = true;
        }
      } catch (e) {
        log.warn("套用預設分享失敗", { materialId: material.id, err: e instanceof Error ? e.message : String(e) });
      }
    }
    return NextResponse.json({ ok: true, material, reused, notes });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
