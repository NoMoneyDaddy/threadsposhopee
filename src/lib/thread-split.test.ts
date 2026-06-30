import { test } from "node:test";
import assert from "node:assert/strict";
import { splitForThreads } from "./thread-split";

test("splitForThreads：短文不切，原樣回單段", () => {
  assert.deepEqual(splitForThreads("哈囉世界", 500), ["哈囉世界"]);
});

test("splitForThreads：空字串／空白回空陣列", () => {
  assert.deepEqual(splitForThreads("", 500), []);
  assert.deepEqual(splitForThreads("   \n  ", 500), []);
});

test("splitForThreads：超長文切成多段，每段 ≤ limit", () => {
  const text = Array.from({ length: 20 }, (_, i) => `這是第 ${i} 句測試文字。`).join("");
  const segs = splitForThreads(text, 60);
  assert.ok(segs.length > 1, "應切成多段");
  for (const s of segs) assert.ok(s.length <= 60, `每段需 ≤60，實際 ${s.length}`);
  // 不丟字：合併後（移除為了分段插入的換行）應涵蓋原內容字元數。
  assert.equal(segs.join("").replace(/\n/g, "").length, text.replace(/\n/g, "").length);
});

test("splitForThreads：在句末標點切，不硬切句子", () => {
  const segs = splitForThreads("第一句很短。第二句也不長。第三句結尾。", 14);
  for (const s of segs) assert.ok(s.length <= 14, `實際 ${s.length}`);
  // 每段都以句號收尾（在標點邊界切）。
  for (const s of segs) assert.match(s, /。$/);
});

test("splitForThreads：單一超長句無標點 → 硬切但每段 ≤ limit", () => {
  const long = "a".repeat(250);
  const segs = splitForThreads(long, 100);
  assert.deepEqual(segs.map((s) => s.length), [100, 100, 50]);
});

test("splitForThreads：來源連結行不被切斷（短於上限即整段保留）", () => {
  const body = "正文".repeat(200); // 400 字
  const url = "https://go2read.link/r/abcd1234";
  const segs = splitForThreads(`${body}\n\n📎 來源：${url}`, 500);
  // 連結整段存在於某一段中。
  assert.ok(segs.some((s) => s.includes(url)));
});
