"use client";

import { useState } from "react";

// 複製短連結（以目前網域組出完整 URL，如 https://go2read.link/r/abc）。
export default function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`${location.origin}${path}`);
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
