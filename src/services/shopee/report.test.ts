import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateItemRevenue } from "./report";

test("aggregateItemRevenue：依 itemId 加總佣金與筆數", () => {
  const nodes = [
    { orders: [{ items: [{ itemId: 111, itemTotalCommission: "10.5" }, { itemId: 222, itemTotalCommission: "3" }] }] },
    { orders: [{ items: [{ itemId: 111, itemTotalCommission: "4.5" }] }] }
  ];
  const m = aggregateItemRevenue(nodes);
  assert.deepEqual(m["111"], { commission: 15, count: 2 });
  assert.deepEqual(m["222"], { commission: 3, count: 1 });
});

test("aggregateItemRevenue：itemId 為 null 略過、壞佣金算 0", () => {
  const nodes = [
    { orders: [{ items: [{ itemId: null, itemTotalCommission: "9" }, { itemId: 5, itemTotalCommission: "abc" }] }] }
  ];
  const m = aggregateItemRevenue(nodes);
  assert.equal(Object.prototype.hasOwnProperty.call(m, "null"), false);
  assert.deepEqual(m["5"], { commission: 0, count: 1 });
});

test("aggregateItemRevenue：空輸入回空物件", () => {
  assert.deepEqual(aggregateItemRevenue([]), {});
  assert.deepEqual(aggregateItemRevenue([{ orders: [] }]), {});
});
