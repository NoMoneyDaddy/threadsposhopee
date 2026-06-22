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
    const material = { id: randomUUID(), affiliate_valid: true, created_at: new Date().toISOString(), ...input } as Material;
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

// ── 共享素材庫 ───────────────────────────────────────────────
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

// 列出公共池（排除瀏覽者自己的；不含分潤連結）。依被匯入次數排序、再依商品去重，回傳前 limit 筆。
export async function listSharedMaterials(viewerOwnerId: string, limit = 60): Promise<SharedMaterial[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  // 多抓一些（去重前），讓同商品的多筆不會佔滿名額。
  const { data } = await sb
    .from("materials")
    .select("id, owner_id, shop_id, item_id, product_name, clean_product_url, media_type, cloudinary_media_url, main_text, reply_text, import_count, created_at")
    .eq("shared", true)
    .eq("affiliate_valid", true)
    .neq("owner_id", viewerOwnerId)
    .order("import_count", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  return dedupeSharedByProduct((data ?? []) as SharedMaterial[]).slice(0, limit);
}

// 取一筆共享素材（供匯入：需 clean_product_url；任何登入者可匯入，故不帶 owner 過濾，但必須 shared）。
export async function getSharedMaterial(id: string): Promise<SharedMaterial | null> {
  if (isDemoMode) return null;
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("materials")
    .select("id, owner_id, product_name, clean_product_url, media_type, cloudinary_media_url, main_text, reply_text, import_count, created_at")
    .eq("id", id)
    .eq("shared", true)
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

// 貢獻分數＝該使用者所有素材被匯入總次數（資料庫端 SUM；不限目前是否仍分享，取消分享不歸零歷史貢獻）。
export async function getContributionScore(ownerId: string): Promise<number> {
  if (isDemoMode) return 0;
  const sb = getServiceClient()!;
  const { data, error } = await sb.rpc("get_contribution_score", { p_owner: ownerId });
  if (error) throw new Error(`取得貢獻分數失敗：${error.message}`);
  return (data as number) ?? 0;
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
    .select("id, owner_id, shop_id, item_id, clean_product_url, affiliate_short_link, affiliate_sub_id, affiliate_checked_at")
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
      affiliate_sub_id: m.affiliate_sub_id ?? null
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
