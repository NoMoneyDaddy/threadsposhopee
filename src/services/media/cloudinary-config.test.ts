import { test } from "node:test";
import assert from "node:assert/strict";
import { parseCloudinaryInput } from "./cloudinary-config";

test("成對非空 → 綁定", () => {
  const r = parseCloudinaryInput("my-cloud", "threads_unsigned");
  assert.deepEqual(r, { ok: true, cloud: "my-cloud", preset: "threads_unsigned" });
});

test("成對空（清除）→ 兩者皆 null", () => {
  const r = parseCloudinaryInput("", "");
  assert.deepEqual(r, { ok: true, cloud: null, preset: null });
});

test("會去除前後空白", () => {
  const r = parseCloudinaryInput("  my-cloud  ", "  p1  ");
  assert.deepEqual(r, { ok: true, cloud: "my-cloud", preset: "p1" });
});

test("preset 可省略（undefined）視為空", () => {
  const r = parseCloudinaryInput("", undefined);
  assert.deepEqual(r, { ok: true, cloud: null, preset: null });
});

test("cloud 非字串 → 拒絕", () => {
  assert.equal(parseCloudinaryInput(undefined, "p").ok, false);
  assert.equal(parseCloudinaryInput(123, "p").ok, false);
});

test("preset 非字串（且非 undefined）→ 拒絕", () => {
  assert.equal(parseCloudinaryInput("c", 5).ok, false);
});

test("cloud 有值但 preset 空 → 拒絕（避免用系統 preset 錯配）", () => {
  const r = parseCloudinaryInput("my-cloud", "");
  assert.equal(r.ok, false);
});

test("只填 preset 沒填 cloud → 拒絕（不可誤當清除）", () => {
  const r = parseCloudinaryInput("", "p1");
  assert.equal(r.ok, false);
});

test("非法字元 → 拒絕", () => {
  assert.equal(parseCloudinaryInput("bad/name", "p1").ok, false);
  assert.equal(parseCloudinaryInput("c1", "bad preset").ok, false);
});
