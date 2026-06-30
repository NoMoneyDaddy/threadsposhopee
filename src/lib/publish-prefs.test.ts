import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSlots, normalizePublishPrefsInput } from "./publish-prefs";

test("parseSlots: 只留合法 HH:MM、去重保序", () => {
  assert.deepEqual(parseSlots("09:00, 12:30 ,20:00,09:00"), ["09:00", "12:30", "20:00"]);
  assert.deepEqual(parseSlots("25:00,九點,7:5"), []);
  assert.deepEqual(parseSlots(""), []);
  assert.deepEqual(parseSlots(null), []);
});

test("parseSlots: 單位數小時補零正規化，避免與整點格子比對失敗或語意重複", () => {
  assert.deepEqual(parseSlots("9:00"), ["09:00"]); // 補零
  assert.deepEqual(parseSlots("9:00,09:00"), ["09:00"]); // 9:00 與 09:00 視為同一時段去重
  assert.deepEqual(parseSlots("6:00,9:00,12:30"), ["06:00", "09:00", "12:30"]); // 補零後字典序＝時間序
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

test("normalizePublishPrefsInput: 留言延遲——0 合法、空白＝null、負/超界/小數擋下", () => {
  const r = normalizePublishPrefsInput({ replyDelayMin: "30", replyDelayJitter: "0" });
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.replyDelayMin, 30);
    assert.equal(r.replyDelayJitter, 0); // 0＝顯式無抖動，非 null
  }
  const empty = normalizePublishPrefsInput({});
  if (empty.ok) {
    assert.equal(empty.replyDelayMin, null); // 空白＝沿用預設
    assert.equal(empty.replyDelayJitter, null);
  }
  assert.equal(normalizePublishPrefsInput({ replyDelayMin: "-1" }).ok, false);
  assert.equal(normalizePublishPrefsInput({ replyDelayJitter: "1441" }).ok, false);
  assert.equal(normalizePublishPrefsInput({ replyDelayMin: "2.5" }).ok, false);
});
