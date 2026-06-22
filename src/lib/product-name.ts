// 蝦皮商品標題常塞滿 SEO 關鍵字／促銷詞（如「【現貨】多功能 廚房 瀝水架 收納神器 免運 712」），
// 整串餵 AI 會污染文案。抽出較乾淨的核心品名：去括號標籤群、去常見促銷雜詞、去尾端 SKU 數字、收斂長度。
// 純啟發式（標題格式千奇百怪，不求完美）；保留原始標題另存，使用者可手動覆寫。
const NOISE = [
  "現貨",
  "免運",
  "快速出貨",
  "台灣出貨",
  "台灣現貨",
  "蝦皮店到店",
  "超商取貨",
  "貨到付款",
  "限時特價",
  "下殺",
  "買一送一",
  "熱賣",
  "爆款",
  "正品",
  "公司貨",
  "官方",
  "輸入折扣碼"
];

// 分潤率字串小數（"0.05"）→ 顯示用百分比（"5%"）。無效/空 → null。
export function formatCommissionRate(rate: string | null | undefined): string | null {
  if (!rate) return null;
  const n = Number(rate);
  if (!Number.isFinite(n) || n <= 0) return null;
  const pct = n * 100;
  return `${Number.isInteger(pct) ? pct : pct.toFixed(1)}%`;
}

export function cleanProductName(raw: string | null | undefined): string {
  if (!raw) return "";
  let s = raw;
  // 去各式括號群（含內容）：【】〔〕［］[]（）()「」『』
  s = s.replace(/[【〔［\[（(「『][^】〕］\]）)」』]*[】〕］\]）)」』]/g, " ");
  // 去促銷雜詞
  for (const w of NOISE) s = s.split(w).join(" ");
  // 去尾端 SKU／純數字編號片段
  s = s.replace(/[#＃]?\s*[A-Za-z]*\d{3,}[A-Za-z\d-]*\s*$/u, " ");
  // 收斂空白／分隔符
  s = s.replace(/[|｜/／・,，、]+/g, " ").replace(/\s+/g, " ").trim();
  // 太長時取前段（以空白切，最多 ~30 字）
  if ([...s].length > 30) s = [...s].slice(0, 30).join("").trim();
  return s || (raw.trim());
}
