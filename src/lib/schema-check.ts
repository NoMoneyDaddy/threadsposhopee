// Migration 漏套偵測：App 執行期不跑 migration（service-role 走 PostgREST 無法 DDL），
// 靠人記得每加一個 migration 就套到正式。此檢查在部署後探測「近期 migration 應存在的欄位／RPC」，
// 缺漏就回報 → 由 cron 每日告警，把漏套從「執行期 500」前移為可見警示。純讀取、無副作用。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

// 探測項：以「近期 migration 新增、且被程式碼實際依賴」的欄位／RPC 為主（讀取即可驗證存在）。
async function probeColumn(table: string, column: string): Promise<boolean> {
  const sb = getServiceClient()!;
  const { error } = await sb.from(table).select(column).limit(1);
  return !error;
}
async function probeReadOnlyRpc(fn: string, args: Record<string, unknown>): Promise<boolean> {
  const sb = getServiceClient()!;
  const { error } = await sb.rpc(fn, args);
  return !error;
}

// 回傳缺漏的 schema 物件清單（空陣列＝一致）。demo 略過。
export async function checkSchemaDrift(): Promise<{ ok: boolean; missing: string[] }> {
  if (isDemoMode) return { ok: true, missing: [] };
  const checks: { name: string; run: () => Promise<boolean> }[] = [
    { name: "profiles.imports_used (0066)", run: () => probeColumn("profiles", "imports_used") },
    { name: "profiles.default_share_materials (0062)", run: () => probeColumn("profiles", "default_share_materials") },
    { name: "post_metrics (0064)", run: () => probeColumn("post_metrics", "post_id") },
    { name: "get_contribution_score (0065)", run: () => probeReadOnlyRpc("get_contribution_score", { p_owner: "00000000-0000-0000-0000-000000000000" }) },
    { name: "product_published_counts (0068)", run: () => probeReadOnlyRpc("product_published_counts", {}) }
  ];
  const missing: string[] = [];
  for (const c of checks) {
    const ok = await c.run().catch(() => false);
    if (!ok) missing.push(c.name);
  }
  return { ok: missing.length === 0, missing };
}
