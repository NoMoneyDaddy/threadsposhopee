import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlots, normalizePublishPrefsInput } from "./publish-prefs";

test("parseSlots: 只留合法 HH:MM、去重保序", () => {
  assert.deepEqual(parseSlots("09:00, 12:30 ,20:00,09:00"), ["09:00", "12:30", "20:00"]);
  assert.deepEqual(parseSlots("25:00,九點,7:5"), []);
  assert.deepEqual(parseSlots(""), []);
  assert.deepEqual(parseSlots(null), []);
});

test("normalizePublishPrefsInput: 驗證界線", () => {
  const ok = normalizePublishPrefsInput({ slots: "09:00,20:00", minGapMinutes: "240", maxPerDay: "5" });
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.deepEqual(ok.slots, ["09:00", "20:00"]);
    assert.equal(ok.minGapMinutes, 240);
    assert.equal(ok.maxPerDay, 5);
  }
  assert.equal(normalizePublishPrefsInput({ slots: "亂打" }).ok, false);
  assert.equal(normalizePublishPrefsInput({ minGapMinutes: "0" }).ok, false);
  assert.equal(normalizePublishPrefsInput({ maxPerDay: "999" }).ok, false);
  // 全空 = 沿用預設（null）
  const empty = normalizePublishPrefsInput({ slots: "", minGapMinutes: "", maxPerDay: "" });
  assert.equal(empty.ok, true);
  if (empty.ok) assert.equal(empty.minGapMinutes, null);
});
