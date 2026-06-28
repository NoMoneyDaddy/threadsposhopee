import { test } from "node:test";
import assert from "node:assert/strict";
import { createMaterial, listMaterials, listPendingMaterials, approveMaterialIntake } from "./materials-store";

// demo 模式（無 Supabase 金鑰）：驗證待審/核准的入庫閘門流程＋多租戶隔離。
test("待審素材不入庫列表、核准後才出現；兩個列表都排除他租戶資料", async () => {
  const owner = "intake-owner-1";
  const other = "intake-owner-OTHER";
  await createMaterial({ shop_id: "s1", item_id: "pend-1", intake_status: "pending", main_text: "待審A" }, owner);
  await createMaterial({ shop_id: "s1", item_id: "appr-1", intake_status: "approved", main_text: "已核准B" }, owner);
  // 他租戶的待審＋已核准（同 shop 不同 item，避免 demo upsert 衝突）：兩個列表都不該看到。
  await createMaterial({ shop_id: "s1", item_id: "other-pend", intake_status: "pending", main_text: "別人待審" }, other);
  await createMaterial({ shop_id: "s1", item_id: "other-appr", intake_status: "approved", main_text: "別人已核准" }, other);

  // 列表只含本人已核准；不含本人待審，也不含他租戶任何素材
  const listed = await listMaterials(owner);
  assert.ok(listed.some((m) => m.item_id === "appr-1"), "已核准應在列表");
  assert.ok(!listed.some((m) => m.item_id === "pend-1"), "待審不應在列表");
  assert.ok(!listed.some((m) => m.owner_id === other), "不應看到他租戶素材");

  // 待審清單只含本人待審
  const pending = await listPendingMaterials(owner);
  assert.ok(pending.some((m) => m.item_id === "pend-1"));
  assert.ok(!pending.some((m) => m.item_id === "appr-1"));
  assert.ok(!pending.some((m) => m.owner_id === other), "待審清單不應含他租戶");

  // 核准 → 進列表、離開待審
  const pend = pending.find((m) => m.item_id === "pend-1")!;
  assert.equal(await approveMaterialIntake(pend.id, owner), true);
  assert.ok((await listMaterials(owner)).some((m) => m.item_id === "pend-1"), "核准後應入列表");
  assert.ok(!(await listPendingMaterials(owner)).some((m) => m.item_id === "pend-1"), "核准後離開待審");
  // 他租戶資料始終不受影響、仍排除
  assert.ok(!(await listMaterials(owner)).some((m) => m.owner_id === other));
});

test("approveMaterialIntake：找不到、或素材存在但非本人，皆回 false（不可跨租戶核准）", async () => {
  assert.equal(await approveMaterialIntake("00000000-0000-0000-0000-000000000000", "nobody"), false);
  // 素材存在但屬於別人：他人不可核准
  const mine = await createMaterial({ shop_id: "s9", item_id: "guard-1", intake_status: "pending" }, "intake-owner-guard");
  assert.equal(await approveMaterialIntake(mine.id, "intake-owner-attacker"), false, "非本人不可核准");
  assert.ok((await listPendingMaterials("intake-owner-guard")).some((m) => m.id === mine.id), "仍維持待審");
});

test("未設 intake_status 的舊素材視同已核准（出現在列表）", async () => {
  const owner = "intake-owner-2";
  await createMaterial({ shop_id: "s2", item_id: "legacy-1", main_text: "舊素材" }, owner);
  assert.ok((await listMaterials(owner)).some((m) => m.item_id === "legacy-1"));
});
