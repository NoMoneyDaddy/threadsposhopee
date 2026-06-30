import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleThread, generateThreadCopy, ensureExactLink, stripLeadingPreamble } from "./provider";

test("stripLeadingPreamble：去掉開頭的回話/前言段，保留實際內容", () => {
  const r = stripLeadingPreamble("收到！這是一篇 Threads 貼文，沒有業配感。\n\n早上起床看到這飯糰模具…");
  assert.equal(r, "早上起床看到這飯糰模具…");
});

test("stripLeadingPreamble：以下是… 也去掉", () => {
  assert.equal(stripLeadingPreamble("以下是為你寫的貼文：\n真心推薦這款"), "真心推薦這款");
});

test("stripLeadingPreamble：正常開頭不誤刪", () => {
  const normal = "早上起床看到這飯糰模具，超實用\n\n壓一下就成形";
  assert.equal(stripLeadingPreamble(normal), normal);
});

test("stripLeadingPreamble：整段都是前言時不吃成空字串", () => {
  assert.equal(stripLeadingPreamble("收到！"), "收到！");
});

const SHORT = "https://s.shopee.tw/abc123";

test("ensureExactLink：已含原樣連結 → 原樣返回", () => {
  const r = "想看連結放下面 https://s.shopee.tw/abc123";
  assert.equal(ensureExactLink(r, SHORT), r);
});

test("ensureExactLink：AI 漏放連結 → 接在引導語那一行後", () => {
  assert.equal(ensureExactLink("連結放下面，需要的自己拿", SHORT), "連結放下面，需要的自己拿 https://s.shopee.tw/abc123");
});

test("ensureExactLink：連結接在第一行（引導語）後，不跑到反應/問句之後、末行不裸連結", () => {
  assert.equal(ensureExactLink("連結放下面\n你們覺得值嗎", SHORT), "連結放下面 https://s.shopee.tw/abc123\n你們覺得值嗎");
});

test("ensureExactLink：AI 竄改網址 → 移除錯網址、補回原始連結", () => {
  const r = ensureExactLink("連結放這 https://s.shopee.tw/WRONG99", SHORT);
  assert.ok(!r.includes("WRONG99"));
  assert.ok(r.includes(SHORT));
});

test("ensureExactLink：被加料的網址（query／尾碼／斜線）不可用子字串矇混，須校正回原樣", () => {
  for (const tampered of [`${SHORT}?utm=1`, `${SHORT}4`, `${SHORT}/`]) {
    const r = ensureExactLink(`看這 ${tampered}`, SHORT);
    assert.ok(!r.includes(tampered), `應移除被加料網址：${tampered}`);
    assert.ok((r.match(/https?:\/\/\S+/g) ?? []).every((u) => u === SHORT), `留下的網址須完全等於原連結（${tampered}）`);
  }
});

test("ensureExactLink：移除 [連結]／(URL) 佔位符後補連結", () => {
  for (const input of ["連結放下面 [連結]", "連結放下面 (URL)"]) {
    const r = ensureExactLink(input, SHORT);
    assert.ok(!/\[連結\]|\(URL\)/i.test(r));
    assert.ok(r.endsWith(SHORT));
  }
});

test("ensureExactLink：網址後緊貼中文不被一起吞掉（只吃合法 URL 字元）", () => {
  const r = ensureExactLink("連結在這https://wrong.tw記得買", SHORT);
  assert.ok(r.includes("記得買"));
  assert.ok(!r.includes("wrong.tw"));
  assert.ok(r.includes(SHORT));
});

test("ensureExactLink：無連結時不動內容", () => {
  assert.equal(ensureExactLink("沒有連結的留言", ""), "沒有連結的留言");
});

const LINK = "看這 https://s.shopee.tw/abc";

// 自動偵測段數（segments<=0）：demo/無金鑰時給單篇（能一則就一則），不硬拆串文。
test("generateThreadCopy：自動模式（segments=0）demo 給單篇貼文，無額外串文段", async () => {
  const r = await generateThreadCopy({ productName: "藍牙耳機", shopeeShortLink: "https://s.shopee.tw/abc" }, null, 0);
  assert.equal(r.extraSegments.length, 0); // 單篇：只有主文＋留言（放連結），不拆多段
  assert.ok(r.mainText.includes("藍牙耳機"));
  assert.match(r.replyText, /shopee\.tw\/abc/);
});

test("generateThreadCopy：固定段數（segments=3）demo 仍產生多段串文", async () => {
  const r = await generateThreadCopy({ productName: "藍牙耳機", shopeeShortLink: "https://s.shopee.tw/abc" }, null, 3);
  assert.equal(r.extraSegments.length, 1); // 主文＋留言＋1 段 = 3 段
});

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
