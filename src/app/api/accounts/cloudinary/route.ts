import { NextResponse } from "next/server";
import { setUserCloudinary } from "@/lib/store";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// 綁定各人自己的 Cloudinary（素材中轉進自己雲端）。cloud name + unsigned upload preset 皆非機密。
export async function POST(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: "請求格式錯誤（非合法 JSON）" }, { status: 400 });
    }
    const rawCloud = (body as { cloud?: unknown })?.cloud;
    const rawPreset = (body as { preset?: unknown })?.preset;
    // 型別必須是 string；缺欄位/錯型別一律 400，不可悄悄當空字串而清掉既有設定。
    // 要清除請明確傳 cloud: ""。
    if (typeof rawCloud !== "string") {
      return NextResponse.json({ ok: false, error: "缺少或型別錯誤的 cloud" }, { status: 400 });
    }
    if (rawPreset !== undefined && typeof rawPreset !== "string") {
      return NextResponse.json({ ok: false, error: "preset 型別錯誤" }, { status: 400 });
    }
    const cloud = rawCloud.trim();
    const preset = (rawPreset ?? "").trim();
    // cloud name 僅允許 Cloudinary 合法字元（英數、底線、連字號），擋下注入到 URL path 的怪字元
    if (cloud && !/^[a-zA-Z0-9_-]{1,64}$/.test(cloud)) {
      return NextResponse.json({ ok: false, error: "cloud name 格式不正確（僅限英數、_、-）" }, { status: 400 });
    }
    if (preset && !/^[a-zA-Z0-9_-]{1,64}$/.test(preset)) {
      return NextResponse.json({ ok: false, error: "upload preset 格式不正確（僅限英數、_、-）" }, { status: 400 });
    }
    // 清除 cloud 時 preset 也一併清掉，避免殘留半套設定
    await setUserCloudinary(user.id, cloud || null, cloud ? preset || null : null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("儲存 Cloudinary 設定失敗", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
