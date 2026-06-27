import { test } from "node:test";
import assert from "node:assert/strict";
import { buildUsersOverview } from "./admin-store";

test("buildUsersOverview：彙總身份組、Threads 數、蝦皮綁定", () => {
  const users = [
    { id: "u1", email: "a@example.com" },
    { id: "u2", email: "b@example.com" },
    { id: "u3", email: null }
  ];
  const profiles = [
    { id: "u1", roles: ["reviewer"] },
    { id: "u2", roles: [] },
    { id: "u1", roles: ["reviewer", "bogus"] } // 後者覆寫前者；非法角色被 sanitize 濾除
  ];
  const threads = [
    { owner_id: "u1" },
    { owner_id: "u1" },
    { owner_id: "u2" },
    { owner_id: null } // 孤兒列略過
  ];
  const shopee = [{ owner_id: "u2" }, { owner_id: null }];

  const out = buildUsersOverview(users, profiles, threads, shopee);

  const u1 = out.find((u) => u.id === "u1")!;
  assert.deepEqual(u1.roles, ["reviewer"]);
  assert.equal(u1.threadsCount, 2);
  assert.equal(u1.shopeeBound, false);

  const u2 = out.find((u) => u.id === "u2")!;
  assert.deepEqual(u2.roles, []);
  assert.equal(u2.threadsCount, 1);
  assert.equal(u2.shopeeBound, true);

  // 無 profile／無帳號的使用者：身份組空、計數 0、未綁定。
  const u3 = out.find((u) => u.id === "u3")!;
  assert.deepEqual(u3.roles, []);
  assert.equal(u3.threadsCount, 0);
  assert.equal(u3.shopeeBound, false);
  assert.equal(u3.email, null);
});
