// 留言（串文 2/2 分潤連結）延遲分鐘：避免主文一發就「秒留言」的固定行為被偵測。
// 逐則覆寫（reply_delay_minutes）優先；否則用全域保底 + 隨機抖動。
// 抖動沿用發布節奏的穩定雜湊（同 seed → 同值），seed 用草稿 id，讓每則固定但彼此不同。
import { gapJitterMinutes } from "./cadence";

export function replyDelayMinutes(
  seed: string,
  floorMin: number,
  jitterMax: number,
  overrideMin?: number | null
): number {
  // 逐則覆寫：非負有限數才採用（0 = 立即）
  if (typeof overrideMin === "number" && Number.isFinite(overrideMin) && overrideMin >= 0) {
    return Math.floor(overrideMin);
  }
  const floor = Number.isFinite(floorMin) ? Math.max(0, floorMin) : 0;
  return floor + gapJitterMinutes(seed, jitterMax);
}
