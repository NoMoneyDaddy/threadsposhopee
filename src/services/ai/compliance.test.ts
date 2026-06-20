import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCompliancePrompt, parseCompliance, MAX_COMPLIANCE_CHARS } from "./compliance";

test("buildCompliancePrompt：含角色、固定兩行格式與貼文內容", () => {
  const p = buildCompliancePrompt("快買這個超讚保溫瓶");
  assert.match(p, /防封與觸及優化顧問/);
  assert.match(p, /風險：低\/中\/高/);
  assert.match(p, /快買這個超讚保溫瓶/);
});

test("buildCompliancePrompt：超長文案截斷至上限", () => {
  const long = "字".repeat(MAX_COMPLIANCE_CHARS + 500);
  const p = buildCompliancePrompt(long);
  // prompt 內貼文片段不應超過上限
  assert.ok(p.split("貼文：\n")[1].length <= MAX_COMPLIANCE_CHARS);
});

test("parseCompliance：抓出風險與建議", () => {
  const r = parseCompliance("風險：高\n建議：刪掉重複 hashtag 並改寫成自然口吻");
  assert.equal(r.risk, "高");
  assert.match(r.advice, /刪掉重複 hashtag/);
});

test("parseCompliance：全形/半形冒號都吃，無法解析回未知", () => {
  assert.equal(parseCompliance("風險: 中\n建議: 改短一點").risk, "中");
  assert.equal(parseCompliance("亂回一通").risk, "未知");
});
