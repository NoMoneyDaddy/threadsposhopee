// 發布節奏：在「保底間隔」之上加可預測的隨機抖動，避免固定節奏被偵測，
// 同時讓前端能算出每篇的預計發文時間（ETA）。
// 抖動用穩定雜湊（同 seed → 同值），這樣同一輪 cron 與 ETA 估算結果一致、不會亂跳。

// 小型字串雜湊（FNV-1a 變體），回傳非負整數。
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// 由 seed 推出 0..jitterMax（含）的穩定抖動分鐘數。
export function gapJitterMinutes(seed: string, jitterMax: number): number {
  // NaN 防禦：env 解析失敗（如非數字）→ NaN，若不擋會讓間隔變 NaN 使防封失效
  if (!Number.isFinite(jitterMax) || jitterMax <= 0) return 0;
  return hash(seed) % (Math.floor(jitterMax) + 1);
}

// 把 seed（通常是帳號 id）穩定分到 0..total-1 的某一片，用於多 cron 並行分片發文。
// 同帳號永遠落同一片，確保防封節奏（以帳號為單位）不被分片打散。
export function shardOf(seed: string, total: number): number {
  if (!Number.isFinite(total) || total <= 1) return 0;
  return hash(seed) % Math.floor(total);
}

// 有效間隔 = 保底 + 抖動（分）。seed 通常用「帳號id + 上次發文時間」，
// 讓每一段間隔固定但彼此不同。
export function effectiveGapMinutes(floorMin: number, jitterMax: number, seed: string): number {
  const floor = Number.isFinite(floorMin) ? Math.max(0, floorMin) : 0;
  return floor + gapJitterMinutes(seed, jitterMax);
}

export interface QueuePlanItem {
  id: string;
  etaIso: string | null; // 預計發文時間；null 表示無法估（如未綁帳號）
  reason: string; // 給使用者看的狀態：排隊中／間隔等待／今日已達上限／排程…
}

export interface PlanInput {
  drafts: { id: string; scheduledAt: string | null }[]; // 同一帳號、依預計順序
  lastPublishedAt: string | null;
  publishedLast24h: number;
  floorMin: number;
  jitterMax: number;
  dailyCap: number;
  accountId: string;
  now: number;
}

// 乾跑佇列節奏，算出同一帳號各草稿的預計發文時間與狀態（不實際發文）。
export function planAccountQueue(input: PlanInput): QueuePlanItem[] {
  const { drafts, floorMin, jitterMax, dailyCap, accountId, now } = input;
  const out: QueuePlanItem[] = [];
  let lastAt = input.lastPublishedAt ? new Date(input.lastPublishedAt).getTime() : null;
  let postedToday = input.publishedLast24h;

  for (let i = 0; i < drafts.length; i++) {
    const d = drafts[i];
    // 已達每日上限：要等額度釋出（保守估 +24h）。以 max(lastAt, now) 為基準，
    // 確保 ETA 單調遞增，不會比前一篇還早。
    if (postedToday >= dailyCap) {
      const reference = Math.max(lastAt ?? now, now);
      const nextDay = reference + 24 * 60 * 60 * 1000;
      out.push({ id: d.id, etaIso: new Date(nextDay).toISOString(), reason: "今日已達上限，明天接續" });
      lastAt = nextDay;
      postedToday = 1;
      continue;
    }
    // 最小間隔（含抖動）：以「上次發文時間」為 seed
    const gapMin = lastAt === null ? 0 : effectiveGapMinutes(floorMin, jitterMax, `${accountId}:${lastAt}`);
    // 間隔已過很久時 lastAt+gap 會落在過去，夾到 now 以免 ETA 顯示過期時間
    let candidate = lastAt === null ? now : Math.max(now, lastAt + gapMin * 60000);
    let reason = candidate <= now ? "排隊中（下輪可發）" : `間隔等待（約 ${gapMin} 分）`;
    // 使用者指定排程時間 → 取較晚者
    if (d.scheduledAt) {
      const s = new Date(d.scheduledAt).getTime();
      if (s > candidate) {
        candidate = s;
        reason = "已排程";
      }
    }
    out.push({ id: d.id, etaIso: new Date(candidate).toISOString(), reason });
    lastAt = candidate;
    postedToday += 1;
  }
  return out;
}

// 帳號發文連續失敗斷路器：本輪同帳號累積失敗數達上限即「開路」，跳過該帳號其餘草稿，
// 避免對壞掉/被封帳號連續打 API 升高封號風險。limit<=0 表關閉（向後相容）。
export function circuitOpen(failuresThisRun: number, limit: number): boolean {
  return Number.isFinite(limit) && limit > 0 && failuresThisRun >= limit;
}

// 把「可發時間（eta）」對齊到排程器（cron）的下一個執行點：背景 worker 只在 cron 醒來那一刻送出，
// 故實際送出時間 = 不早於 eta 的下一個 cron tick。以 lastCronMs 為相位錨、每 intervalMs 一次推算，
// 讓儀表板的預計時間更貼近實際送出（消除「顯示可發時間、實際晚一個 cron 週期」的落差）。
// 無有效 lastCronMs／interval（排程未啟用或無心跳）→ 無法推算相位，原樣回傳 eta（不亂猜）。
export function projectToCronTick(etaMs: number, lastCronMs: number | null, intervalMs: number): number {
  if (lastCronMs == null || !Number.isFinite(lastCronMs) || !(intervalMs > 0)) return etaMs;
  const k = Math.ceil((etaMs - lastCronMs) / intervalMs);
  const tick = lastCronMs + Math.max(1, k) * intervalMs; // eta<=上次心跳（已逾期）也排到下一輪
  return Math.max(etaMs, tick);
}

// 新帳號暖機：前 warmupDays 天內，每日發文上限自 1 線性遞增到 maxPerDay，降低新號被封風險。
// warmupDays<=0 或帳號已滿暖機期 → 回 maxPerDay（不限制）。ageDays = 帳號建立至今天數。
export function warmupDailyCap(maxPerDay: number, warmupDays: number, ageDays: number): number {
  if (warmupDays <= 0 || ageDays >= warmupDays) return maxPerDay;
  const frac = Math.min(1, (Math.max(0, ageDays) + 1) / warmupDays);
  return Math.max(1, Math.min(maxPerDay, Math.ceil(maxPerDay * frac)));
}

// 觸及自動調速：偵測到該帳號近期觸及驟降時放慢節奏——最小間隔 ×factor、每日上限 ÷factor（至少 1）。
// reachDrop=false 或 factor<=1（關閉）回原值。純函式可測。
export function reachAdjustedPacing(
  base: { minGapMinutes: number; maxPerDay: number },
  reachDrop: boolean,
  factor: number
): { minGapMinutes: number; maxPerDay: number } {
  if (!reachDrop || !Number.isFinite(factor) || factor <= 1) return base;
  return {
    minGapMinutes: Math.round(base.minGapMinutes * factor),
    maxPerDay: Math.max(1, Math.floor(base.maxPerDay / factor))
  };
}

export interface PacingInput {
  failuresThisRun: number; // 本輪該帳號已累積失敗數
  failureLimit: number; // 斷路器上限（0=關）
  doneThisRun: number; // 本輪該帳號已發數
  batchPerRun: number; // 每輪每帳號上限
  publishedLast24h: number; // 近 24h 已發數
  maxPerDay: number; // 每日上限
  warmupDays: number; // 暖機天數（0=關）
  createdAt: string | null; // 帳號建立時間（暖機計算用）
  lastPublishedAt: string | null; // 上次發文時間（間隔計算用）
  minGapMinutes: number; // 保底間隔
  gapJitterMinutes: number; // 間隔抖動上限
  accountId: string; // 抖動 seed 用
  now: number; // 現在時間 ms
}

// 同步節奏守衛：回傳第一個觸發的「略過原因」，或 null（可發）。
// 順序＝發文佇列原迴圈守衛順序（斷路器→批次→每日上限→最小間隔），抽出以利單元測試。
export function nextPacingSkipReason(p: PacingInput): string | null {
  if (circuitOpen(p.failuresThisRun, p.failureLimit)) {
    return `帳號本輪連續失敗 ${p.failuresThisRun} 次，暫停發文`;
  }
  if (p.doneThisRun >= p.batchPerRun) {
    return "本次批次已達上限";
  }
  const dailyCap =
    p.warmupDays > 0 && p.createdAt
      ? warmupDailyCap(p.maxPerDay, p.warmupDays, Math.floor((p.now - new Date(p.createdAt).getTime()) / 86_400_000))
      : p.maxPerDay;
  if (p.publishedLast24h + p.doneThisRun >= dailyCap) {
    return `已達每日上限（${dailyCap}）`;
  }
  if (p.lastPublishedAt) {
    const gapMin = (p.now - new Date(p.lastPublishedAt).getTime()) / 60000;
    const required = effectiveGapMinutes(p.minGapMinutes, p.gapJitterMinutes, `${p.accountId}:${new Date(p.lastPublishedAt).getTime()}`);
    if (gapMin < required) {
      return `未達最小間隔（${Math.round(gapMin)}/${required} 分）`;
    }
  }
  return null;
}
