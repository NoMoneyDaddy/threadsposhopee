import { test } from "node:test";
import assert from "node:assert/strict";
import { effectiveChain, chainStepAt, hasThreadChain, resolveReplyProgress } from "./thread-chain";

const seg = (text: string) => ({ text, media: [] });

test("resolveReplyProgress：單則留言確實已發 → done（修正假失敗）", () => {
  const chain = [seg("連結放這 https://s.shopee.tw/ABC 有人也踩過雷嗎")];
  const posts = [{ id: "p9", text: "連結放這 https://s.shopee.tw/ABC 有人也踩過雷嗎" }];
  const r = resolveReplyProgress(chain, 0, "main1", posts);
  assert.equal(r.done, true);
  assert.equal(r.moved, true);
  assert.equal(r.lastPostId, "p9");
  assert.equal(r.cursor, 1);
});

test("resolveReplyProgress：近期貼文沒有這則 → 不動（真失敗，留人工）", () => {
  const chain = [seg("連結放這 https://s.shopee.tw/ABC")];
  const posts = [{ id: "p1", text: "完全不相關的貼文內容" }];
  const r = resolveReplyProgress(chain, 0, "main1", posts);
  assert.equal(r.done, false);
  assert.equal(r.moved, false);
  assert.equal(r.lastPostId, "main1");
  assert.equal(r.cursor, 0);
});

test("resolveReplyProgress：多段——前段已發、後段未發 → 推進到未發段（不重貼）", () => {
  const chain = [seg("第二段 2/3 內容文字"), seg("第三段 3/3 內容文字")];
  const posts = [{ id: "p2", text: "第二段 2/3 內容文字" }]; // 只有第二段發出
  const r = resolveReplyProgress(chain, 0, "main1", posts);
  assert.equal(r.done, false); // 還有第三段沒發
  assert.equal(r.moved, true);
  assert.equal(r.cursor, 1); // 推進到第三段
  assert.equal(r.lastPostId, "p2");
});

test("resolveReplyProgress：多段全部已發 → done", () => {
  const chain = [seg("第二段 2/3 內容文字"), seg("第三段 3/3 內容文字")];
  const posts = [
    { id: "p2", text: "第二段 2/3 內容文字" },
    { id: "p3", text: "第三段 3/3 內容文字" }
  ];
  const r = resolveReplyProgress(chain, 0, "main1", posts);
  assert.equal(r.done, true);
  assert.equal(r.cursor, 2);
  assert.equal(r.lastPostId, "p3");
});

test("優先採用 thread_chain，過濾空段落", () => {
  const chain = effectiveChain({
    thread_chain: [
      { text: "第一段", media: [] },
      { text: "  ", media: [] }, // 空白＋無媒體 → 濾掉
      { text: null, media: [{ url: "https://x/y.jpg", type: "image" }] }, // 純媒體 → 保留
      { text: "第三段" }
    ],
    reply_text: "舊留言",
    reply_media: []
  });
  assert.deepEqual(
    chain.map((s) => s.text),
    ["第一段", null, "第三段"]
  );
});

test("thread_chain 為空時退回單則 reply（向後相容）", () => {
  const chain = effectiveChain({ thread_chain: [], reply_text: "分潤連結 https://s.shopee.tw/x", reply_media: [] });
  assert.equal(chain.length, 1);
  assert.equal(chain[0].text, "分潤連結 https://s.shopee.tw/x");
});

test("無 chain 也無 reply → 空鏈", () => {
  assert.deepEqual(effectiveChain({ thread_chain: [], reply_text: null, reply_media: [] }), []);
});

test("chainStepAt：游標進度與 isLast", () => {
  const chain = [{ text: "a" }, { text: "b" }, { text: "c" }];
  assert.deepEqual(chainStepAt(chain, 0), { segment: { text: "a" }, isLast: false, nextCursor: 1 });
  assert.deepEqual(chainStepAt(chain, 2), { segment: { text: "c" }, isLast: true, nextCursor: 3 });
  assert.equal(chainStepAt(chain, 3), null); // 已補完
  assert.equal(chainStepAt(chain, -1), null);
});

test("hasThreadChain：只有「有效段落＞1」才算多段串文（單段走即時補捷徑）", () => {
  assert.equal(hasThreadChain({ thread_chain: [] }), false);
  assert.equal(hasThreadChain({ thread_chain: [{ text: "  ", media: [] }] }), false); // 空白無媒體
  assert.equal(hasThreadChain({ thread_chain: [{ text: "只有一段" }] }), false); // 單段＝單則留言
  assert.equal(hasThreadChain({ thread_chain: [{ text: "第一段" }, { text: "  " }] }), false); // 第二段空＝實質單段
  assert.equal(hasThreadChain({ thread_chain: [{ text: "第一段" }, { text: "第二段" }] }), true);
  assert.equal(
    hasThreadChain({ thread_chain: [{ text: null, media: [{ url: "https://x/y.jpg", type: "image" }] }, { text: "第二段" }] }),
    true
  );
});

test("空白 url 的媒體視為無效（與發布層一致）：純空媒體段落被濾掉", () => {
  // 段落只有 url='' 的無效媒體、無文字 → 視為空段落濾掉（避免 worker 補發空段落失敗）。
  const chain = effectiveChain({
    thread_chain: [{ text: null, media: [{ url: "   ", type: "image" } as never] }, { text: "有效段" }],
    reply_text: null,
    reply_media: []
  });
  assert.deepEqual(chain.map((s) => s.text), ["有效段"]);
  assert.equal(hasThreadChain({ thread_chain: [{ text: null, media: [{ url: "", type: "image" } as never] }] }), false);
});
