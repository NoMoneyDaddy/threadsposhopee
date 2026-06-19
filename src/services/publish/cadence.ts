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
