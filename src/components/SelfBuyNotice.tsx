// 自我推薦（self-referral）防呆提示：給操作者看的合規警示，避免被蝦皮沒收佣金/列黑名單。
// 這是「保護使用者」的提醒，與對觀眾的低調揭露無關，須清楚可讀。
export default function SelfBuyNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-xl border border-warn/30 bg-warn/10 p-3 text-xs leading-relaxed text-warn ${className}`}
      role="note"
    >
      ⚠️ 請勿用自己的合作連結點擊或下單給自己／同住家人。蝦皮會以同帳號、同裝置、同地址偵測為「自我推薦」，
      可能<b>沒收佣金、甚至列入黑名單</b>。分潤只在他人真實點擊購買時才有效。
    </p>
  );
}
