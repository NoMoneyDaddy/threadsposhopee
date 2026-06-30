"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TOUR_STORAGE_KEY, TOUR_OPEN_EVENT, shouldAutoOpenTour } from "./product-tour-logic";

// 互動導覽：首次登入自動開啟一次（localStorage 記住），之後可從「使用說明」頁的按鈕重開。
// 用步驟式對話框介紹六大區與核心流程；每步可直接「前往該頁」。
// 採對話框而非 DOM 聚光燈：避免與桌機橫列／手機漢堡選單兩種版型的元素選擇器耦合而易碎。
export { TOUR_STORAGE_KEY, TOUR_OPEN_EVENT } from "./product-tour-logic";

type TourStep = { emoji: string; title: string; body: string; href?: string; hrefLabel?: string };

const STEPS: TourStep[] = [
  {
    emoji: "👋",
    title: "歡迎使用 IwantPo",
    body: "這是多帳號 Threads 排程發文工具：綁你自己的金鑰、AI 幫你寫文案、自動換好分潤連結，再依防封節奏排程發出，一條龍完成。先花一分鐘看懂怎麼運作。"
  },
  {
    emoji: "🔑",
    title: "第一步：綁定你自己的金鑰",
    body: "每樣服務都用你自己的金鑰，我們會加密保存、不會外流。其中 Threads 發文帳號和 Gemini AI 文案一定要綁，蝦皮分潤和圖床（R2 或 Cloudinary）可以之後有需要再補。到帳號管理填進去就好。",
    href: "/accounts",
    hrefLabel: "前往帳號管理"
  },
  {
    emoji: "🧱",
    title: "第二步：準備素材",
    body: "一份素材，就是一個商品配上你的分潤連結，再加幾張圖或一支影片；有綁 Gemini 的話還會順手幫你把文案寫好。到「素材」頁貼上蝦皮商品連結、上傳圖片或影片，系統就幫你換成你的分潤連結存起來。",
    href: "/materials",
    hrefLabel: "前往素材"
  },
  {
    emoji: "📝",
    title: "第三步：草稿都要人工核准",
    body: "素材可以一鍵「再排一篇」變成草稿。所有草稿都要等你核准後才會進發文佇列，AI 不會自己亂發。發文、草稿、AI 部落客和素材都收在工作台裡。",
    href: "/pipeline",
    hrefLabel: "前往工作台"
  },
  {
    emoji: "🛡️",
    title: "第四步：依防封節奏自動發布",
    body: "核准後的草稿不會一次全倒出去，而是抓著間隔、加上隨機的時間落差、控制每天的量，盡量不被當成機器人。串文第二則的分潤留言也可以晚一點再補，一樣帶點隨機落差。"
  },
  {
    emoji: "🔗",
    title: "go2read 中轉短連結",
    body: "可把分潤連結套成自有短連結，搭配揭露式中轉頁。",
    href: "/links",
    hrefLabel: "前往轉址服務"
  },
  {
    emoji: "📊",
    title: "看成效、隨時回來",
    body: "成效分析裡可以看每個帳號、每個商品跑得怎麼樣，收益也會回灌進來。想看金鑰怎麼綁、或更完整的說明，頁尾都找得到。導覽到這結束，去發第一篇吧。",
    href: "/insights",
    hrefLabel: "前往成效分析"
  }
];

export default function ProductTour({ auto = false }: { auto?: boolean }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // 開啟前最後聚焦的元素，關閉時還原焦點（a11y）。
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* localStorage 不可用（隱私模式等）時略過，不影響導覽顯示 */
    }
  }, []);

  // 首次造訪自動開啟一次（是否該開的判斷抽到 shouldAutoOpenTour 純函式、有測試）。
  useEffect(() => {
    if (!auto) return;
    try {
      if (shouldAutoOpenTour(auto, localStorage.getItem(TOUR_STORAGE_KEY))) setOpen(true);
    } catch {
      /* 讀不到就不自動開，使用者仍可手動開 */
    }
  }, [auto]);

  // 任何頁面可派發事件重新開啟（如使用說明頁的「開始導覽」按鈕）。
  useEffect(() => {
    const onOpen = () => {
      setI(0);
      setOpen(true);
    };
    window.addEventListener(TOUR_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(TOUR_OPEN_EVENT, onOpen);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    markSeen();
  }, [markSeen]);

  // 開啟時把焦點移進對話框；關閉（effect cleanup）時還原到原本聚焦的元素。
  useEffect(() => {
    if (!open) return;
    lastFocusedRef.current = (document.activeElement as HTMLElement) ?? null;
    panelRef.current?.focus();
    return () => {
      lastFocusedRef.current?.focus?.();
    };
  }, [open]);

  // 鍵盤：Esc 關閉；Tab／Shift+Tab 在對話框內循環（focus trap），避免焦點落到背景頁。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        return;
      }
      if (e.key !== "Tab") return;
      const root = panelRef.current;
      if (!root) return;
      const focusable = Array.from(
        root.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);
      if (focusable.length === 0) return;
      const firstEl = focusable[0];
      const lastEl = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === firstEl || active === root)) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && active === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  if (!open) return null;
  const step = STEPS[i];
  const last = i === STEPS.length - 1;
  const first = i === 0;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/50 p-4 backdrop-blur-sm sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
      onClick={close}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl outline-none"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-xs text-ink-3">
            導覽 {i + 1} / {STEPS.length}
          </span>
          <button type="button" onClick={close} className="btn btn-ghost btn-sm" aria-label="關閉導覽">
            略過
          </button>
        </div>

        <div className="text-3xl" aria-hidden>
          {step.emoji}
        </div>
        <h2 id="tour-title" className="mt-2 text-lg font-semibold text-ink">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-2 [overflow-wrap:anywhere]">{step.body}</p>

        {step.href && (
          <Link
            href={step.href}
            onClick={close}
            className="mt-3 inline-block rounded-lg bg-surface-2 px-3 py-1.5 text-xs font-medium text-brand hover:opacity-90"
          >
            {step.hrefLabel ?? "前往"} →
          </Link>
        )}

        {/* 進度點 */}
        <div className="mt-4 flex justify-center gap-1.5" aria-hidden>
          {STEPS.map((_, idx) => (
            <span
              key={idx}
              className={`h-1.5 rounded-full transition-all ${idx === i ? "w-4 bg-brand" : "w-1.5 bg-surface-2"}`}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setI((n) => Math.max(0, n - 1))}
            disabled={first}
            className="btn btn-ghost btn-sm disabled:opacity-40"
          >
            上一步
          </button>
          {last ? (
            <button type="button" onClick={close} className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90">
              開始使用 🚀
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setI((n) => Math.min(STEPS.length - 1, n + 1))}
              className="rounded-xl bg-brand px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            >
              下一步
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
