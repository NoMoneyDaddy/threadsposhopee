import { test } from "node:test";
import assert from "node:assert/strict";
import { isNavItemActive, type NavItem } from "./SiteHeader";

const home: NavItem = { href: "/", label: "儀表板" };
const drafts: NavItem = {
  href: "/drafts",
  label: "文章管理",
  match: ["/drafts", "/compose", "/agents", "/materials", "/sources", "/shared", "/calendar"]
};
const links: NavItem = { href: "/links", label: "轉址服務" };

test("首頁只在 pathname 完全等於 / 時高亮", () => {
  assert.equal(isNavItemActive(home, "/"), true);
  assert.equal(isNavItemActive(home, "/drafts"), false);
  assert.equal(isNavItemActive(home, "/links"), false);
});

test("文章管理對所有整併子頁以 prefix 命中", () => {
  assert.equal(isNavItemActive(drafts, "/drafts"), true);
  assert.equal(isNavItemActive(drafts, "/compose/123"), true);
  assert.equal(isNavItemActive(drafts, "/agents"), true);
  assert.equal(isNavItemActive(drafts, "/calendar"), true);
});

test("一般項目只命中自己的路徑前綴", () => {
  assert.equal(isNavItemActive(links, "/links"), true);
  assert.equal(isNavItemActive(links, "/links/abc"), true);
  assert.equal(isNavItemActive(links, "/insights"), false);
});
