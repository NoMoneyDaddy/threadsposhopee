// 輕量 SSRF 防護：用於「拿使用者/外部來源的 URL 去 fetch」之前。
// 擋掉非 http(s)、localhost、與私有/保留網段的 IP 字面值。
// ponytail: 字面值比對，不解析 DNS（擋不了 DNS rebinding）。
// 升級路徑：若要防 rebinding，改為解析 IP 後再比對，或走出站 proxy 白名單。
function isPrivateOrReservedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, ""); // 去掉 IPv6 中括號
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "0.0.0.0") return true;
  // IPv6 唯一本地位址 fc00::/7
  if (h.startsWith("fc") || h.startsWith("fd")) return true;
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
