import { test } from "node:test";
import assert from "node:assert/strict";
import {
  contributionBadge,
  badgesFor,
  isReviewer,
  sanitizeRoles,
  materialScore,
  isTopMaterial,
  TOP_MATERIAL_THRESHOLD
} from "./roles";

test("contributionBadge：取達到的最高階（四級：0/15/40/100）", () => {
  assert.equal(contributionBadge(0).key, "rookie");
  assert.equal(contributionBadge(14).key, "rookie");
  assert.equal(contributionBadge(15).key, "contributor");
  assert.equal(contributionBadge(39).key, "contributor");
  assert.equal(contributionBadge(40).key, "high");
  assert.equal(contributionBadge(99).key, "high");
  assert.equal(contributionBadge(100).key, "elite");
  assert.equal(contributionBadge(999).key, "elite");
});

test("badgesFor：含貢獻勳章＋手動身份組＋管理員", () => {
  assert.deepEqual(badgesFor({ score: 0 }).map((b) => b.key), ["rookie"]);
  assert.deepEqual(badgesFor({ score: 40, roles: ["reviewer"] }).map((b) => b.key), ["high", "reviewer"]);
  assert.deepEqual(
    badgesFor({ score: 100, roles: ["reviewer"], isOwner: true }).map((b) => b.key),
    ["elite", "reviewer", "admin"]
  );
});

test("isReviewer：owner 或具 reviewer 身份組", () => {
  assert.equal(isReviewer([], true), true);
  assert.equal(isReviewer(["reviewer"], false), true);
  assert.equal(isReviewer([], false), false);
  assert.equal(isReviewer(null, false), false);
});

test("sanitizeRoles：只留合法身份組", () => {
  assert.deepEqual(sanitizeRoles(["reviewer", "admin", "hacker"]), ["reviewer"]);
  assert.deepEqual(sanitizeRoles("reviewer"), []);
  assert.deepEqual(sanitizeRoles(null), []);
});

test("materialScore／isTopMaterial：收藏權重為匯入兩倍", () => {
  assert.equal(materialScore(2, 2), 6);
  assert.equal(materialScore(-3, -1), 0);
  assert.equal(isTopMaterial(TOP_MATERIAL_THRESHOLD, 0), true);
  assert.equal(isTopMaterial(0, 3), true); // 3*2=6
  assert.equal(isTopMaterial(2, 1), false); // 2+2=4
});
