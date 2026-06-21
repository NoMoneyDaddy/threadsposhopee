// Web Push 訂閱資料層（push_subscriptions）。多租戶：service-role 繞 RLS，一律帶 ownerId 過濾。
// demo 模式無後端 → 視為「未訂閱」（list 回空、add/delete no-op）。
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";

export interface PushSubscriptionRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// 新增／更新訂閱（同 endpoint 直接覆蓋金鑰，避免重複列）。
export async function addPushSubscription(ownerId: string, sub: PushSubscriptionRow): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("push_subscriptions")
    .upsert(
      { owner_id: ownerId, endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
      { onConflict: "endpoint" }
    );
  if (error) throw new Error(`儲存推播訂閱失敗：${error.message}`);
}

export async function listPushSubscriptions(ownerId: string): Promise<PushSubscriptionRow[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient()!;
  const { data } = await sb
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("owner_id", ownerId);
  return (data ?? []) as PushSubscriptionRow[];
}

// 退訂：依 endpoint 刪除（owner 過濾，避免跨租戶刪別人的）。
export async function deletePushSubscription(ownerId: string, endpoint: string): Promise<void> {
  if (isDemoMode) return;
  const sb = getServiceClient()!;
  const { error } = await sb
    .from("push_subscriptions")
    .delete()
    .eq("owner_id", ownerId)
    .eq("endpoint", endpoint);
  if (error) throw new Error(`移除推播訂閱失敗：${error.message}`);
}

// 清除失效 endpoint（推播回 404/410 時呼叫）。不帶 owner：endpoint 全域唯一，且僅由送出失敗觸發。
export async function deletePushSubscriptionsByEndpoint(endpoints: string[]): Promise<void> {
  if (isDemoMode || endpoints.length === 0) return;
  const sb = getServiceClient()!;
  await sb.from("push_subscriptions").delete().in("endpoint", endpoints);
}
