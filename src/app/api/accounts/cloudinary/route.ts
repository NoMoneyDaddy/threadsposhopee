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
    // cloud 與 preset 必須成對：缺一就是半套設定，會造成上傳錯配或 UI 誤顯示「已清除」。
    // 綁自己的 cloud 一定要一起填 preset：系統預設 preset 多半不存在於使用者帳號，
    // 否則會用「使用者 cloud + 系統 preset」上傳失敗，靜默降級回原始短效 URL。
    if (cloud && !preset) {
      return NextResponse.json(
        { ok: false, error: "綁定自己的 Cloudinary 需一併填 upload preset（unsigned）" },
        { status: 400 }
      );
    }
    // 只填 preset 沒填 cloud：別當成清除（會讓 UI 誤顯示「已清除」），明確擋下。
    if (preset && !cloud) {
      return NextResponse.json(
        { ok: false, error: "設定 upload preset 時必須一併提供 cloud name" },
        { status: 400 }
      );
    }
    // 走到這 cloud 與 preset 同空（清除）或同非空（綁定）
    await setUserCloudinary(user.id, cloud || null, preset || null);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("儲存 Cloudinary 設定失敗", e);
    return NextResponse.json({ ok: false, error: "伺服器暫時無法處理，請稍後再試" }, { status: 500 });
  }
}
