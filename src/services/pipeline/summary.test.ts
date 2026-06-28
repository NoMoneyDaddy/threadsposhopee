import test from "node:test";
import assert from "node:assert/strict";
import { isMaterialReusable, summarizePipelineRun, decideIntakeStatus } from "./summary";

test("decideIntakeStatus：新建→pending；已核准(含 null)→approved 不降級；待審→pending", () => {
  assert.equal(decideIntakeStatus(null), "pending");
  assert.equal(decideIntakeStatus(undefined), "pending");
  assert.equal(decideIntakeStatus({ intake_status: "approved" }), "approved");
  assert.equal(decideIntakeStatus({ intake_status: null }), "approved"); // 舊資料視同已核准，不降級
  assert.equal(decideIntakeStatus({}), "approved");
  assert.equal(decideIntakeStatus({ intake_status: "pending" }), "pending");
});

test("isMaterialReusable：連結有效＋有文案＋有短連結才可重用", () => {
  assert.equal(isMaterialReusable({ affiliate_valid: true, main_text: "文案", affiliate_short_link: "https://s.shopee.tw/x" }), true);
  assert.equal(isMaterialReusable({ affiliate_valid: false, main_text: "文案", affiliate_short_link: "x" }), false);
  assert.equal(isMaterialReusable({ affiliate_valid: true, main_text: "", affiliate_short_link: "x" }), false);
  assert.equal(isMaterialReusable({ affiliate_valid: true, main_text: "文案", affiliate_short_link: null }), false);
  assert.equal(isMaterialReusable(null), false);
  assert.equal(isMaterialReusable(undefined), false);
});

test("summarizePipelineRun：彙總新增/重用/失敗並組訊息", () => {
  const r = summarizePipelineRun([
    { created: 2, reusedMaterial: 1 },
    { created: 1, reusedMaterial: 0 },
    { created: 0, reusedMaterial: 0, error: "boom" }
  ]);
  assert.equal(r.created, 3);
  assert.equal(r.reused, 1);
  assert.equal(r.failed, 1);
  assert.ok(r.message.includes("待審 3 則素材"));
  assert.ok(r.message.includes("重用 1"));
  assert.ok(r.message.includes("1 個來源失敗"));
  assert.ok(r.message.includes("素材")); // 有新增 → 帶導引
});

test("summarizePipelineRun：無新增時不帶導引語、重用為 0 不顯示", () => {
  const r = summarizePipelineRun([{ created: 0, reusedMaterial: 0 }]);
  assert.equal(r.message, "待審 0 則素材");
});

test("summarizePipelineRun：有 pending 欄位時待審數以 pending 為準（不含已核准重產）", () => {
  // created=3 但只有 2 筆進待審（1 筆為已核准重產）→ 顯示「待審 2」
  const r = summarizePipelineRun([{ created: 3, pending: 2, reusedMaterial: 0 }]);
  assert.equal(r.created, 3);
  assert.equal(r.pending, 2);
  assert.ok(r.message.includes("待審 2 則素材"));
});

test("summarizePipelineRun：非陣列／缺欄位容錯不崩潰", () => {
  assert.equal(summarizePipelineRun(null).created, 0);
  assert.equal(summarizePipelineRun(undefined).failed, 0);
  assert.equal(summarizePipelineRun("oops").message, "待審 0 則素材");
  assert.equal(summarizePipelineRun([{}, { created: "x" }]).created, 0);
});
