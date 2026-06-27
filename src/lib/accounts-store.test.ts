import { test } from "node:test";
import assert from "node:assert/strict";
import { createShopeeAccount, canAddThreadsAccount } from "./accounts-store";
import { getThreadsAccountLimit, MAX_THREADS_ACCOUNTS_PER_USER, GLOBAL_MAX_THREADS_ACCOUNTS } from "./account-limits";
import { demo } from "./demo-store";

// demo 模式（無 Supabase 金鑰）：createShopeeAccount 走記憶體覆寫，可直接驗證「一人一組」語意。
test("createShopeeAccount：重複綁定覆寫既有那筆、不新增第二筆", async () => {
  // 清空 demo 既有資料，從零綁定。
  demo.shopeeAccounts.length = 0;

  const first = await createShopeeAccount({ app_id: "appA", secret: "s1", default_sub_id: "tag1" }, "demo-user");
  assert.equal(demo.shopeeAccounts.length, 1, "首次綁定新增一筆");
  assert.equal(first.app_id, "appA");

  const second = await createShopeeAccount({ app_id: "appB", secret: "s2", default_sub_id: "tag2" }, "demo-user");
  assert.equal(demo.shopeeAccounts.length, 1, "重複綁定覆寫、總數仍為 1");
  assert.equal(second.id, first.id, "覆寫的是同一筆");
  assert.equal(second.app_id, "appB", "app_id 已更新為新值");
  assert.equal(second.default_sub_id, "tag2", "default_sub_id 已更新");
});

test("createShopeeAccount：未填 label 用固定預設標籤", async () => {
  demo.shopeeAccounts.length = 0;
  const acc = await createShopeeAccount({ app_id: "appA", secret: "s1" }, "demo-user");
  assert.equal(acc.label, "蝦皮分潤");
});

test("getThreadsAccountLimit：管理者取全站硬上限、一般使用者取每人上限", () => {
  assert.equal(getThreadsAccountLimit(true), GLOBAL_MAX_THREADS_ACCOUNTS);
  assert.equal(getThreadsAccountLimit(false), MAX_THREADS_ACCOUNTS_PER_USER);
  assert.equal(getThreadsAccountLimit(undefined), MAX_THREADS_ACCOUNTS_PER_USER);
});

test("canAddThreadsAccount：demo 模式放行且回傳對應上限", async () => {
  const owner = await canAddThreadsAccount("demo-user", { isOwner: true });
  assert.deepEqual(owner, { ok: true, used: 0, limit: GLOBAL_MAX_THREADS_ACCOUNTS });
  const member = await canAddThreadsAccount("demo-user", { isOwner: false });
  assert.deepEqual(member, { ok: true, used: 0, limit: MAX_THREADS_ACCOUNTS_PER_USER });
});
