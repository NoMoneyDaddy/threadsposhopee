// 在終端機跑一次完整 pipeline（Demo 模式不需任何金鑰）。
//   npm run pipeline:demo
import { runAllSources } from "../src/services/pipeline/run";

async function main() {
  console.log("🚀 執行 pipeline…\n");
  const results = await runAllSources();
  for (const r of results) {
    console.log(`來源 @${r.sourceUsername}: 掃描 ${r.scanned}、新增素材 ${r.created}、略過 ${r.skipped}`);
    r.materials.forEach((m) => console.log(`  ↳ 素材 ${m.id}  ${m.productName ?? ""}`));
    r.notes.forEach((n) => console.log(`  · ${n}`));
  }
  console.log("\n✅ 完成");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
