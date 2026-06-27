import { cookies } from "next/headers";
import { getSessionClient } from "@/lib/supabase/clients";
import { log } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/server";
import { env, isDemoMode } from "@/lib/env";
import type { User } from "@supabase/supabase-js";

// 管理者「以成員視角檢視」用的 cookie（只存被檢視成員的 user id）。
// 安全：僅當「真實登入者是平台管理者」時才被 getCurrentUser 認可（見下），非管理者一律忽略。
export const VIEW_AS_COOKIE = "view_as";

export interface AppUser {
  id: string;
  email: string | null;
  isOwner: boolean;
  // 真實登入者是否為平台管理者（不受 view-as 影響；用來顯示切換器/管理入口）。
  isPlatformOwner: boolean;
  // 正在以哪位成員視角檢視（email；null=沒有切換）。
  viewingAsEmail?: string | null;
}

function baseUser(user: User): { id: string; email: string | null; isOwner: boolean } {
  const email = user.email ?? null;
  return {
    id: user.id,
    email,
    isOwner: Boolean(email && env.ownerEmail && email.toLowerCase() === env.ownerEmail)
  };
}

// 真實登入者（忽略 view-as 切換）。設定/解除 view-as cookie 等需以「真實身分」驗證時用。
export async function getRealUser(): Promise<AppUser | null> {
  if (isDemoMode) {
    return { id: "demo-user", email: env.ownerEmail || "demo@local", isOwner: true, isPlatformOwner: true, viewingAsEmail: null };
  }
  const sb = getSessionClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  if (!user) return null;
  const b = baseUser(user);
  return { ...b, isPlatformOwner: b.isOwner, viewingAsEmail: null };
}

// 取得目前作用中的使用者（未登入回 null）。Demo 模式視為 owner（本機開發）。
// 管理者若設了 view-as cookie，會以「該成員身分」回傳（id/email 換成成員的），
// 使資料層（皆以 user.id 當 owner_id 過濾）自動切到該成員視角（唯讀由 middleware 把關寫入）。
export async function getCurrentUser(): Promise<AppUser | null> {
  const real = await getRealUser();
  if (!real) return null;
  // 非平台管理者：一律忽略 view-as cookie（防偽造 cookie 越權看他人資料）。
  if (!real.isPlatformOwner) return real;
  try {
    const viewAsId = cookies().get(VIEW_AS_COOKIE)?.value?.trim();
    if (!viewAsId || viewAsId === real.id) return real;
    // 先確認該成員確實存在再切換：查無使用者或無法驗證（缺 service client／查詢失敗）一律退回真實身分，
    // 不把未驗證的 view_as id 當成有效身分拿去過濾資料。
    const admin = getServiceClient();
    if (!admin) return real;
    const { data } = await admin.auth.admin.getUserById(viewAsId).catch(() => ({ data: null }) as { data: null });
    const member = data?.user;
    if (!member) return real;
    return { id: member.id, email: member.email ?? null, isOwner: false, isPlatformOwner: true, viewingAsEmail: member.email ?? member.id };
  } catch (err) {
    // view-as 解析任何環節失敗（cookie/service client/admin API）一律退回真實身分，不讓它 500 整頁；記錄以利排查。
    log.error("getCurrentUser view-as 解析失敗", { err: err instanceof Error ? err.message : String(err) });
    return real;
  }
}

// 列出所有平台使用者（管理者「切換成員視角」下拉用）。僅供 owner-only 路由呼叫。
export async function listAllUsers(): Promise<{ id: string; email: string | null }[]> {
  if (isDemoMode) return [];
  const sb = getServiceClient();
  if (!sb) throw new Error("無法取得服務端連線"); // 不靜默回 []（會被誤當成「沒有使用者」）
  const out: { id: string; email: string | null }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`列出使用者失敗：${error.message}`); // 中途失敗即拋，避免回傳部分清單看似成功
    for (const u of data.users) out.push({ id: u.id, email: u.email ?? null });
    if (data.users.length < 200) break;
  }
  return out;
}

// 解析 owner 的 user id（給背景排程/pipeline 標記 owner_id 用）。
let cachedOwnerId: string | null = null;
export async function getOwnerUserId(): Promise<string | null> {
  if (isDemoMode) return "demo-user";
  if (cachedOwnerId) return cachedOwnerId;
  if (!env.ownerEmail) return null;
  const sb = getServiceClient();
  if (!sb) return null;
  // 用 admin API 依 email 找 owner；分頁處理避免 owner 不在第一頁
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      log.error("getOwnerUserId listUsers 失敗", { err: error.message });
      return null;
    }
    const owner = data.users.find((u) => u.email?.toLowerCase() === env.ownerEmail);
    if (owner) {
      cachedOwnerId = owner.id;
      return cachedOwnerId;
    }
    if (data.users.length < 200) break; // 最後一頁
  }
  return null;
}
