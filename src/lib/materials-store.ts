// 素材庫資料層：以 (owner_id, shop_id, item_id) 為鍵，重用分潤連結＋AI 文案＋媒體。
// 由 store.ts 拆出（God File 漸進拆分）。多租戶：service-role 繞 RLS，以 owner_id 應用層過濾。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import type { Material } from "./types";

export async function findMaterial(shopId: string, itemId: string, ownerId: string): Promise<Material | null> {
  if (isDemoMode) {
    return demo.materials.find((m) => m.shop_id === shopId && m.item_id === itemId) ?? null;
  }
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("shop_id", shopId)
    .eq("item_id", itemId)
    .maybeSingle();
  return (data as Material) ?? null;
}

export async function getMaterial(id: string, ownerId: string): Promise<Material | null> {
  if (isDemoMode) return demo.materials.find((m) => m.id === id) ?? null;
  const sb = getServiceClient()!;
  const { data } = await sb.from("materials").select("*").eq("id", id).eq("owner_id", ownerId).maybeSingle();
  return (data as Material) ?? null;
}

export async function listMaterials(ownerId: string): Promise<Material[]> {
  if (isDemoMode) return [...demo.materials];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data ?? []) as Material[];
}

export async function createMaterial(input: Partial<Material>, ownerId: string): Promise<Material> {
  if (isDemoMode) {
    const existing = demo.materials.find((m) => m.shop_id === input.shop_id && m.item_id === input.item_id);
    if (existing) {
      Object.assign(existing, input);
      return existing;
    }
    const material = { id: randomUUID(), affiliate_valid: true, created_at: new Date().toISOString(), ...input, owner_id: ownerId } as Material;
    demo.materials.unshift(material);
    return material;
  }
  const sb = getServiceClient()!;
  // upsert on (owner_id,shop_id,item_id)：連結失效重產時不會撞唯一鍵，且不跨使用者
  const { data, error } = await sb
    .from("materials")
    .upsert({ affiliate_valid: true, ...input, owner_id: ownerId }, { onConflict: "owner_id,shop_id,item_id" })
    .select()
    .single();
  if (error) throw error;
  return data as Material;
}

// ── 常青內容回收 ───────────────────────────────────────────────
// 純函式：判斷某常青素材是否「到期」可再排（上次重排早於 minDays 天前，或從未重排）。可測。
export function isEvergreenDue(lastAt: string | null | undefined, nowMs: number, minDays: number): boolean {
  if (!lastAt) return true;
  const t = Date.parse(lastAt);
  if (Number.isNaN(t)) return true;
  return nowMs - t >= minDays * 86400_000;
}

// 開關某素材的常青回收（多租戶：以 owner_id 過濾）。開啟時不動 last_at（讓它立即可被排）。
export async function setMaterialEvergreen(id: string, ownerId: string, on: boolean): Promise<boolean> {
  if (isDemoMode) {
    const m = demo.materials.find((x) => x.id === id);
    if (m) m.evergreen = on;
    return Boolean(m);
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("materials")
    .update({ evergreen: on })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`更新常青設定失敗：${error.message}`);
  return Boolean(data);
}

// 背景 worker：跨租戶取「常青且到期」的有效素材（含 owner_id）。僅 cron 呼叫；建草稿時仍以該列 owner_id 為準。
export async function listEvergreenDueAll(minDays: number, limit = 20): Promise<Material[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const cutoff = new Date(Date.now() - minDays * 86400_000).toISOString();
  const { data } = await sb
    .from("materials")
    .select("*")
    .eq("evergreen", true)
    .eq("affiliate_valid", true)
    .or(`evergreen_last_at.is.null,evergreen_last_at.lt.${cutoff}`)
    .order("evergreen_last_at", { ascending: true, nullsFirst: true })
    .limit(limit);
  return (data ?? []) as Material[];
}

// 標記某素材剛完成一次常青重排。
export async function touchEvergreen(id: string): Promise<void> {
  if (isDemoMode) {
    const m = demo.materials.find((x) => x.id === id);
    if (m) m.evergreen_last_at = new Date().toISOString();
    return;
  }
  const sb = getServiceClient()!;
  await sb.from("materials").update({ evergreen_last_at: new Date().toISOString() }).eq("id", id);
}

// ── 共享庫 ───────────────────────────────────────────────
// 公共池對外投影：不含分潤連結/subId（那是各人自己的）。
export type SharedMaterial = {
  id: string;
  owner_id: string | null;
  shop_id: string;
  item_id: string;
  product_name: string | null;
  clean_product_url: string | null;
  media_type: "image" | "video" | "none" | null;
  cloudinary_media_url: string | null;
  main_text: string | null;
  reply_text: string | null;
  import_count: number;
  favorite_count: number;
  review_status: string | null;
  created_at: string;
};

// 依「原始商品」(shop_id+item_id) 去重，保留每個商品被匯入最多的一筆（others 已依 import_count 排序）。純函式可測。
export function dedupeSharedByProduct(rows: SharedMaterial[]): SharedMaterial[] {
  const seen = new Set<string>();
  const out: SharedMaterial[] = [];
  for (const m of rows) {
    const key = `${m.shop_id}:${m.item_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

// 開關某素材是否分享進公共池（多租戶：owner_id 過濾）。
export async function setMaterialShared(id: string, ownerId: string, on: boolean): Promise<boolean> {
  if (isDemoMode) {
    const m = demo.materials.find((x) => x.id === id);
    if (m) m.shared = on;
    return Boolean(m);
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("materials")
    .update({ shared: on })
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw new Error(`更新分享設定失敗：${error.message}`);
  return Boolean(data);
}

const SHARED_COLS =
  "id, owner_id, shop_id, item_id, product_name, clean_product_url, media_type, cloudinary_media_url, main_text, reply_text, import_count, favorite_count, review_status, created_at";

// 列出公共池（排除瀏覽者自己的、排除已下架；不含分潤連結）。
// 推薦排序：匯入數＋收藏數加權（favorite_count 權重較高）→ 頂級素材優先；再依商品去重。
export async function listSharedMaterials(viewerOwnerId: string, limit = 60): Promise<SharedMaterial[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  // 多抓一些（去重前），讓同商品的多筆不會佔滿名額。
  const { data } = await sb
    .from("materials")
    .select(SHARED_COLS)
    .eq("shared", true)
    .eq("affiliate_valid", true)
    .neq("review_status", "removed")
    .neq("owner_id", viewerOwnerId)
    .order("favorite_count", { ascending: false })
    .order("import_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  return dedupeSharedByProduct((data ?? []) as SharedMaterial[]).slice(0, limit);
}

// 審核佇列（reviewer/管理員用）：列出所有共享中的素材，含已下架與 pending，最新在前。
export async function listSharedForReview(limit = 100): Promise<SharedMaterial[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select(SHARED_COLS)
    .eq("shared", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as SharedMaterial[];
}

// 審核：設定共享素材的審核狀態（reviewer/管理員跨租戶操作，故不帶 owner 過濾；權限在 API 層把關）。
export async function setMaterialReview(id: string, status: "approved" | "removed" | "pending"): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.from("materials").update({ review_status: status }).eq("id", id);
  if (error) throw new Error(`更新審核狀態失敗：${error.message}`);
}

// 切換收藏（高黏著度）：回傳切換後是否為「已收藏」。原子於 DB（RPC）。
export async function toggleMaterialFavorite(ownerId: string, id: string): Promise<boolean> {
  if (isDemoMode) return false;
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("toggle_material_favorite", { p_owner: ownerId, p_id: id });
  if (error) throw new Error(`切換收藏失敗：${error.message}`);
  return Boolean(data);
}

// 取瀏覽者已收藏的素材 id 集合（用於共享庫標示收藏狀態）。
export async function listFavoritedIds(ownerId: string, ids: string[]): Promise<Set<string>> {
  if (isDemoMode || ids.length === 0) return new Set();
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("material_favorites")
    .select("material_id")
    .eq("owner_id", ownerId)
    .in("material_id", ids);
  return new Set((data ?? []).map((r) => r.material_id as string));
}

// 選品雷達：全站（含自己）最熱門的共享商品，依「匯入＋收藏」加權分數排序、再依商品去重。
// 與 listSharedMaterials 不同：不排除瀏覽者自己（雷達是全站熱度榜，純探索用）。
export async function listHotProducts(limit = 12): Promise<SharedMaterial[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select(SHARED_COLS)
    .eq("shared", true)
    .eq("affiliate_valid", true)
    .neq("review_status", "removed")
    .order("favorite_count", { ascending: false })
    .order("import_count", { ascending: false })
    .limit(limit * 4);
  const rows = (data ?? []) as SharedMaterial[];
  const score = (m: SharedMaterial) => Math.max(0, m.import_count) + Math.max(0, m.favorite_count) * 2;
  rows.sort((a, b) => score(b) - score(a));
  return dedupeSharedByProduct(rows).slice(0, limit);
}

// 取一筆共享素材（供匯入：需 clean_product_url；任何登入者可匯入，故不帶 owner 過濾，但必須 shared）。
export async function getSharedMaterial(id: string): Promise<SharedMaterial | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select(SHARED_COLS)
    .eq("id", id)
    .eq("shared", true)
    .neq("review_status", "removed")
    .maybeSingle();
  return (data as SharedMaterial) ?? null;
}

// 累加被匯入次數（資料庫端原子 +1，避免競態與多次往返）。
export async function incrementImportCount(id: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb.rpc("increment_material_import", { p_id: id });
  if (error) throw new Error(`累加匯入次數失敗：${error.message}`);
}

// 刪除自己的素材（限本人）。回傳是否真的刪到。
// 註：貢獻分數由 SQL 即時從 materials 表計算（被匯入次數＋分享篇數），刪除後分數自然下降，無需另行扣分。
export async function deleteMaterial(id: string, ownerId: string): Promise<boolean> {
  if (isDemoMode) {
    // 與非 demo 分支一致地帶 owner_id 過濾，維持多租戶授權語義。
    const i = demo.materials.findIndex((m) => m.id === id && m.owner_id === ownerId);
    if (i < 0) return false;
    demo.materials.splice(i, 1);
    return true;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("materials")
    .delete()
    .eq("id", id)
    .eq("owner_id", ownerId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

// 貢獻分數＝被匯入次數 + 分享中素材篇數 + 資料貢獻紅利（單一來源走 DB RPC，見 migration 0042）。
export async function getContributionScore(ownerId: string): Promise<number> {
  if (isDemoMode) return 0;
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("get_contribution_score", { p_owner: ownerId });
  if (error) throw new Error(`取得貢獻分數失敗：${error.message}`);
  return (data as number) ?? 0;
}

// 資料貢獻紅利＋n（用自己金鑰把分享進池的素材補上商品資料時記一次）。
export async function incrementContributionBonus(ownerId: string, n = 1): Promise<void> {
  if (isDemoMode || n <= 0) return;
  const sb = getServiceClient()!;
  await sb.rpc("increment_contribution_bonus", { p_owner: ownerId, p_n: n });
}

// 連結健檢 worker 用：取最久沒檢查、目前仍有效的素材（跨租戶）。
// 健檢用的精簡素材投影（含重產所需欄位）。
export type MaterialToCheck = {
  id: string;
  owner_id: string | null;
  shop_id: string;
  item_id: string;
  clean_product_url: string | null;
  link: string;
  affiliate_sub_id: string | null;
  shared: boolean; // 是否分享進公共池（資料貢獻紅利判定）
  commission_rate: string | null; // 現有分潤率（null＝尚未補上，首次補上記紅利）
};
// ownerId 有值時只撈該 owner 的素材（owner 手動觸發健檢用）；null = 全租戶（cron worker）。
export async function listMaterialsToCheck(
  limit = 30,
  ownerId: string | null = null
): Promise<MaterialToCheck[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  let q = sb
    .from("materials")
    .select("id, owner_id, shop_id, item_id, clean_product_url, affiliate_short_link, affiliate_sub_id, affiliate_checked_at, shared, commission_rate")
    .eq("affiliate_valid", true)
    .not("affiliate_short_link", "is", null);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { data } = await q.order("affiliate_checked_at", { ascending: true, nullsFirst: true }).limit(limit);
  return (data ?? [])
    .filter((m) => m.affiliate_short_link)
    .map((m) => ({
      id: m.id,
      owner_id: m.owner_id ?? null,
      shop_id: m.shop_id,
      item_id: m.item_id,
      clean_product_url: m.clean_product_url ?? null,
      link: m.affiliate_short_link as string,
      affiliate_sub_id: m.affiliate_sub_id ?? null,
      shared: Boolean(m.shared),
      commission_rate: m.commission_rate ?? null
    }));
}

// 重產成功：寫回新短連結＋subId，並把 valid/checked_at 一併更新（單次寫入）。
// 多租戶：service-role 繞 RLS，故以 owner_id 應用層過濾（ownerId 為 null 時退回僅 id，理論上素材必有 owner）。
export async function reviveAffiliateLink(
  id: string,
  ownerId: string | null,
  shortLink: string,
  subId: string | null
): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  let q = sb
    .from("materials")
    .update({
      affiliate_short_link: shortLink,
      affiliate_sub_id: subId,
      affiliate_generated_at: new Date().toISOString(),
      affiliate_valid: true,
      affiliate_checked_at: new Date().toISOString()
    })
    .eq("id", id);
  if (ownerId) q = q.eq("owner_id", ownerId);
  const { error } = await q;
  if (error) throw new Error(`寫回重產連結失敗：${error.message}`);
}

// 寫回健檢結果：更新 checked_at；dead=true 才標 affiliate_valid=false（保守）。
export async function setAffiliateChecked(id: string, dead: boolean): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const patch: Record<string, unknown> = { affiliate_checked_at: new Date().toISOString() };
  if (dead) patch.affiliate_valid = false;
  await sb.from("materials").update(patch).eq("id", id);
}

// 更新素材目前分潤率（顯示用）：健檢時順手刷新，附查詢時間。限本人。
export async function setMaterialCommission(
  id: string,
  ownerId: string,
  rate: string | null,
  checkedAt: string
): Promise<void> {
  if (isDemoMode) {
    const m = demo.materials.find((x) => x.id === id);
    if (m) Object.assign(m, { commission_rate: rate, commission_checked_at: checkedAt });
    return;
  }
  const sb = getServiceClient()!;
  await sb
    .from("materials")
    .update({ commission_rate: rate, commission_checked_at: checkedAt })
    .eq("id", id)
    .eq("owner_id", ownerId);
}
