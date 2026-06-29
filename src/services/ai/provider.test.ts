import { test } from "node:test";
import assert from "node:assert/strict";
import { parseVariations } from "./provider";

test("以獨立一行 === 分隔切出多版本", () => {
  const raw = "版本一\n===\n版本二\n===\n版本三";
  assert.deepEqual(parseVariations(raw, 3), ["版本一", "版本二", "版本三"]);
});

test("不切正文內含的 ===（非整行）", () => {
  const raw = "這支耳機 CP 值 === 高\n===\n第二版";
  assert.deepEqual(parseVariations(raw, 3), ["這支耳機 CP 值 === 高", "第二版"]);
});

test("去空白、濾空、取前 n 條", () => {
  const raw = "  a  \n===\n\n===\n b \n===\n c \n===\n d ";
  assert.deepEqual(parseVariations(raw, 2), ["a", "b"]);
});

test("也接受 --- / *** 等分隔線", () => {
  assert.deepEqual(parseVariations("甲\n---\n乙\n***\n丙", 3), ["甲", "乙", "丙"]);
});

test("沒放分隔線時用行首編號切，並去掉編號標記", () => {
  const raw = "1. 第一版\n第一版第二段\n2) 第二版\n3、第三版";
  assert.deepEqual(parseVariations(raw, 3), ["第一版\n第一版第二段", "第二版", "第三版"]);
});

test("沒放分隔線時用『版本X：』標記切", () => {
  const raw = "版本一：耳機不錯\n版本二：用兩週很滿意\n版本三：相見恨晚";
  assert.deepEqual(parseVariations(raw, 3), ["耳機不錯", "用兩週很滿意", "相見恨晚"]);
});
