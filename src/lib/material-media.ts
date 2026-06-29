import type { DraftMedia, ThreadSegment } from "@/lib/types";

// 素材媒體（統一清單，每項帶 slot）↔ 草稿主文/留言兩陣列的轉換。純函式、可測。
// slot 規則：main＝只主文、reply＝只留言、both＝兩邊都放；未設視同 main（向後相容舊素材）。

// 拆：把素材的統一媒體清單拆成草稿要的 { main, reply } 兩陣列。
// both 的項目同時進兩邊（同一張重複用，只存一份引用）。輸出去掉 slot 欄（草稿層不需要）。
export function splitMaterialMedia(media: DraftMedia[] | null | undefined): { main: DraftMedia[]; reply: DraftMedia[] } {
  const main: DraftMedia[] = [];
  const reply: DraftMedia[] = [];
  for (const m of media ?? []) {
    if (!m || typeof m.url !== "string" || !m.url || (m.type !== "image" && m.type !== "video")) continue;
    const item = { url: m.url, type: m.type };
    // 防禦：只有明確 reply/both 才進留言；其餘（main、未設、甚至非預期值）一律當主文，避免無效值靜默丟失媒體。
    if (m.slot === "reply" || m.slot === "both") reply.push(item);
    if (m.slot !== "reply") main.push(item);
  }
  return { main, reply };
}

// 併：把草稿的主文/留言兩陣列併回素材的統一媒體清單，依 url 去重並標 slot。
// 同時出現在主文與留言＝both（只存一份）；只在一邊＝main 或 reply。保留主文順序、留言獨有者接在後面。
export function mergeToMaterialMedia(
  mainMedia: DraftMedia[] | null | undefined,
  replyMedia: DraftMedia[] | null | undefined
): DraftMedia[] {
  const valid = (m: DraftMedia | null | undefined): m is DraftMedia =>
    Boolean(m) && typeof m!.url === "string" && Boolean(m!.url) && (m!.type === "image" || m!.type === "video");
  const replyUrls = new Set((replyMedia ?? []).filter(valid).map((m) => m.url));
  const out: DraftMedia[] = [];
  const seen = new Set<string>();
  for (const m of (mainMedia ?? []).filter(valid)) {
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    out.push({ url: m.url, type: m.type, slot: replyUrls.has(m.url) ? "both" : "main" });
  }
  for (const m of (replyMedia ?? []).filter(valid)) {
    if (seen.has(m.url)) continue; // 已在主文（標過 both/main）
    seen.add(m.url);
    out.push({ url: m.url, type: m.type, slot: "reply" });
  }
  return out;
}

// 清洗外部傳入的多段串文（API body）：每段 text 取字串（否則 null）、media 過 sanitize（去 slot），
// 並濾掉「無文字且無媒體」的空段落、最多 10 段（與發文 MAX_EXTRA_SEGMENTS 一致）。純函式可測。
export function sanitizeThreadSegments(input: unknown): ThreadSegment[] {
  if (!Array.isArray(input)) return [];
  const out: ThreadSegment[] = [];
  for (const raw of input) {
    const seg = raw as { text?: unknown; media?: unknown } | null;
    if (!seg || typeof seg !== "object") continue;
    const text = typeof seg.text === "string" ? seg.text : null;
    // 段落媒體無 slot 概念：取 url+type 即可（去掉 sanitizeMaterialMedia 標的 slot）。
    const media = sanitizeMaterialMedia(seg.media).map((m) => ({ url: m.url, type: m.type }));
    if (!(text && text.trim()) && media.length === 0) continue; // 空段落丟棄
    out.push({ text, media });
    if (out.length >= 10) break;
  }
  return out;
}

// 清洗外部傳入的素材媒體清單（API body）：濾掉無效項（缺 url／type 非 image/video），
// slot 夾成 main/reply/both（未設或非法 → main），依 url 去重保序。純函式可測。
export function sanitizeMaterialMedia(input: unknown): DraftMedia[] {
  if (!Array.isArray(input)) return [];
  const out: DraftMedia[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const m = raw as Partial<DraftMedia> | null;
    if (!m || typeof m.url !== "string" || !m.url) continue;
    if (m.type !== "image" && m.type !== "video") continue;
    if (seen.has(m.url)) continue;
    seen.add(m.url);
    const slot: DraftMedia["slot"] = m.slot === "reply" || m.slot === "both" ? m.slot : "main";
    out.push({ url: m.url, type: m.type, slot });
  }
  return out;
}
