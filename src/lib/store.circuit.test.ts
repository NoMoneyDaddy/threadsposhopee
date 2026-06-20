import { test } from "node:test";
import assert from "node:assert/strict";
import { getAccountCircuitUntil, tripAccountCircuit, clearAccountCircuit } from "./store";

// demo 模式（無 Supabase 金鑰）：跨輪斷路器走記憶體，可直接驗證行為。
test("跨輪斷路器：trip 後在冷卻期內回到期時戳，clear 後回 null", async () => {
  const acc = "acc-circuit-1";
  assert.equal(await getAccountCircuitUntil(acc), null);

  await tripAccountCircuit(acc, 30);
  const until = await getAccountCircuitUntil(acc);
  assert.ok(typeof until === "number" && until > Date.now(), "冷卻中應回未來時戳");

  await clearAccountCircuit(acc);
  assert.equal(await getAccountCircuitUntil(acc), null);
});

test("跨輪斷路器：cooldownMinutes<=0 不寫入（視為停用跨輪冷卻）", async () => {
  const acc = "acc-circuit-2";
  await tripAccountCircuit(acc, 0);
  assert.equal(await getAccountCircuitUntil(acc), null);
});
