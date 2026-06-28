import { test } from "node:test";
import assert from "node:assert/strict";
import { dedupeCapIds } from "./auth";

test("dedupeCapIds：去除重複 id（只保留一次、維持首次出現順序）", () => {
  assert.deepEqual(dedupeCapIds(["a", "b", "a", "c", "b"]), ["a", "b", "c"]);
});

test("dedupeCapIds：超過上限只取前 N 筆", () => {
  const ids = Array.from({ length: 250 }, (_, i) => `id-${i}`);
  const out = dedupeCapIds(ids, 200);
  assert.equal(out.length, 200);
  assert.equal(out[0], "id-0");
  assert.equal(out[199], "id-199");
});

test("dedupeCapIds：去重後再套上限", () => {
  const out = dedupeCapIds(["x", "x", "y", "z"], 2);
  assert.deepEqual(out, ["x", "y"]);
});

test("dedupeCapIds：空陣列與 cap<=0", () => {
  assert.deepEqual(dedupeCapIds([]), []);
  assert.deepEqual(dedupeCapIds(["a", "b"], 0), []);
});
