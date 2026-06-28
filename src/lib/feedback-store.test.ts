import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isFeedbackKind,
  isFeedbackStatus,
  createFeedback,
  listFeedbackForOwner,
  listAllFeedback,
  replyFeedbackAsAdmin
} from "./feedback-store";

test("isFeedbackKind / isFeedbackStatus 白名單", () => {
  assert.ok(isFeedbackKind("bug"));
  assert.ok(isFeedbackKind("feature"));
  assert.ok(!isFeedbackKind("spam"));
  assert.ok(!isFeedbackKind(123));
  assert.ok(isFeedbackStatus("open"));
  assert.ok(isFeedbackStatus("resolved"));
  assert.ok(!isFeedbackStatus("done"));
});

// demo 模式（無 Supabase 金鑰）：走記憶體，可直接驗證建立／列出／管理員回覆流程。
test("createFeedback → 限本人列出；管理員可列全部並回覆", async () => {
  const a = await createFeedback({ kind: "feature", title: "想要深色模式", message: "請加 dark mode" }, "owner-A");
  await createFeedback({ kind: "bug", title: "壞了", message: "按鈕沒反應" }, "owner-B");

  // 限本人：只看到自己的
  const mineA = await listFeedbackForOwner("owner-A");
  assert.ok(mineA.every((f) => f.owner_id === "owner-A"));
  assert.ok(mineA.some((f) => f.id === a.id));
  assert.ok(!mineA.some((f) => f.owner_id === "owner-B"));

  // 管理員：看到全部（至少含 A、B）
  const all = await listAllFeedback();
  assert.ok(all.some((f) => f.owner_id === "owner-A"));
  assert.ok(all.some((f) => f.owner_id === "owner-B"));

  // 新建預設 open
  assert.equal(a.status, "open");

  // 管理員回覆＋改狀態
  const replied = await replyFeedbackAsAdmin(a.id, { admin_reply: "已排入規劃", status: "in_progress" });
  assert.ok(replied);
  assert.equal(replied!.admin_reply, "已排入規劃");
  assert.equal(replied!.status, "in_progress");
  assert.ok(replied!.replied_at, "回覆時應蓋 replied_at");

  // 清空回覆時 replied_at 應歸零
  const cleared = await replyFeedbackAsAdmin(a.id, { admin_reply: "" });
  assert.equal(cleared!.admin_reply, null);
  assert.equal(cleared!.replied_at, null);
});

test("replyFeedbackAsAdmin：找不到回 null；空 patch 回 null", async () => {
  assert.equal(await replyFeedbackAsAdmin("does-not-exist", { status: "closed" }), null);
  assert.equal(await replyFeedbackAsAdmin("whatever", {}), null);
});
