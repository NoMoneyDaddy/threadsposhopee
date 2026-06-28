import { test } from "node:test";
import assert from "node:assert/strict";
import { sourceHash, buildAgentPrompt, buildShortSourceUrl } from "./agent-run";
import { ANTI_AI_SLOP_RULES } from "./humanizer";
import type { AiAgent } from "@/lib/agents-store";

test("sourceHash：穩定、忽略前後空白、不同連結不同", () => {
  assert.equal(sourceHash("https://x/a"), sourceHash("  https://x/a  "));
  assert.notEqual(sourceHash("https://x/a"), sourceHash("https://x/b"));
  assert.match(sourceHash("https://x/a"), /^[0-9a-f]{40}$/);
});

test("buildShortSourceUrl：有短網域→組絕對短連結（去尾斜線）；無短網域→退回原始連結，絕不出相對路徑", () => {
  assert.equal(buildShortSourceUrl("abc", "https://go2read.link", "https://src/x"), "https://go2read.link/r/abc");
  assert.equal(buildShortSourceUrl("abc", "https://go2read.link/", "https://src/x"), "https://go2read.link/r/abc"); // 去尾斜線
  // 未設短網域（空字串/undefined/null）→ 退回原始絕對來源連結，不可輸出相對 /r/abc
  for (const empty of ["", undefined, null]) {
    const out = buildShortSourceUrl("abc", empty, "https://src/x");
    assert.equal(out, "https://src/x");
    assert.doesNotMatch(out, /^\/r\//);
  }
});

const agent: AiAgent = {
  id: "1", owner_id: "o", name: "阿哲", tone: "愛吐槽", domain: "tech", domains: ["tech"],
  emoji_level: "none", hashtag_pool: ["#科技"], length: 200, source_mode: "rss",
  rss_feeds: [], search_query: "", threads_account_id: null, use_redirect: false, auto_publish: false, enabled: true, last_run_at: null
};

test("buildAgentPrompt：套用共用去 AI 腔規則（與文案流程一致）", () => {
  const p = buildAgentPrompt(agent, { title: "新晶片發表", description: "摘要內容" });
  assert.ok(p.includes(ANTI_AI_SLOP_RULES));
});

test("buildAgentPrompt：含名稱/領域/素材，emoji=none 指示不用 emoji", () => {
  const p = buildAgentPrompt(agent, { title: "新晶片發表", description: "摘要內容" });
  assert.match(p, /阿哲/);
  assert.match(p, /科技/);
  assert.match(p, /新晶片發表/);
  assert.match(p, /不要使用 emoji/);
  assert.match(p, /#科技/);
});

test("buildAgentPrompt：敏感領域加保守規則", () => {
  const p = buildAgentPrompt({ ...agent, domains: ["gossip"] }, { title: "t", description: "d" });
  assert.match(p, /不誹謗/);
});

test("buildAgentPrompt：複選領域，標題列出多個領域標籤、任一敏感即加保守規則", () => {
  const p = buildAgentPrompt({ ...agent, domains: ["tech", "stock"] }, { title: "t", description: "d" });
  assert.match(p, /科技、股市/); // 多領域標籤以「、」串接
  assert.match(p, /不誹謗/); // stock 為敏感領域 → 加保守規則
});

test("buildAgentPrompt：domains 為空時退回單一 domain（向後相容）", () => {
  const p = buildAgentPrompt({ ...agent, domain: "food", domains: [] }, { title: "t", description: "d" });
  assert.match(p, /美食/);
});

test("buildAgentPrompt：tone 指定時原樣帶入；空白/空字串退回自動口吻", () => {
  const named = buildAgentPrompt(agent, { title: "t", description: "d" });
  assert.match(named, /風格：愛吐槽/); // 指定口吻原樣帶入
  const auto = /風格：自動——依這篇內容選最合適、自然的口吻/;
  assert.match(buildAgentPrompt({ ...agent, tone: "" }, { title: "t", description: "d" }), auto); // 空字串
  assert.match(buildAgentPrompt({ ...agent, tone: "   " }, { title: "t", description: "d" }), auto); // 純空白（trim）
});
