// AI 代理人執行：抓來源（RSS）→ 去重 → 依人格改寫 → 建草稿（待人工核准）。
// 重用 owner 自綁 Gemini 金鑰、text-similarity 去重、drafts 建立、（選）go2read 短連結。
import { createHash } from "node:crypto";
import { geminiText } from "@/services/ai/gemini";
import { fetchRssItems, type RssItem } from "@/services/ai/rss";
import { getGeminiKey } from "@/lib/credentials";
import { getAiDomain, defaultFeedsForDomain, googleNewsRss, resolveDomainIds } from "@/lib/ai-domains";
import { maxSimilarity } from "@/lib/text-similarity";
import { createDraft } from "@/lib/drafts-store";
import { notifyDraftPendingForReview } from "@/services/telegram/review";
import { autoScheduleApproved } from "@/services/publish/auto-schedule";
import { userOwnsThreadsAccount, getThreadsCredentials, listThreadsAccountTokens } from "@/lib/store";
import { keywordSearch } from "@/services/threads/search";
import { createRedirectLink } from "@/lib/redirect-store";
import {
  listEnabledAiAgentsAll,
  hasSeen,
  markSeen,
  recentSeenTitles,
  setAgentLastRun,
  type AiAgent
} from "@/lib/agents-store";
import { log } from "@/lib/logger";

const SEEN_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const TITLE_SIM_THRESHOLD = 0.6;
const RUN_GUARD_MS = 20 * 60 * 60 * 1000; // 每代理人每日約一次

// 來源去重鍵：連結正規化後 SHA-1。純函式。
export function sourceHash(link: string): string {
  return createHash("sha1").update(link.trim()).digest("hex");
}

// 組短連結來源網址（純函式可測）：貼文會發到 Threads，連結須為絕對網址。
// 有設短網域 → `<短網域>/r/<code>`（去尾斜線）；未設短網域 → 退回原始絕對連結 fallback
//（絕不輸出相對 /r/<code>，否則貼到 Threads 會失效）。
export function buildShortSourceUrl(code: string, shortDomain: string | undefined | null, fallback: string): string {
  const base = (shortDomain ?? "").replace(/\/+$/, "");
  return base ? `${base}/r/${code}` : fallback;
}

const EMOJI_RULE: Record<string, string> = {
  none: "不要使用 emoji。",
  light: "可少量使用 emoji。",
  heavy: "適度多用 emoji 增加親和力。"
};

// 組產文 prompt。純函式可測。
export function buildAgentPrompt(agent: AiAgent, item: { title: string; description: string }): string {
  const domains = resolveDomainIds(agent)
    .map((id) => getAiDomain(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  // 回退單一 domain 時也轉成顯示標籤（避免把內部 id 寫進提示詞）。
  const label = domains.length ? domains.map((d) => d.label).join("、") : (getAiDomain(agent.domain)?.label ?? agent.domain);
  const emoji = EMOJI_RULE[agent.emoji_level] ?? EMOJI_RULE.light;
  const tags = agent.hashtag_pool.length ? `結尾可加入這些 hashtag（擇要）：${agent.hashtag_pool.join(" ")}。` : "";
  // 任一領域屬敏感即加保守規則。
  const sensitive = domains.some((d) => d.sensitive)
    ? "務必保守：不誹謗、不臆測未經證實的指控、不洩漏個資、不煽動對立，立場中性。"
    : "";
  return [
    `你是社群寫手「${agent.name}」。風格：${agent.tone?.trim() || "自動——依這篇內容選最合適、自然的口吻"}。領域：${label}。`,
    `根據以下素材，寫一篇繁體中文 Threads 貼文，約 ${agent.length} 字，口吻一致、像真人分享，不要像新聞稿、不要逐字照抄。`,
    `${emoji}${tags}${sensitive}`,
    `只輸出貼文正文，不要前言、不要 markdown、不要加「來源」。`,
    ``,
    `素材標題：${item.title}`,
    `素材摘要：${item.description || "（無摘要，請依標題發揮但不要捏造具體數據）"}`
  ].join("\n");
}

// Threads 關鍵字搜尋取材的查詢詞：優先用自訂關鍵字，否則用各領域標籤。純函式可測。
export function searchQueriesForAgent(agent: AiAgent): string[] {
  const custom = agent.search_query.trim();
  if (custom) return [custom];
  const labels = resolveDomainIds(agent)
    .map((id) => getAiDomain(id)?.label)
    .filter((l): l is string => Boolean(l));
  return labels.length ? labels : [getAiDomain(agent.domain)?.label ?? agent.domain].filter(Boolean);
}

// 候選 Threads token（依序）：優先指定發文帳號，再補 owner 其他啟用帳號（去重）。
// 多帳號時若第一個未授權 keyword_search，可換下一個重試。錯誤記錄而非靜默吞，避免遮蔽 DB/權限問題。
const MAX_SEARCH_TOKENS = 3;
async function resolveAgentThreadsTokens(agent: AiAgent): Promise<string[]> {
  const out: string[] = [];
  if (agent.threads_account_id) {
    const cred = await getThreadsCredentials(agent.threads_account_id, agent.owner_id).catch((err) => {
      log.warn("取代理人指定帳號 token 失敗", { agentId: agent.id, threadsAccountId: agent.threads_account_id, err: err instanceof Error ? err.message : String(err) });
      return null;
    });
    if (cred?.accessToken) out.push(cred.accessToken);
  }
  const tokens = await listThreadsAccountTokens(agent.owner_id).catch((err) => {
    log.warn("列出代理人 owner Threads token 失敗", { agentId: agent.id, err: err instanceof Error ? err.message : String(err) });
    return [] as { id: string; accessToken: string }[];
  });
  for (const t of tokens) if (t.accessToken && !out.includes(t.accessToken)) out.push(t.accessToken);
  return out.slice(0, MAX_SEARCH_TOKENS);
}

// Threads 關鍵字搜尋取材：用 owner token 搜熱門公開貼文，回正規化 RssItem。
// 多查詢詞並行（避免逐一逾時拉長 cron）；多 token 時逐一嘗試直到取到項目（容忍部分帳號未授權）。
// 無 token / 全部取不到回 []，呼叫端據此回報「來源無項目」。
async function fetchThreadsSearchItems(agent: AiAgent): Promise<RssItem[]> {
  const tokens = await resolveAgentThreadsTokens(agent);
  if (!tokens.length) {
    log.warn("代理人 Threads 關鍵字取材無可用 token", { agentId: agent.id });
    return [];
  }
  const queries = searchQueriesForAgent(agent);
  for (const token of tokens) {
    const results = await Promise.all(queries.map((q) => keywordSearch(q, token)));
    const items = results.flat().slice(0, 30);
    if (items.length) return items; // 此 token 有結果即用；否則換下一個（可能未授權/額度）
  }
  return [];
}

// 抓來源項目。source_mode="threads_search"＝Threads 關鍵字搜尋；其餘＝RSS（空 feeds 用領域預設 Google News RSS）。
async function fetchItems(agent: AiAgent): Promise<RssItem[]> {
  if (agent.source_mode === "threads_search") return fetchThreadsSearchItems(agent);
  let feeds: string[] = [];
  if (agent.rss_feeds.length) {
    feeds = agent.rss_feeds;
  } else {
    for (const id of resolveDomainIds(agent)) {
      // 自訂主題用 search_query 組查詢（其 keyword 為空）；其餘用領域預設 Google News RSS。
      if (id === "custom") {
        if (agent.search_query.trim()) feeds.push(googleNewsRss(agent.search_query.trim()));
      } else {
        feeds.push(...defaultFeedsForDomain(id));
      }
    }
    // 完全沒有有效領域但有自訂關鍵字時的保底。
    if (!feeds.length && agent.search_query.trim()) feeds.push(googleNewsRss(agent.search_query.trim()));
  }
  const all: RssItem[] = [];
  for (const f of feeds) {
    all.push(...(await fetchRssItems(f)));
    if (all.length >= 30) break;
  }
  return all;
}

export interface AgentRunResult {
  ok: boolean;
  reason?: string;
  draftId?: string;
}

// 跑一個代理人一次：產出 1 篇草稿。geminiKey 由呼叫端帶入（owner 金鑰）。
export async function runAgentOnce(agent: AiAgent, geminiKey: string): Promise<AgentRunResult> {
  // 帳號歸屬驗證（若有指定發文帳號）
  if (agent.threads_account_id && !(await userOwnsThreadsAccount(agent.threads_account_id, agent.owner_id))) {
    return { ok: false, reason: "發文帳號不屬於此使用者" };
  }

  const items = await fetchItems(agent);
  if (!items.length) return { ok: false, reason: "來源無項目" };

  const recentTitles = await recentSeenTitles(agent.id, SEEN_WINDOW_MS);

  for (const item of items) {
    const hash = sourceHash(item.link);
    if (await hasSeen(agent.id, hash)) continue; // 來源層去重
    if (maxSimilarity(item.title, recentTitles) > TITLE_SIM_THRESHOLD) {
      await markSeen(agent.id, hash, item.title); // 同主題：記下避免重複處理
      continue;
    }

    // 改寫
    const body = (await geminiText(buildAgentPrompt(agent, item), geminiKey, 0.9, Math.max(200, agent.length * 3))).trim();
    if (!body) {
      await markSeen(agent.id, hash, item.title);
      continue;
    }

    // 來源連結：選擇走 go2read 短連結或原始連結
    let sourceUrl = item.link;
    if (agent.use_redirect) {
      const code = await createRedirectLink(agent.owner_id, {
        sourceUrl: item.link,
        title: item.title
      }).catch(() => null);
      // 補全為絕對網址：貼文會發到 Threads，相對路徑會失效。未設短網域時退回原始來源連結（仍為絕對網址）。
      if (code) sourceUrl = buildShortSourceUrl(code, process.env.NEXT_PUBLIC_SHORT_DOMAIN, item.link);
    }
    const mainText = `${body}\n\n📎 來源：${sourceUrl}`;

    // 預設：待人工核准。小編開啟「免審直接排程」時自動排進下一個空時段並標記已核准；無空檔則退回待審保底。
    const makeDraft = (status: "draft" | "approved", scheduled_at: string | null) =>
      createDraft({
        owner_id: agent.owner_id,
        threads_account_id: agent.threads_account_id,
        main_text: mainText,
        reply_text: null,
        status,
        scheduled_at,
        source_agent_id: agent.id
      });
    let draft = agent.auto_publish
      ? await autoScheduleApproved(agent.owner_id, (slot) => makeDraft("approved", slot))
      : null;
    if (!draft) draft = await makeDraft("draft", null);
    await markSeen(agent.id, hash, item.title);
    // 待審草稿推 Telegram（附核准/駁回按鈕）；未綁/未啟用則內部靜默略過。
    if (draft.status === "draft") await notifyDraftPendingForReview(agent.owner_id, draft);
    return { ok: true, draftId: draft.id };
  }
  return { ok: false, reason: "無新主題可寫" };
}

// cron：跑所有已啟用代理人（每代理人每日約一次，靠 last_run_at 守門）。
export async function runAiAgents(now = Date.now()): Promise<{ ran: number; created: number }> {
  const out = { ran: 0, created: 0 };
  const agents = await listEnabledAiAgentsAll().catch(() => []);
  for (const agent of agents) {
    if (agent.last_run_at && now - new Date(agent.last_run_at).getTime() < RUN_GUARD_MS) continue;
    out.ran++;
    try {
      const key = await getGeminiKey(agent.owner_id);
      if (!key) {
        log.warn("代理人無 Gemini 金鑰，略過", { agentId: agent.id });
        await setAgentLastRun(agent.id); // 仍標記，避免每輪重試
        continue;
      }
      const r = await runAgentOnce(agent, key);
      if (r.ok) out.created++;
      await setAgentLastRun(agent.id);
    } catch (e) {
      log.warn("代理人執行失敗", { agentId: agent.id, err: e instanceof Error ? e.message : e });
    }
  }
  return out;
}
