// 已綁定金鑰的視覺提示：金鑰基於安全不回傳明文，但用遮罩點點讓欄位「看起來有資料」，
// 避免使用者誤以為沒綁（輸入框是空的）。放在金鑰輸入框上方。
export default function BoundKeyHint({ label = "目前已綁定金鑰" }: { label?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-2.5 py-1.5 text-xs">
      <span className="badge-success shrink-0">已綁定</span>
      <span className="min-w-0 flex-1 truncate font-mono tracking-[0.2em] text-ink-3" aria-hidden="true">••••••••••••</span>
      <span className="shrink-0 text-ink-3">{label}（安全起見不顯示）</span>
    </div>
  );
}
