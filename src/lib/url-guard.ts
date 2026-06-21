// 輕量 SSRF 防護：用於「拿使用者/外部來源的 URL 去 fetch」之前。
// 擋掉非 http(s)、localhost、與私有/保留網段的 IP 字面值。
// 字面值會先正規化各種等價編碼（十進位/十六進位整數、IPv4-mapped IPv6）再比對，
// 堵掉 http://2130706433、http://0x7f000001、::ffff:127.0.0.1 之類繞過。
// ponytail: 仍不解析 DNS（擋不了 DNS rebinding——攻擊者用解析到內網的網域）。
// 升級路徑：若要防 rebinding，改為解析 IP 後再比對，或走出站 proxy 白名單。
import { fetchWithTimeout } from "./http";

// 將整數/十六進位等非點分形式的主機名正規化為點分 IPv4（無法判定則回 null）。
function numericHostToIPv4(h: string): string | null {
  let n: number;
  if (/^\d+$/.test(h)) n = Number(h); // 十進位：2130706433 = 127.0.0.1
  else if (/^0x[0-9a-f]+$/.test(h)) n = parseInt(h, 16); // 十六進位：0x7f000001
  else return null;
  if (!Number.isFinite(n) || n < 0 || n > 0xffffffff) return null;
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

function isPrivateOrReservedHost(hostname: string): boolean {
  let h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // 去掉 IPv6 中括號
  if (h === "localhost" || h.endsWith(".localhost")) return true;

  // IPv6 字面值（含冒號）才套用 IPv6 規則，避免誤擋 fc-foo.com 這類網域
  if (h.includes(":")) {
    if (h === "::1" || h === "::") return true; // 迴環 / 未指定
    if (h.startsWith("fc") || h.startsWith("fd")) return true; // ULA fc00::/7
    // link-local fe80::/10 涵蓋 fe80–febf
    if (h.startsWith("fe8") || h.startsWith("fe9") || h.startsWith("fea") || h.startsWith("feb")) return true;
    if (h.startsWith("ff")) return true; // multicast ff00::/8
    // IPv4-mapped/compat（::ffff:127.0.0.1、::ffff:7f00:1）：取出內嵌 IPv4 落到下方判斷
    const dotted = h.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
    if (dotted) h = dotted[1];
    else {
      const hx = h.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (!hx) return false;
      const hi = parseInt(hx[1], 16);
      const lo = parseInt(hx[2], 16);
      h = [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255].join(".");
    }
  } else {
    const numeric = numericHostToIPv4(h);
    if (numeric) h = numeric;
  }

  // IPv4 私網/保留/迴環/link-local
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10 || a === 127 || a === 0) return true;
    if (a === 192 && b === 168) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 169 && b === 254) return true; // link-local
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

// 安全對外 fetch：手動跟隨重定向，且「每一跳」都重過 assertSafePublicUrl。
// 堵住「公網域名 → 302 → 內網/雲端 metadata」的 SSRF 繞過（assertSafePublicUrl 只驗第一跳）。
// 跳數上限 MAX_REDIRECTS；3xx 無 Location 直接把該回應交回呼叫端。
const MAX_REDIRECTS = 5;
export async function fetchSafePublicUrl(
  raw: string | URL,
  init: RequestInit = {},
  timeoutMs = 8000
): Promise<Response> {
  let current = typeof raw === "string" ? raw : raw.href;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    assertSafePublicUrl(current); // 每跳驗證（含初始 URL）
    const res = await fetchWithTimeout(current, { ...init, redirect: "manual" }, timeoutMs);
    if (res.status < 300 || res.status >= 400) return res;
    const loc = res.headers.get("location");
    if (!loc) return res; // 3xx 但無導向目標：交回呼叫端判斷
    current = new URL(loc, current).href; // 相對導向解析為絕對 URL
  }
  throw new Error("重定向次數過多");
}

// 驗證 URL 可安全對外 fetch；不合法則丟出錯誤。
export function assertSafePublicUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("無效的 URL");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`不允許的協定：${url.protocol}`);
  }
  if (isPrivateOrReservedHost(url.hostname)) {
    throw new Error(`不允許存取內網位址：${url.hostname}`);
  }
  return url;
}
