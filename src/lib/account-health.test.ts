import { test } from "node:test";
import assert from "node:assert/strict";
import { accountHealth, sortByHealth } from "./account-health";

const NOW = Date.parse("2026-06-20T00:00:00Z");
const inDays = (d: number) => new Date(NOW + d * 86_400_000).toISOString();

test("accountHealth：active + token 充足 → ok", () => {
  const h = accountHealth({ label: "A", status: "active", token_expires_at: inDays(40) }, NOW);
  assert.equal(h.level, "ok");
});

test("accountHealth：status error → error", () => {
  const h = accountHealth({ label: "A", status: "error", token_expires_at: inDays(40) }, NOW);
  assert.equal(h.level, "error");
});

test("accountHealth：token 已過期 → error（即使 status active）", () => {
  const h = accountHealth({ label: "A", status: "active", token_expires_at: inDays(-1) }, NOW);
  assert.equal(h.level, "error");
});

test("accountHealth：token 7 天內到期 → warn", () => {
  const h = accountHealth({ label: "A", status: "active", token_expires_at: inDays(3) }, NOW);
  assert.equal(h.level, "warn");
  assert.match(h.summary, /3 天後到期/);
});

test("accountHealth：paused → warn", () => {
  const h = accountHealth({ label: "A", status: "paused", token_expires_at: inDays(40) }, NOW);
  assert.equal(h.level, "warn");
});

test("accountHealth：無到期資訊 → warn", () => {
  const h = accountHealth({ label: "A", status: "active", token_expires_at: null }, NOW);
  assert.equal(h.level, "warn");
});

test("sortByHealth：error → warn → ok", () => {
  const sorted = sortByHealth([
    { label: "ok1", level: "ok", summary: "" },
    { label: "err1", level: "error", summary: "" },
    { label: "warn1", level: "warn", summary: "" }
  ]);
  assert.deepEqual(
    sorted.map((x) => x.label),
    ["err1", "warn1", "ok1"]
  );
});
