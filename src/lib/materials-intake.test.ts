import { test } from "node:test";
import assert from "node:assert/strict";
import { createMaterial, listMaterials, listPendingMaterials, approveMaterialIntake } from "./materials-store";

// demo 模式（無 Supabase 金鑰）：驗證待審/核准的入庫閘門流程。
test("待審素材不入庫列表、核准後才出現；listPendingMaterials 只列待審", async () => {
  const owner = "intake-owner-1";
  await createMaterial({ shop_id: "s1", item_id: "pend-1", intake_status: "pending", main_text: "待審A" }, owner);
  await createMaterial({ shop_id: "s1", item_id: "appr-1", intake_status: "approved", main_text: "已核准B" }, owner);

  // 列表只含已核准
  const listed = await listMaterials(owner);
  assert.ok(listed.some((m) => m.item_id === "appr-1"), "已核准應在列表");
  assert.ok(!listed.some((m) => m.item_id === "pend-1"), "待審不應在列表");

  // 待審清單只含待審、且限本人
  const pending = await listPendingMaterials(owner);
  assert.ok(pending.some((m) => m.item_id === "pend-1"));
  assert.ok(!pending.some((m) => m.item_id === "appr-1"));

  // 核准 → 進列表、離開待審
  const pend = pending.find((m) => m.item_id === "pend-1")!;
  assert.equal(await approveMaterialIntake(pend.id, owner), true);
  assert.ok((await listMaterials(owner)).some((m) => m.item_id === "pend-1"), "核准後應入列表");
  assert.ok(!(await listPendingMaterials(owner)).some((m) => m.item_id === "pend-1"), "核准後離開待審");
});

test("approveMaterialIntake：找不到或非本人回 false", async () => {
  assert.equal(await approveMaterialIntake("00000000-0000-0000-0000-000000000000", "nobody"), false);
});

test("未設 intake_status 的舊素材視同已核准（出現在列表）", async () => {
  const owner = "intake-owner-2";
  await createMaterial({ shop_id: "s2", item_id: "legacy-1", main_text: "舊素材" }, owner);
  assert.ok((await listMaterials(owner)).some((m) => m.item_id === "legacy-1"));
});
