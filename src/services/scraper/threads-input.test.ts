import test from "node:test";
import assert from "node:assert/strict";
import { buildScraperInput, normalizePostsLimit } from "./threads";

test("buildScraperInput：只監看帳號時 searchQuery 預設 shope，from 帶入", () => {
  const i = buildScraperInput({ username: "@shop.owner_1" }, 20);
  assert.equal(i.searchQuery, "shope");
  assert.equal(i.from, "shop.owner_1"); // 去掉開頭 @
  assert.equal(i.sort, "recent");
});

test("buildScraperInput：from 含不合法字元時報錯（不靜默改成別的帳號）", () => {
  assert.throws(() => buildScraperInput({ username: "@user name!#中文.x" }, 20), /無效的 Threads 帳號名稱/);
});

test("normalizePostsLimit：非有限值／≤0 → 20，正數取整", () => {
  assert.equal(normalizePostsLimit(5), 5);
  assert.equal(normalizePostsLimit(7.9), 7);
  assert.equal(normalizePostsLimit(0), 20);
  assert.equal(normalizePostsLimit(-3), 20);
  assert.equal(normalizePostsLimit(Number.NaN), 20);
});

test("buildScraperInput：無帳號時不帶 from", () => {
  const i = buildScraperInput({ searchQuery: "蝦皮" }, 20);
  assert.equal(i.from, undefined);
  assert.equal(i.searchQuery, "蝦皮");
});

test("buildScraperInput：maxPosts 夾在 20–200", () => {
  assert.equal(buildScraperInput({}, 5).maxPosts, 20); // 下限
  assert.equal(buildScraperInput({}, 50).maxPosts, 50); // 範圍內
  assert.equal(buildScraperInput({}, 1000).maxPosts, 200); // 上限（actor 實際約 200）
  assert.equal(buildScraperInput({}, Number.NaN).maxPosts, 20); // 異常值回下限
  assert.equal(buildScraperInput({}, 0).maxPosts, 20);
});

test("buildScraperInput：sort 僅 top/recent，非法值退回 recent", () => {
  assert.equal(buildScraperInput({ sort: "top" }, 20).sort, "top");
  assert.equal(buildScraperInput({ sort: "recent" }, 20).sort, "recent");
  assert.equal(buildScraperInput({ sort: "weird" as never }, 20).sort, "recent");
});
