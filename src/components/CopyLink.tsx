"use client";

import { useState } from "react";

// 複製短連結（以目前網域組出完整 URL，如 https://go2read.link/r/abc）。
export default function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      // 有設短網域（如 https://go2read.link）就用它，否則用當前網域。
      const base = process.env.NEXT_PUBLIC_SHORT_DOMAIN || location.origin;
      await navigator.clipboard.writeText(`${base}${path}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // 忽略剪貼簿失敗
    }
  }
  return (
    <button type="button" onClick={copy} className="btn btn-outline btn-sm">
      {copied ? "已複製" : "複製連結"}
    </button>
  );
}
