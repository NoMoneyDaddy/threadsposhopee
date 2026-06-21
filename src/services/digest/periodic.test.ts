import { test } from "node:test";
import assert from "node:assert/strict";
import { composePeriodicDigest } from "./periodic";

test("composePeriodicDigest: 含標題、發布量、各帳號、收益", () => {
  const msg = composePeriodicDigest({
    label: "本週",
    days: 7,
    totalPublished: 12,
    byAccount: [
      { name: "帳號A", count: 7 },
      { name: "帳號B", count: 5 }
    ],
    byProduct: [{ name: "好物X", count: 4 }],
    revenue: { commission: 123.4, conversions: 6 }
  });
  assert.match(msg, /本週績效摘要/);
  assert.match(msg, /近 7 天/);
  assert.match(msg, /已發布：12 篇/);
  assert.match(msg, /帳號A：7 篇/);
  assert.match(msg, /好物X/);
  assert.match(msg, /NT\$ 123\.40/);
});

test("composePeriodicDigest: 無收益則略過收益行", () => {
  const msg = composePeriodicDigest({
    label: "本月",
    days: 30,
    totalPublished: 0,
    byAccount: [],
    byProduct: [],
    revenue: null
  });
  assert.match(msg, /本月績效摘要/);
  assert.doesNotMatch(msg, /分潤收益/);
});
