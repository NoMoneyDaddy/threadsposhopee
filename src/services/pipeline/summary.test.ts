import test from "node:test";
import assert from "node:assert/strict";
import { isMaterialReusable, summarizePipelineRun } from "./summary";

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

test("summarizePipelineRun：非陣列／缺欄位容錯不崩潰", () => {
  assert.equal(summarizePipelineRun(null).created, 0);
  assert.equal(summarizePipelineRun(undefined).failed, 0);
  assert.equal(summarizePipelineRun("oops").message, "待審 0 則素材");
  assert.equal(summarizePipelineRun([{}, { created: "x" }]).created, 0);
});
