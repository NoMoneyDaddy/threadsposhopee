import test from "node:test";
import assert from "node:assert/strict";
import { buildScraperInput } from "./threads";

test("buildScraperInput：只監看帳號時 searchQuery 預設 shope，from 帶入", () => {
  const i = buildScraperInput({ username: "@shop.owner_1" }, 20);
  assert.equal(i.searchQuery, "shope");
  assert.equal(i.from, "shop.owner_1"); // 去掉開頭 @
  assert.equal(i.sort, "recent");
});

test("buildScraperInput：from 過濾不合法字元（^[a-zA-Z0-9._]*$）", () => {
  const i = buildScraperInput({ username: "@user name!#中文.x" }, 20);
  assert.equal(i.from, "username.x"); // 空白/符號/中文皆移除
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
