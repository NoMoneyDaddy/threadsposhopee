import { test } from "node:test";
import assert from "node:assert/strict";
import { importAllowance, BASE_IMPORT_ALLOWANCE, IMPORTS_PER_SHARE } from "./import-allowance";

test("importAllowance：0 分享＝基礎額度；每分享 +倍數", () => {
  assert.equal(importAllowance(0), BASE_IMPORT_ALLOWANCE);
  assert.equal(importAllowance(1), BASE_IMPORT_ALLOWANCE + IMPORTS_PER_SHARE);
  assert.equal(importAllowance(10), BASE_IMPORT_ALLOWANCE + 10 * IMPORTS_PER_SHARE);
});

test("importAllowance：負值/小數安全", () => {
  assert.equal(importAllowance(-5), BASE_IMPORT_ALLOWANCE);
  assert.equal(importAllowance(2.9), BASE_IMPORT_ALLOWANCE + 2 * IMPORTS_PER_SHARE);
});
