// AI 代理人執行：抓來源（RSS）→ 去重 → 依人格改寫 → 建草稿（待人工核准）。
// 重用 owner 自綁 Gemini 金鑰、text-similarity 去重、drafts 建立、（選）go2read 短連結。
import { createHash } from "node:crypto";
import { geminiText } from "@/services/ai/gemini";
import { fetchRssItems, type RssItem } from "@/services/ai/rss";
import { getGeminiKey, getDefaultAffiliateUrl } from "@/lib/credentials";
import { getAiDomain, defaultFeedsForDomain, googleNewsRss } from "@/lib/ai-domains";
import { maxSimilarity } from "@/lib/text-similarity";
import { createDraft } from "@/lib/drafts-store";
import { notifyDraftPendingForReview } from "@/services/telegram/review";
import { userOwnsThreadsAccount } from "@/lib/store";
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

const EMOJI_RULE: Record<string, string> = {
  none: "不要使用 emoji。",
  light: "可少量使用 emoji。",
  heavy: "適度多用 emoji 增加親和力。"
};

// 組產文 prompt。純函式可測。
export function buildAgentPrompt(agent: AiAgent, item: { title: string; description: string }): string {
  const domain = getAiDomain(agent.domain);
  const emoji = EMOJI_RULE[agent.emoji_level] ?? EMOJI_RULE.light;
  const tags = agent.hashtag_pool.length ? `結尾可加入這些 hashtag（擇要）：${agent.hashtag_pool.join(" ")}。` : "";
  const sensitive = domain?.sensitive
    ? "務必保守：不誹謗、不臆測未經證實的指控、不洩漏個資、不煽動對立，立場中性。"
    : "";
  return [
    `你是社群寫手「${agent.name}」。風格：${agent.tone || "自然、口語"}。領域：${domain?.label ?? agent.domain}。`,
    `根據以下新聞素材，寫一篇繁體中文 Threads 貼文，約 ${agent.length} 字，口吻一致、像真人分享，不要像新聞稿、不要逐字照抄。`,
    `${emoji}${tags}${sensitive}`,
    `只輸出貼文正文，不要前言、不要 markdown、不要加「來源」。`,
    ``,
    `素材標題：${item.title}`,
    `素材摘要：${item.description || "（無摘要，請依標題發揮但不要捏造具體數據）"}`
  ].join("\n");
}

// 抓來源項目（目前支援 rss；空 feeds 用領域預設 Google News RSS）。
async function fetchItems(agent: AiAgent): Promise<RssItem[]> {
  let feeds = agent.rss_feeds.length ? agent.rss_feeds : defaultFeedsForDomain(agent.domain);
  // 自訂主題（或領域無預設）：用 search_query 組 Google News RSS。
  if (!feeds.length && agent.search_query.trim()) feeds = [googleNewsRss(agent.search_query.trim())];
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
  // 預設分潤連結：走 go2read 中轉時，「繼續」要去的分潤連結（使用者一次設定、套用所有代理人貼文）。
  const defaultAffiliateUrl = agent.use_redirect
    ? await getDefaultAffiliateUrl(agent.owner_id).catch((err) => {
        log.error("取得代理人預設分潤連結失敗", { agentId: agent.id, err });
        return null;
      })
    : null;

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

    // 來源連結：選擇走 go2read 短連結（可附分潤）或原始連結
    let sourceUrl = item.link;
    if (agent.use_redirect) {
      const code = await createRedirectLink(agent.owner_id, {
        sourceUrl: item.link,
        affiliateUrl: defaultAffiliateUrl, // 預設分潤連結（未設則中轉頁僅去來源）
        title: item.title
      }).catch(() => null);
      if (code) sourceUrl = `/r/${code}`; // 對外請搭配 NEXT_PUBLIC_SHORT_DOMAIN 顯示完整網域
    }
    const mainText = `${body}\n\n📎 來源：${sourceUrl}`;

    const draft = await createDraft({
      owner_id: agent.owner_id,
      threads_account_id: agent.threads_account_id,
      main_text: mainText,
      reply_text: null,
      status: "draft",
      source_agent_id: agent.id
    });
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
