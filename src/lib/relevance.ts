// 商品×文案相關性提示（防「掛羊頭」：分潤商品與貼文內容不符，易被蝦皮判誤導、被 Threads 降權）。
// 不硬擋——只在草稿卡給人工審核者一個警示（人工核准模型）。
// 中文無空白分詞，用字元 bigram 的「容納率」：商品名的 bigram 有多少比例出現在文案裡。
import { charShingles } from "./text-similarity";

// 通用/佔位商品名（如「商品 12345」「這個好物」）沒有實際關鍵詞，不該觸發誤報。
function isGenericName(name: string): boolean {
  const t = name.trim();
  return t === "" || /^商品\s*\d+$/.test(t) || t === "這個好物";
}

// 0..1：商品名 bigram 出現在文案 bigram 的比例（容納率）。無有效輸入回 1（視為相關、不警示）。
export function productTextRelevance(productName: string | null | undefined, text: string | null | undefined): number {
  const name = (productName ?? "").trim();
  const body = (text ?? "").trim();
  if (!name || !body || isGenericName(name)) return 1;
  const nameGrams = charShingles(name, 2);
  const textGrams = charShingles(body, 2);
  if (nameGrams.size === 0) return 1;
  let inter = 0;
  for (const g of nameGrams) if (textGrams.has(g)) inter++;
  return inter / nameGrams.size;
}

// 是否「相關性偏低」需提醒（門檻保守，預設容納率 < 0.3 才警示，避免吵）。
export function isLowRelevance(
  productName: string | null | undefined,
  text: string | null | undefined,
  threshold = 0.3
): boolean {
  const name = (productName ?? "").trim();
  const body = (text ?? "").trim();
  if (!name || !body || isGenericName(name)) return false; // 無訊號不警示
  return productTextRelevance(name, body) < threshold;
}
