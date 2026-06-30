import * as React from "react";
import { cookies } from "next/headers";

// React 的「每請求」去重 cache 只在 Next server 端的 react-server build 提供；
// 純 Node（單元測試以 tsx 載入的 react）沒有 cache → 退回 identity（不去重，行為仍正確）。
// 簽名保留各呼叫端的參數與回傳型別（未來帶參數的函式也能共用此去重），不用 any。
const cache: <A extends unknown[], R>(fn: (...args: A) => R) => (...args: A) => R =
  (React.cache as typeof cache | undefined) ?? ((fn) => fn);
import { getSessionClient } from "@/lib/supabase/clients";
import { log } from "@/lib/logger";
import { getServiceClient } from "@/lib/supabase/server";
import { env, isDemoMode } from "@/lib/env";
import { VIEW_AS_COOKIE, VIEW_AS_MEMBER_PREVIEW } from "@/lib/view-as";
import type { User } from "@supabase/supabase-js";

// view-as 共用常量集中於 @/lib/view-as（純值、client/server 共用，避免前後端字串漂移）；re-export 維持既有匯入。
// 安全：view_as cookie 僅當「真實登入者是平台管理者」時才被 getCurrentUser 認可（見下），非管理者一律忽略。
export { VIEW_AS_COOKIE, VIEW_AS_MEMBER_PREVIEW };

export interface AppUser {
  id: string;
  email: string | null;
  isOwner: boolean;
  // 真實登入者是否為平台管理者（不受 view-as 影響；用來顯示切換器/管理入口）。
  isPlatformOwner: boolean;
  // 正在以哪位成員視角檢視（email；null=沒有切換）。
  viewingAsEmail?: string | null;
  // 會員平台暱稱（站內顯示用，header 優先於 email 顯示）；未設回 null。
  displayName?: string | null;
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
// 用 React cache 做「每請求」去重：layout 與 page 同一次 render 各呼叫一次，
// 否則 sb.auth.getUser()（Supabase Auth 網路往返）會被打兩次。cache 僅在單次 request 內有效。
// 取暱稱（best-effort）：display_name 只是顯示用，查詢失敗一律回 null（顯示 email），不擋整頁。
async function fetchDisplayName(id: string): Promise<string | null> {
  if (isDemoMode || !id) return null;
  const sb = getServiceClient();
  if (!sb) return null;
  try {
    const { data } = await sb.from("profiles").select("display_name").eq("id", id).maybeSingle();
    return (data?.display_name as string | null | undefined) ?? null;
  } catch {
    return null;
  }
}

export const getCurrentUser = cache(async function getCurrentUser(): Promise<AppUser | null> {
  const u = await resolveActiveUser();
  if (!u) return null;
  return { ...u, displayName: await fetchDisplayName(u.id) };
});

async function resolveActiveUser(): Promise<AppUser | null> {
  const real = await getRealUser();
  if (!real) return null;
  // 非平台管理者：一律忽略 view-as cookie（防偽造 cookie 越權看他人資料）。
  if (!real.isPlatformOwner) return real;
  try {
    const viewAsId = cookies().get(VIEW_AS_COOKIE)?.value?.trim();
    if (!viewAsId || viewAsId === real.id) return real;
    // 「一般成員視角」預覽：用管理者自己的帳號/資料，但以非管理者身分呈現（看選單/權限差異），唯讀。
    if (viewAsId === VIEW_AS_MEMBER_PREVIEW) {
      return { id: real.id, email: real.email, isOwner: false, isPlatformOwner: true, viewingAsEmail: "一般成員視角（你的帳號）" };
    }
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
  const PER_PAGE = 200;
  const MAX_PAGES = 50; // 安全上限（1 萬人）；達上限仍滿頁＝可能截斷，明確拋出而非靜默漏列
  const out: { id: string; email: string | null }[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw new Error(`列出使用者失敗：${error.message}`); // 中途失敗即拋，避免回傳部分清單看似成功
    for (const u of data.users) out.push({ id: u.id, email: u.email ?? null });
    if (data.users.length < PER_PAGE) return out; // 最後一頁
  }
  // 跑到上限仍是滿頁：寧可報錯也不靜默截斷（避免管理頁誤以為名單完整）。
  throw new Error(`使用者數量超過載入上限（${MAX_PAGES * PER_PAGE}），請調整分頁上限`);
}

// 去重＋上限裁切（純函式可測）：避免重複 id 重複查、單次查詢數量無上限。
export function dedupeCapIds(ids: string[], cap = 200): string[] {
  return Array.from(new Set(ids)).slice(0, Math.max(0, cap));
}

// 依 id 批次取 email（id→email 對照）。只查所需的 id（用 getUserById），避免為了標幾筆而拉全量使用者。
// 單筆查詢失敗只略過該筆（不中斷整頁）；上限保護避免一次打太多。
export async function getUserEmailsByIds(ids: string[]): Promise<Record<string, string>> {
  if (isDemoMode || ids.length === 0) return {};
  const sb = getServiceClient();
  if (!sb) return {};
  const unique = dedupeCapIds(ids, 200);
  const out: Record<string, string> = {};
  await Promise.all(
    unique.map(async (id) => {
      // best-effort：email 只是顯示用，單筆查詢失敗（含拋錯）只記警告並略過，不中斷整頁。
      try {
        const { data, error } = await sb.auth.admin.getUserById(id);
        if (!error && data?.user?.email) out[id] = data.user.email;
        else if (error) log.warn("getUserEmailsByIds 單筆查詢失敗", { id, err: error.message });
      } catch (e) {
        log.warn("getUserEmailsByIds 單筆查詢例外", { id, err: e instanceof Error ? e.message : String(e) });
      }
    })
  );
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
