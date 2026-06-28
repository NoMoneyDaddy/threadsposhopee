import { test } from "node:test";
import assert from "node:assert/strict";
import { isMissingColumnError, selectWithSafetyFallback, safePublicImageUrl } from "./redirect-store";

test("safePublicImageUrl：安全公開 http(s) 圖片網址通過", () => {
  assert.equal(safePublicImageUrl("https://img.example.com/a.jpg"), "https://img.example.com/a.jpg");
});

test("safePublicImageUrl：空值回 null", () => {
  assert.equal(safePublicImageUrl(null), null);
  assert.equal(safePublicImageUrl(undefined), null);
  assert.equal(safePublicImageUrl(""), null);
});

test("safePublicImageUrl：非 http(s) 協定（javascript:/data:）丟棄回 null", () => {
  assert.equal(safePublicImageUrl("javascript:alert(1)"), null);
  assert.equal(safePublicImageUrl("data:image/png;base64,xxxx"), null);
});

test("safePublicImageUrl：內網/本機網址（SSRF）丟棄回 null", () => {
  assert.equal(safePublicImageUrl("http://127.0.0.1/x.jpg"), null);
  assert.equal(safePublicImageUrl("http://169.254.169.254/latest/meta-data"), null);
  assert.equal(safePublicImageUrl("http://localhost/x.jpg"), null);
});

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

test("selectWithSafetyFallback：首查成功直接回資料（不重試）", async () => {
  let calls = 0;
  const data = await selectWithSafetyFallback((withSafety) => {
    calls++;
    return Promise.resolve({ data: { code: "abc", withSafety }, error: null });
  });
  assert.deepEqual(data, { code: "abc", withSafety: true });
  assert.equal(calls, 1);
});

test("selectWithSafetyFallback：safety 缺欄→改用不含 safety 的查詢重試", async () => {
  const seen: boolean[] = [];
  const data = await selectWithSafetyFallback((withSafety) => {
    seen.push(withSafety);
    if (withSafety) {
      return Promise.resolve({
        data: null,
        error: { code: "PGRST204", message: "Could not find the 'safety' column of 'redirect_links' in the schema cache" }
      });
    }
    return Promise.resolve({ data: { code: "abc" }, error: null });
  });
  assert.deepEqual(seen, [true, false]); // 先試含 safety、再退回不含
  assert.deepEqual(data, { code: "abc" });
});

test("selectWithSafetyFallback：非缺欄錯誤照拋（不被當成查無資料）", async () => {
  await assert.rejects(
    () => selectWithSafetyFallback(() => Promise.resolve({ data: null, error: { code: "57014", message: "canceling statement" } })),
    /查詢短連結失敗/
  );
});
