import { getSessionClient } from "@/lib/supabase/clients";
import { getServiceClient } from "@/lib/supabase/server";
import { env, isDemoMode } from "@/lib/env";
import type { User } from "@supabase/supabase-js";

export interface AppUser {
  id: string;
  email: string | null;
  isOwner: boolean;
}

function toAppUser(user: User): AppUser {
  const email = user.email ?? null;
  return {
    id: user.id,
    email,
    isOwner: Boolean(email && env.ownerEmail && email.toLowerCase() === env.ownerEmail)
  };
}

// 取得目前登入者（未登入回 null）。Demo 模式視為 owner（本機開發）。
export async function getCurrentUser(): Promise<AppUser | null> {
  if (isDemoMode) {
    return { id: "demo-user", email: env.ownerEmail || "demo@local", isOwner: true };
  }
  const sb = getSessionClient();
  const {
    data: { user }
  } = await sb.auth.getUser();
  return user ? toAppUser(user) : null;
}

// 解析 owner 的 user id（給背景排程/pipeline 標記 owner_id 用）。
let cachedOwnerId: string | null = null;
export async function getOwnerUserId(): Promise<string | null> {
  if (isDemoMode) return "demo-user";
  if (cachedOwnerId) return cachedOwnerId;
  if (!env.ownerEmail) return null;
  const sb = getServiceClient();
  if (!sb) return null;
  // 用 admin API 依 email 找 owner
  const { data } = await sb.auth.admin.listUsers();
  const owner = data?.users.find((u) => u.email?.toLowerCase() === env.ownerEmail);
  cachedOwnerId = owner?.id ?? null;
  return cachedOwnerId;
}
