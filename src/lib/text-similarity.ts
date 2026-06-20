// 文字相似度（防重複措辭：近重複貼文是 Threads 降觸及/shadowban 頭號訊號）。
// 用字元 n-gram（shingle）的 Jaccard——中文無空白分詞，字元級比詞級更穩。

// 正規化：移除網址（分潤短連結每篇不同、不該影響文案相似度判斷）、壓空白、轉小寫。
export function normalizeForSim(text: string): string {
  return (text ?? "")
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function charShingles(text: string, n = 3): Set<string> {
  const s = normalizeForSim(text);
  const out = new Set<string>();
  if (s.length === 0) return out;
  if (s.length < n) {
    out.add(s); // 短文：整串當一個 shingle，仍可與相同短文比對
    return out;
  }
  for (let i = 0; i + n <= s.length; i++) out.add(s.slice(i, i + n));
  return out;
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

export function textSimilarity(a: string, b: string, n = 3): number {
  return jaccard(charShingles(a, n), charShingles(b, n));
}

// text 與一組 others 的最高相似度（0..1）。others 空 → 0。
export function maxSimilarity(text: string, others: string[], n = 3): number {
  if (!text || others.length === 0) return 0;
  const base = charShingles(text, n);
  let max = 0;
  for (const o of others) {
    const sim = jaccard(base, charShingles(o, n));
    if (sim > max) max = sim;
    if (max === 1) break;
  }
  return max;
}
