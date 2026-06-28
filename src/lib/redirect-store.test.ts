import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError } from "./redirect-store";

test("isMissingColumnError：PGRST204 視為欄位缺失", () => {
  assert.equal(isMissingColumnError({ code: "PGRST204", message: "x" }, "safety"), true);
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
