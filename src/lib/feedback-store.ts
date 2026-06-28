// 意見回饋／工單資料層（對應 0051_feedback.sql）。
// 多租戶：一般使用者只讀寫自己的工單（以 owner_id 過濾）；管理員（isOwner）走 service-role 讀寫全部。
// 由呼叫端（API route）負責 isOwner 授權判斷，本層只提供「限本人」與「管理員全域」兩組函式。
import { randomUUID } from "node:crypto";
import { getServiceClient } from "./supabase/server";
import { isDemoMode } from "./env";
import { demo } from "./demo-store";
import type { Feedback, FeedbackKind, FeedbackStatus } from "./types";

const KINDS: FeedbackKind[] = ["bug", "feature"];
const STATUSES: FeedbackStatus[] = ["open", "in_progress", "resolved", "closed"];

export function isFeedbackKind(v: unknown): v is FeedbackKind {
  return typeof v === "string" && (KINDS as string[]).includes(v);
}
export function isFeedbackStatus(v: unknown): v is FeedbackStatus {
  return typeof v === "string" && (STATUSES as string[]).includes(v);
}

// 列出某使用者自己的工單（新→舊）。
export async function listFeedbackForOwner(ownerId: string): Promise<Feedback[]> {
  if (isDemoMode) {
    return demo.feedback.filter((f) => f.owner_id === ownerId).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb
    .from("feedback")
    .select("*")
    .eq("owner_id", ownerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error; // 不靜默回 []（會被前端誤顯示成「沒有工單」，掩蓋 DB 故障）
  return (data ?? []) as Feedback[];
}

// 管理員：列出全部工單（新→舊）。呼叫端須先驗證 isOwner。
export async function listAllFeedback(): Promise<Feedback[]> {
  if (isDemoMode) {
    return [...demo.feedback].sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("feedback").select("*").order("created_at", { ascending: false }).limit(500);
  if (error) throw error; // 同上：DB 故障要拋，不偽裝成「沒有工單」
  return (data ?? []) as Feedback[];
}

// 送出一筆工單（送出者＝ownerId）。
export async function createFeedback(
  input: { kind: FeedbackKind; title: string; message: string },
  ownerId: string
): Promise<Feedback> {
  const row = {
    kind: input.kind,
    title: input.title,
    message: input.message,
    status: "open" as FeedbackStatus,
    owner_id: ownerId
  };
  if (isDemoMode) {
    const fb: Feedback = { id: randomUUID(), created_at: new Date().toISOString(), admin_reply: null, ...row };
    demo.feedback.unshift(fb);
    return fb;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("feedback").insert(row).select().single();
  if (error) throw error;
  return data as Feedback;
}

// 管理員：回覆並/或更新狀態（不以 owner_id 過濾，呼叫端須先驗證 isOwner）。
export async function replyFeedbackAsAdmin(
  id: string,
  patch: { admin_reply?: string | null; status?: FeedbackStatus }
): Promise<Feedback | null> {
  const update: Record<string, unknown> = {};
  if (patch.admin_reply !== undefined) {
    // 空字串視為「清空回覆」→ 存 null，replied_at 同步歸零，避免空白回覆殘留。
    const reply = patch.admin_reply || null;
    update.admin_reply = reply;
    update.replied_at = reply ? new Date().toISOString() : null;
  }
  if (patch.status !== undefined) update.status = patch.status;
  if (Object.keys(update).length === 0) return null;

  if (isDemoMode) {
    const fb = demo.feedback.find((f) => f.id === id);
    if (!fb) return null;
    Object.assign(fb, update, { updated_at: new Date().toISOString() });
    return fb;
  }
  const sb = getServiceClient()!;
  const { data, error } = await sb.from("feedback").update(update).eq("id", id).select().maybeSingle();
  if (error) throw error;
  return (data as Feedback) ?? null;
}
