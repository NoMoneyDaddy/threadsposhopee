import { test } from "node:test";
import assert from "node:assert/strict";
import { isRiskySponsorContent } from "./sponsor-content";

test("isRiskySponsorContent：命中違規關鍵字→true", () => {
  assert.equal(isRiskySponsorContent("最新娛樂城百家樂下注"), true);
  assert.equal(isRiskySponsorContent("成人情色影片"), true);
  assert.equal(isRiskySponsorContent("貸款免審核代儲"), true);
});

test("isRiskySponsorContent：一般商品文→false；空值→false", () => {
  assert.equal(isRiskySponsorContent("這款保溫瓶超好用，保冷 12 小時"), false);
  assert.equal(isRiskySponsorContent(""), false);
  assert.equal(isRiskySponsorContent(null), false);
});
