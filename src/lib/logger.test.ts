import { test } from "node:test";
import assert from "node:assert/strict";
import { log } from "./logger";

// 攔截 console 某 level，回傳輸出陣列與還原函式
function capture(level: "log" | "warn" | "error"): { lines: string[]; restore: () => void } {
  const lines: string[] = [];
  const original = console[level];
  console[level] = ((...args: unknown[]) => lines.push(String(args[0]))) as typeof console.log;
  return { lines, restore: () => { console[level] = original; } };
}

test("log.error：輸出單行 JSON 且帶 context 欄位", () => {
  const cap = capture("error");
  try {
    log.error("解密失敗", { ownerId: "o1", accountId: "a1" });
  } finally {
    cap.restore();
  }
  assert.equal(cap.lines.length, 1);
  const rec = JSON.parse(cap.lines[0]);
  assert.equal(rec.level, "error");
  assert.equal(rec.msg, "解密失敗");
  assert.equal(rec.ownerId, "o1");
  assert.equal(rec.accountId, "a1");
  assert.ok(typeof rec.t === "string");
});

test("log：Error 物件被攤平成 message，不會變成空物件", () => {
  const cap = capture("warn");
  try {
    log.warn("讀取失敗", { ownerId: "o2", err: new Error("boom") });
  } finally {
    cap.restore();
  }
  const rec = JSON.parse(cap.lines[0]);
  assert.equal(rec.err, "boom");
  assert.equal(rec.ownerId, "o2");
});

test("log.info：無 context 也能輸出合法 JSON", () => {
  const cap = capture("log");
  try {
    log.info("啟動");
  } finally {
    cap.restore();
  }
  const rec = JSON.parse(cap.lines[0]);
  assert.equal(rec.msg, "啟動");
  assert.equal(rec.level, "info");
});
