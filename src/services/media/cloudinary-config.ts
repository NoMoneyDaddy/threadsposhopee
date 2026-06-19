// 各人自綁 Cloudinary 的輸入驗證（純函式，方便單測）。
// 規則：cloud name 與 unsigned upload preset 必須「成對」——同空＝清除，同非空＝綁定；
// 缺一即是半套設定（會造成「使用者 cloud + 系統 preset」上傳錯配或 UI 誤顯示「已清除」）。
export type CloudinaryInputResult =
  | { ok: true; cloud: string | null; preset: string | null }
  | { ok: false; error: string };

// cloud name / preset 僅允許 Cloudinary 合法字元（英數、底線、連字號），
// 擋下會注入到上傳 URL path 的怪字元。
const NAME_RE = /^[a-zA-Z0-9_-]{1,64}$/;

export function parseCloudinaryInput(rawCloud: unknown, rawPreset: unknown): CloudinaryInputResult {
  // 型別必須是 string；缺欄位/錯型別一律拒絕，不可悄悄當空字串而清掉既有設定。
  // 要清除請明確傳 cloud: ""。
  if (typeof rawCloud !== "string") return { ok: false, error: "缺少或型別錯誤的 cloud" };
  if (rawPreset !== undefined && typeof rawPreset !== "string") return { ok: false, error: "preset 型別錯誤" };

  const cloud = rawCloud.trim();
  const preset = (rawPreset ?? "").trim();

  if (cloud && !NAME_RE.test(cloud)) return { ok: false, error: "cloud name 格式不正確（僅限英數、_、-）" };
  if (preset && !NAME_RE.test(preset)) return { ok: false, error: "upload preset 格式不正確（僅限英數、_、-）" };
  // 綁自己的 cloud 一定要一起填 preset：系統預設 preset 多半不存在於使用者帳號。
  if (cloud && !preset) return { ok: false, error: "綁定自己的 Cloudinary 需一併填 upload preset（unsigned）" };
  // 只填 preset 沒填 cloud：別當成清除（會讓 UI 誤顯示「已清除」）。
  if (preset && !cloud) return { ok: false, error: "設定 upload preset 時必須一併提供 cloud name" };

  return { ok: true, cloud: cloud || null, preset: preset || null };
}
