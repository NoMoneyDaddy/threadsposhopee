// 把長文切成多段 Threads 貼文，每段 ≤ limit（預設 500，Threads 上限）。
// 盡量在換行／句末標點切，避免硬切字；單句仍超長才硬切。純函式可測。
export const THREADS_TEXT_LIMIT = 500;

// 句子切：在中英句末標點後切，保留標點（…[句]。 / …[句]！）。
function splitSentences(s: string): string[] {
  return s.match(/[^。！？!?]*[。！？!?]+|[^。！？!?]+/g) ?? (s ? [s] : []);
}

// 把文字拆成「不超過 limit」的基本單位（保留空行以維持段落感）。
function splitToUnits(text: string, limit: number): string[] {
  const out: string[] = [];
  for (const line of text.split("\n")) {
    if (line.length <= limit) {
      out.push(line); // 含空行（""）→ 打包時還原段落間距
      continue;
    }
    for (const sent of splitSentences(line)) {
      if (sent.length <= limit) out.push(sent);
      else for (let i = 0; i < sent.length; i += limit) out.push(sent.slice(i, i + limit));
    }
  }
  return out;
}

export function splitForThreads(text: string, limit = THREADS_TEXT_LIMIT): string[] {
  const t = (text ?? "").trim();
  if (!t) return [];
  if (t.length <= limit) return [t];
  const units = splitToUnits(t, limit);
  const out: string[] = [];
  let cur = "";
  for (const u of units) {
    if (!cur) {
      cur = u;
      continue;
    }
    // 以換行接續打包；超過上限就換新段（空行單位也能還原段落間距）。
    if ((cur + "\n" + u).length <= limit) cur += "\n" + u;
    else {
      out.push(cur.trim());
      cur = u;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
