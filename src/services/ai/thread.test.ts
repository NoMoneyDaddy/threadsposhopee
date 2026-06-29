import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleThread } from "./provider";

const LINK = "看這 https://s.shopee.tw/abc";

test("assembleThread：3 段 → 連結附在最後一段（3/n），主文/留言不含連結", () => {
  const r = assembleThread(["主文 hook", "2/n 重點", "3/n 收尾"], LINK);
  assert.equal(r.mainText, "主文 hook");
  assert.equal(r.replyText, "2/n 重點");
  assert.equal(r.extraSegments.length, 1);
  assert.match(r.extraSegments[0].text ?? "", /3\/n 收尾[\s\S]*shopee\.tw\/abc/);
  assert.ok(!r.mainText.includes("shopee.tw"));
  assert.ok(!r.replyText.includes("shopee.tw"));
});

test("assembleThread：只有主文 → 補一段留言放連結（2/n）", () => {
  const r = assembleThread(["只有主文"], LINK);
  assert.equal(r.mainText, "只有主文");
  assert.match(r.replyText, /shopee\.tw\/abc/);
  assert.equal(r.extraSegments.length, 0);
});

test("assembleThread：主文+留言 → 連結在留言（最後一段＝2/n）", () => {
  const r = assembleThread(["主文", "留言"], LINK);
  assert.equal(r.extraSegments.length, 0);
  assert.match(r.replyText, /留言[\s\S]*shopee\.tw\/abc/);
});

test("assembleThread：無連結時不附連結行", () => {
  const r = assembleThread(["主文", "留言"], "");
  assert.equal(r.replyText, "留言");
});

test("assembleThread：過濾空段（空白段被丟，尾段成為 2/n）", () => {
  const r = assembleThread(["主文", "  ", "尾段"], LINK);
  assert.match(r.replyText, /尾段[\s\S]*shopee\.tw\/abc/);
  assert.equal(r.extraSegments.length, 0);
});
