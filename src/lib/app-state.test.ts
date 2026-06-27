import { test } from "node:test";
import assert from "node:assert/strict";
import { publishLockValue, listActiveCircuits, tripAccountCircuit, clearAccountCircuit } from "./app-state";

// 發文鎖的 CAS 正確性依賴一個字典序不變式：鎖值「到期ISO#token」雖帶 token 後綴，
// 仍需「已逾期值 < now < 未逾期值」成立（否則 acquirePublishLock 的 .lt 會誤判）。
test("鎖值字典序＝時序：後綴 token 不破壞比較", () => {
  const token = "11111111-2222-3333-4444-555555555555";
  const now = new Date("2026-06-20T12:00:00.000Z").toISOString();
  const past = publishLockValue(new Date("1970-01-01T00:00:00.000Z").toISOString(), token);
  const future = publishLockValue(new Date("2026-06-20T12:05:00.000Z").toISOString(), token);

  // 已逾期鎖 < now → 可搶；未逾期鎖 > now → 搶不到
  assert.ok(past < now, "已逾期鎖值應小於 now（可被搶得）");
  assert.ok(future > now, "未逾期鎖值應大於 now（不可被搶）");
});

test("鎖值含 token，供 release 以 %#token 精確比對持有者", () => {
  const token = "abc-token";
  const v = publishLockValue("2026-06-20T12:05:00.000Z", token);
  assert.ok(v.endsWith(`#${token}`));
  // 不同 token 的鎖值不會被本 token 的 LIKE 比對命中
  const other = publishLockValue("2026-06-20T12:05:00.000Z", "xyz-token");
  assert.ok(!other.endsWith(`#${token}`));
});

// demo 模式：listActiveCircuits 回傳仍在冷卻中的帳號；解除後不再出現。
test("listActiveCircuits（demo）：只回仍冷卻中的帳號、解除後消失", async () => {
  await clearAccountCircuit("acc-a");
  await clearAccountCircuit("acc-b");
  await tripAccountCircuit("acc-a", 60); // 冷卻 60 分鐘
  await tripAccountCircuit("acc-b", 0); // cooldown<=0 → 不啟用

  const active = await listActiveCircuits();
  assert.ok(active.has("acc-a"), "acc-a 應在冷卻中");
  assert.ok(active.get("acc-a")! > Date.now(), "到期時間應在未來");
  assert.ok(!active.has("acc-b"), "cooldown<=0 不應建立冷卻");

  await clearAccountCircuit("acc-a");
  const after = await listActiveCircuits();
  assert.ok(!after.has("acc-a"), "解除後不應再出現");
});
