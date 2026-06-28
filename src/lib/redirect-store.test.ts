import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError } from "./redirect-store";

test("isMissingColumnError：PGRST204 且訊息含目標欄位才算缺失", () => {
  const safetyErr = { code: "PGRST204", message: "Could not find the 'safety' column of 'redirect_links' in the schema cache" };
  assert.equal(isMissingColumnError(safetyErr, "safety"), true);
  // PGRST204 但缺的是別的欄位 → 不可誤判為 safety 缺失
  const otherErr = { code: "PGRST204", message: "Could not find the 'source_url' column of 'redirect_links' in the schema cache" };
  assert.equal(isMissingColumnError(otherErr, "safety"), false);
});

test("isMissingColumnError：schema cache 訊息含該欄位名才算", () => {
  const err = { message: "Could not find the 'safety' column of 'redirect_links' in the schema cache" };
  assert.equal(isMissingColumnError(err, "safety"), true);
  assert.equal(isMissingColumnError(err, "image_url"), false); // 不同欄位不誤判
});

test("isMissingColumnError：一般錯誤/null 不誤判", () => {
  assert.equal(isMissingColumnError(null, "safety"), false);
  assert.equal(isMissingColumnError({ code: "23505", message: "duplicate key" }, "safety"), false);
  assert.equal(isMissingColumnError({ message: "connection reset" }, "safety"), false);
});
