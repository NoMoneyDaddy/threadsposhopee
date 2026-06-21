import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregateItemRevenue, attributeRevenueByAccount } from "./report";

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

test("attributeRevenueByAccount：依 sp_<前8碼> 歸因、含多 subId 串接，未對應歸其他", () => {
  const accounts = [
    { id: "abcd1234efgh", label: "主帳號" },
    { id: "zzzz9999yyyy", label: null } // 無 label → 用前8碼
  ];
  const subs = [
    { subId: "sp_abcd1234", commission: 10, count: 2 }, // → 主帳號
    { subId: "threadspo_sp_abcd1234", commission: 5, count: 1 }, // 串接也算 → 主帳號
    { subId: "sp_zzzz9999", commission: 7, count: 3 }, // → zzzz9999
    { subId: "（未標記）", commission: 4, count: 1 } // → 其他
  ];
  const r = attributeRevenueByAccount(subs, accounts);
  // 依佣金排序
  assert.deepEqual(r, [
    { name: "主帳號", commission: 15, count: 3 },
    { name: "zzzz9999", commission: 7, count: 3 },
    { name: "其他／未對應", commission: 4, count: 1 }
  ]);
});

test("attributeRevenueByAccount：無帳號時全歸其他", () => {
  const r = attributeRevenueByAccount([{ subId: "sp_x", commission: 2, count: 1 }], []);
  assert.deepEqual(r, [{ name: "其他／未對應", commission: 2, count: 1 }]);
});
