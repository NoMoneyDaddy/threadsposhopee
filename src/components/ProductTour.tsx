"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

// 互動導覽：首次登入自動開啟一次（localStorage 記住），之後可從「使用說明」頁的按鈕重開。
// 用步驟式對話框介紹六大區與核心流程；每步可直接「前往該頁」。
// 採對話框而非 DOM 聚光燈：避免與桌機橫列／手機漢堡選單兩種版型的元素選擇器耦合而易碎。
export const TOUR_STORAGE_KEY = "iwantpo.tour.v1";
export const TOUR_OPEN_EVENT = "iwantpo:open-tour";

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
    body: "每項服務都綁「你自己的」金鑰（加密存、不外露）：Threads 發文帳號、Gemini AI 文案為必要；蝦皮分潤、圖床（R2／Cloudinary）為選用。到帳號管理填入。",
    href: "/accounts",
    hrefLabel: "前往帳號管理"
  },
  {
    emoji: "🧱",
    title: "第二步：準備素材",
    body: "素材 = 一個商品的分潤連結＋AI 文案＋媒體。兩種做法：手動貼一條蝦皮連結即自動產生；或（管理員）開自動抓文，抓到的素材一律進「待審」，逐筆確認才入庫。",
    href: "/materials",
    hrefLabel: "前往素材"
  },
  {
    emoji: "📝",
    title: "第三步：草稿都要人工核准",
    body: "素材可一鍵「排一篇」變草稿。所有草稿一律待你核准後才會進發文佇列——AI 不會自己發文。文章管理整併了發文、草稿、AI 部落客與素材。",
    href: "/drafts",
    hrefLabel: "前往文章管理"
  },
  {
    emoji: "🛡️",
    title: "第四步：依防封節奏自動發布",
    body: "核准的草稿依間隔＋隨機抖動、每日上限、批次節奏發出，避免被判定為機器人。串文 2/2 的分潤留言可延遲補發（保底＋抖動）。"
  },
  {
    emoji: "🔗",
    title: "go2read 中轉短連結",
    body: "可把分潤連結套成自有短連結，搭配揭露式中轉頁：使用者按「繼續」一次點擊才開分潤＋去來源（真實點擊才觸發，不做 cookie stuffing）。",
    href: "/links",
    hrefLabel: "前往轉址服務"
  },
  {
    emoji: "📊",
    title: "看成效、隨時回來",
    body: "成效分析看各帳號／商品表現與收益回灌。需要詳細金鑰教學或完整說明，footer 都找得到。導覽結束，開始發文吧！",
    href: "/insights",
    hrefLabel: "前往成效分析"
  }
];

export default function ProductTour({ auto = false }: { auto?: boolean }) {
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);

  const markSeen = useCallback(() => {
    try {
      localStorage.setItem(TOUR_STORAGE_KEY, "1");
    } catch {
      /* localStorage 不可用（隱私模式等）時略過，不影響導覽顯示 */
    }
  }, []);

  // 首次造訪自動開啟一次。
  useEffect(() => {
    if (!auto) return;
    try {
      if (!localStorage.getItem(TOUR_STORAGE_KEY)) setOpen(true);
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

  // Esc 關閉。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
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
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
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
