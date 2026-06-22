"use client";

import { useState } from "react";

// 收藏切換（高黏著度）：樂觀更新愛心與數字。
export default function FavoriteButton({ id, initial, count }: { id: string; initial: boolean; count: number }) {
  const [fav, setFav] = useState(initial);
  const [n, setN] = useState(count);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const prevFav = fav;
    const prevN = n;
    setFav(!prevFav);
    setN(prevN + (prevFav ? -1 : 1));
    try {
      const res = await fetch("/api/materials/favorite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id })
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      setFav(json.favorited);
      setN(prevN + (json.favorited ? 1 : 0) - (prevFav ? 1 : 0));
    } catch {
      setFav(prevFav);
      setN(prevN);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      disabled={busy}
      aria-pressed={fav}
      aria-label={fav ? "取消收藏" : "收藏"}
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-sm transition-colors ${
        fav ? "bg-brand/10 text-brand" : "bg-surface-2 text-ink-2 hover:text-ink"
      }`}
    >
      <span aria-hidden>{fav ? "❤️" : "🤍"}</span>
      {n > 0 && <span className="tabular-nums">{n}</span>}
    </button>
  );
}
