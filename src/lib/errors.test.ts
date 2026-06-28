import { test } from "node:test";
import assert from "node:assert/strict";
import { errorMessage } from "./errors";

test("errorMessage：Error 取 message", () => {
  assert.equal(errorMessage(new Error("壞掉了")), "壞掉了");
});

test("errorMessage：字串原樣", () => {
  assert.equal(errorMessage("直接字串"), "直接字串");
});

test("errorMessage：帶 message 的純物件（Supabase 錯誤）取 message，不變 [object Object]", () => {
  const supabaseErr = { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification", details: null };
  assert.equal(errorMessage(supabaseErr), supabaseErr.message);
});

test("errorMessage：無 message 的物件序列化（不回 [object Object]）", () => {
  const out = errorMessage({ code: "X1" });
  assert.notEqual(out, "[object Object]");
  assert.match(out, /X1/);
});

test("errorMessage：null/空 → fallback", () => {
  assert.equal(errorMessage(null), "未知錯誤");
  assert.equal(errorMessage(undefined, "失敗"), "失敗");
  assert.equal(errorMessage("   ", "失敗"), "失敗");
});
