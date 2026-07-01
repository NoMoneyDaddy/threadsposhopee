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

test("isRiskySponsorContent：夾空白/全形變體也命中（正規化）", () => {
  assert.equal(isRiskySponsorContent("賭 博 網 站"), true);
  assert.equal(isRiskySponsorContent("娛　樂　城"), true); // 全形空白
  assert.equal(isRiskySponsorContent("ＡＶ女優"), true); // 全形
});

test("isRiskySponsorContent：正文乾淨但留言違規也命中（多段檢查）", () => {
  assert.equal(isRiskySponsorContent("好用保溫瓶", "留言：加賴看娛樂城"), true);
  assert.equal(isRiskySponsorContent("好用保溫瓶", "留言：連結在下面"), false);
});
