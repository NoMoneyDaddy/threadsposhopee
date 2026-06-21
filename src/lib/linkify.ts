// 從文字抽出 http(s) 連結；用於「草稿一鍵套轉址」。純函式可測。
// 去除常見結尾標點（。，、!？)）」）避免把句尾符號吃進 URL。
// URL 字元集排除空白與 CJK／全形字（避免把緊接 URL 的中文吃進來）：
// 　-〿 CJK 標點、一-鿿 漢字、＀-￯ 全形。
const URL_RE = /https?:\/\/[^\s<>"'　-〿一-鿿＀-￯]+/g;
const TRAILING = /[.,!?)\]]+$/;

export function extractHttpUrls(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(URL_RE)) {
    const url = m[0].replace(TRAILING, "");
    if (url && !out.includes(url)) out.push(url);
  }
  return out;
}

// 依對照表把文字中的 URL 取代為短連結（長的先換，避免前綴誤замена）。
export function replaceUrls(text: string, map: Record<string, string>): string {
  let out = text;
  for (const from of Object.keys(map).sort((a, b) => b.length - a.length)) {
    out = out.split(from).join(map[from]);
  }
  return out;
}
