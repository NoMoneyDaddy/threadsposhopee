import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, csvRows } from "./csv";

test("csvCell：純值不加引號", () => {
  assert.equal(csvCell("hello"), "hello");
  assert.equal(csvCell(123), "123");
  assert.equal(csvCell(0), "0");
});

test("csvCell：含逗號/引號/換行需包引號並把引號加倍", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(csvCell("line1\nline2"), '"line1\nline2"');
  assert.equal(csvCell("a\r\nb"), '"a\r\nb"');
});

test("csvCell：公式注入前綴中和（=+-@ 與 tab）", () => {
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("+1"), "'+1");
  assert.equal(csvCell("-2"), "'-2");
  assert.equal(csvCell("@foo"), "'@foo");
  assert.equal(csvCell("\tx"), "'\tx");
});

test("csvCell：公式前綴且含逗號 → 先中和再包引號", () => {
  assert.equal(csvCell("=cmd,x"), `"'=cmd,x"`);
});

test("csvCell：null/undefined → 空字串", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("csvRows：依欄位鍵組裝、缺值補空、逐欄逸出", () => {
  const list = [
    { name: "甲, 乙", count: 3 },
    { name: "丙", count: 0 }
  ];
  assert.equal(csvRows(list, ["name", "count"]), '"甲, 乙",3\n丙,0');
});

test("csvRows：缺欄位以空字串補", () => {
  assert.equal(csvRows([{ a: 1 }], ["a", "b"]), "1,");
  assert.equal(csvRows([], ["a"]), "");
});
