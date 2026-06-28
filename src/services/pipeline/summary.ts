// Pipeline 純函式 helper（無 server 依賴，client/server 共用、可單測）。

export interface MaterialReuseCandidate {
  affiliate_valid?: boolean | null;
  main_text?: string | null;
  affiliate_short_link?: string | null;
}

// 素材是否可直接重用（命中即略過、省 AI/Shopee 呼叫）：連結有效＋有文案＋有短連結。
export function isMaterialReusable(m: MaterialReuseCandidate | null | undefined): boolean {
  return Boolean(m && m.affiliate_valid && m.main_text && m.affiliate_short_link);
}

export interface PipelineRunSummary {
  created: number;
  reused: number;
  failed: number;
  message: string;
}

// 手動抓取結果摘要：彙總各來源「待審素材／重用／失敗」數，組成顯示訊息。
// 對非陣列／缺欄位輸入容錯（API 異常時不崩潰）。
// 註：爬蟲產出一律進「待審」由人工逐筆核准才入庫；created 計的是本輪新產生（待審）的素材數。
export function summarizePipelineRun(results: unknown): PipelineRunSummary {
  const rows = (Array.isArray(results) ? results : []) as Array<{ created?: unknown; reusedMaterial?: unknown; error?: unknown }>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const created = rows.reduce((n, r) => n + num(r?.created), 0);
  const reused = rows.reduce((n, r) => n + num(r?.reusedMaterial), 0);
  const failed = rows.filter((r) => r?.error).length;
  const parts = [`待審 ${created} 則素材`];
  if (reused) parts.push(`重用 ${reused}`);
  if (failed) parts.push(`${failed} 個來源失敗`);
  const message = `${parts.join("、")}${created ? "，到「素材」頁逐筆確認入庫" : ""}`;
  return { created, reused, failed, message };
}
