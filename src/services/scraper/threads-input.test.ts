import test from "node:test";
import assert from "node:assert/strict";
import { buildScraperInput, normalizePostsLimit, isValidApifyActor } from "./threads";

const LEGACY = "igview-owner/threads-search-scraper";

test("buildScraperInput：新 actor（預設）監看帳號 → mode:posts、去掉開頭 @", () => {
  const i = buildScraperInput({ username: "@shop.owner_1" }, 20);
  assert.deepEqual(i, { mode: "posts", usernames: ["shop.owner_1"], maxPosts: 20 });
});

test("buildScraperInput：from 含不合法字元時報錯（不靜默改成別的帳號）", () => {
  assert.throws(() => buildScraperInput({ username: "@user name!#中文.x" }, 20), /無效的 Threads 帳號名稱/);
});

test("buildScraperInput：多個前導 @（@@user）只去一個，剩餘 @ 報錯（不靜默改成 user）", () => {
  assert.throws(() => buildScraperInput({ username: "@@user" }, 20), /無效的 Threads 帳號名稱/);
});

test("isValidApifyActor：合法識別碼通過，含注入字元的拒絕", () => {
  assert.equal(isValidApifyActor("igview-owner/threads-search-scraper"), true);
  assert.equal(isValidApifyActor("igview-owner~threads-search-scraper"), true);
  assert.equal(isValidApifyActor("FP43CZrdHtiSNn4SY"), true); // 17 碼 actorId
  assert.equal(isValidApifyActor("user/actor?token=x"), false); // query 注入
  assert.equal(isValidApifyActor("user/actor/extra"), false); // 多段 path
  assert.equal(isValidApifyActor("../../evil"), false);
  assert.equal(isValidApifyActor(""), false);
});

test("normalizePostsLimit：非有限值／≤0 → 20，正數取整", () => {
  assert.equal(normalizePostsLimit(5), 5);
  assert.equal(normalizePostsLimit(7.9), 7);
  assert.equal(normalizePostsLimit(0), 20);
  assert.equal(normalizePostsLimit(-3), 20);
  assert.equal(normalizePostsLimit(Number.NaN), 20);
});

test("buildScraperInput：新 actor 無帳號 → mode:search", () => {
  assert.deepEqual(buildScraperInput({ searchQuery: "蝦皮" }, 20), {
    mode: "search",
    searchQueries: ["蝦皮"],
    maxPosts: 20
  });
});

test("buildScraperInput：新 actor maxPosts 夾在 1–200", () => {
  assert.equal(buildScraperInput({}, 5).maxPosts, 5); // 範圍內
  assert.equal(buildScraperInput({}, 9999).maxPosts, 200); // 上限
  assert.equal(buildScraperInput({}, Number.NaN).maxPosts, 20); // 異常值 → normalize 預設 20
  assert.equal(buildScraperInput({}, 0).maxPosts, 20);
});

test("buildScraperInput：舊 actor maxPosts 夾在 20–1000、帶 searchQuery/from/sort", () => {
  const i = buildScraperInput({ username: "shop.owner_1", sort: "top" }, 5, LEGACY);
  assert.equal("searchQuery" in i, true);
  if ("searchQuery" in i) {
    assert.equal(i.searchQuery, "shope");
    assert.equal(i.from, "shop.owner_1");
    assert.equal(i.sort, "top");
    assert.equal(i.maxPosts, 20); // 下限
  }
  if ("maxPosts" in buildScraperInput({}, 9999, LEGACY)) {
    assert.equal((buildScraperInput({}, 9999, LEGACY) as { maxPosts: number }).maxPosts, 1000); // 上限
  }
});

test("buildScraperInput：舊 actor sort 非法值退回 recent", () => {
  const i = buildScraperInput({ sort: "weird" as never }, 20, LEGACY);
  if ("sort" in i) assert.equal(i.sort, "recent");
});

test("buildScraperInput：舊 actor after/before 合法 YYYY-MM-DD 才帶入，否則略過", () => {
  const ok = buildScraperInput({ searchQuery: "蝦皮", after: "2026-01-01", before: "2026-06-30" }, 20, LEGACY);
  if ("after" in ok) assert.equal(ok.after, "2026-01-01");
  if ("before" in ok) assert.equal(ok.before, "2026-06-30");
  const none = buildScraperInput({ searchQuery: "蝦皮", after: "", before: "2026/06/30" }, 20, LEGACY);
  assert.equal("after" in none, false);
  assert.equal("before" in none, false);
});
