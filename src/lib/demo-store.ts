// Demo 模式記憶體狀態（程序重啟即清空）：未設定 Supabase 時，資料層改用此記憶體 + fixtures。
// 由 store.ts 拆出成獨立模組，讓後續各領域（drafts/materials/accounts…）的拆分都能共用
// 同一個可變物件實例（單例），維持跨函式的記憶體狀態一致。
import type { Draft, Material, Source, ThreadsAccount, ShopeeAccount } from "./types";
import demoData from "@/fixtures/demo-data.json";

export const demo = {
  threadsAccounts: demoData.threadsAccounts as ThreadsAccount[],
  shopeeAccounts: demoData.shopeeAccounts as ShopeeAccount[],
  sources: demoData.sources as Source[],
  drafts: [...(demoData.drafts as Draft[])],
  materials: [] as Material[]
};
