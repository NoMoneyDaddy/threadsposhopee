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
