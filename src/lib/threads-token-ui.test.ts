import test from "node:test";
import assert from "node:assert/strict";
import { threadsTokenBadge } from "./threads-token-ui";

const now = Date.UTC(2026, 5, 28, 0, 0, 0); // 固定基準時間
const inDays = (d: number) => new Date(now + d * 86_400_000).toISOString();

test("threadsTokenBadge：無到期日 → short（短期權杖）", () => {
  for (const v of [null, undefined, ""]) {
    const b = threadsTokenBadge(v as string | null | undefined, now);
    assert.equal(b.kind, "short");
    assert.equal(b.label, "短期權杖");
    // 短期提示要同時含「附 App 密鑰換長期」與「系統仍會嘗試自動展期」。
    assert.ok(b.title.includes("App 密鑰"));
    assert.ok(b.title.includes("自動展期"));
  }
});

test("threadsTokenBadge：到期日格式異常 → invalid（權杖資訊異常）", () => {
  const b = threadsTokenBadge("not-a-date", now);
  assert.equal(b.kind, "invalid");
  assert.equal(b.label, "權杖資訊異常");
});

test("threadsTokenBadge：長效有效 → long（長期權杖）", () => {
  const b = threadsTokenBadge(inDays(50), now);
  assert.equal(b.kind, "long");
  assert.equal(b.label, "長期權杖");
});

test("threadsTokenBadge：即將到期（7 天內）仍視為 long", () => {
  const b = threadsTokenBadge(inDays(3), now);
  assert.equal(b.kind, "long");
});

test("threadsTokenBadge：已過期 → long-expired（長期權杖（已過期））", () => {
  const b = threadsTokenBadge(inDays(-1), now);
  assert.equal(b.kind, "long-expired");
  assert.equal(b.label, "長期權杖（已過期）");
});

test("threadsTokenBadge：長期 tooltip 不再宣稱「每日展期」（與 7 天視窗一致）", () => {
  const b = threadsTokenBadge(inDays(50), now);
  assert.ok(!b.title.includes("每日"));
  assert.ok(b.title.includes("到期前"));
});
