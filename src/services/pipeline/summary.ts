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

// 抓文是否「已捕捉過此商品」（不需重建）：連結有效＋有短連結即可。
// 抓素材不再於當下生成文案（改到「排一篇」時才生成），故這裡不要求 main_text；
// 否則同商品每次被掃到都會被判定「未捕捉」而重建，重燒分潤 token、重傳媒體。
export function isMaterialCaptured(m: MaterialReuseCandidate | null | undefined): boolean {
  return Boolean(m && m.affiliate_valid && m.affiliate_short_link);
}

// 爬蟲產出素材的入庫狀態決策（純函式可測）：
// 無既有素材（新建）→ pending；既有已核准（含舊資料 null/undefined 視同已核准）→ 維持 approved（重產不降級）；
// 既有仍待審 → 維持 pending。
export function decideIntakeStatus(
  existing: { intake_status?: "pending" | "approved" | null } | null | undefined
): "pending" | "approved" {
  if (!existing) return "pending";
  return (existing.intake_status ?? "approved") === "approved" ? "approved" : "pending";
}

export interface PipelineRunSummary {
  created: number;
  pending: number; // 實際進待審的素材數（不含已核准重產）；顯示「待審 N」以此為準
  reused: number;
  failed: number;
  message: string;
}

// 手動抓取結果摘要：彙總各來源「待審素材／重用／失敗」數，組成顯示訊息。
// 對非陣列／缺欄位輸入容錯（API 異常時不崩潰）。
// 註：爬蟲產出進「待審」由人工逐筆核准才入庫；pending=本輪實際進待審數，created=本輪產生/更新總數。
export function summarizePipelineRun(results: unknown): PipelineRunSummary {
  const rows = (Array.isArray(results) ? results : []) as Array<{
    created?: unknown;
    pending?: unknown;
    reusedMaterial?: unknown;
    error?: unknown;
  }>;
  const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  const created = rows.reduce((n, r) => n + num(r?.created), 0);
  // 待審數以 pending 為準（不含已核准重產）；舊版結果無 pending 欄位時退回 created（向後相容）。
  const pending = rows.reduce((n, r) => n + num(r?.pending ?? r?.created), 0);
  const reused = rows.reduce((n, r) => n + num(r?.reusedMaterial), 0);
  const failed = rows.filter((r) => r?.error).length;
  const parts = [`待審 ${pending} 則素材`];
  if (reused) parts.push(`重用 ${reused}`);
  if (failed) parts.push(`${failed} 個來源失敗`);
  const message = `${parts.join("、")}${pending ? "，到「素材」頁逐筆確認入庫" : ""}`;
  return { created, pending, reused, failed, message };
}
