// 在終端機跑一次完整 pipeline（Demo 模式不需任何金鑰）。
//   npm run pipeline:demo
import { runAllSources } from "../src/services/pipeline/run";

async function main() {
  console.log("🚀 執行 pipeline…\n");
  const results = await runAllSources();
  for (const r of results) {
    console.log(`來源 @${r.sourceUsername}: 掃描 ${r.scanned}、新增 ${r.created}、略過 ${r.skipped}`);
    r.drafts.forEach((d) => console.log(`  ↳ 草稿 ${d.id}  ${d.productName ?? ""}`));
    r.notes.forEach((n) => console.log(`  · ${n}`));
  }
  console.log("\n✅ 完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
