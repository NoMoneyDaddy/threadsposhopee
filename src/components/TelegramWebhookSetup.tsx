"use client";

import { useEffect, useRef, useState } from "react";

// owner 專屬：一鍵把 Telegram webhook 註冊到目前網域。
// deeplink 綁定與遠端審核都靠這個 webhook 收訊；沒註冊（或 secret 未設）時 bot 不會有任何回應。
// infoOk 區分「查得到 webhook 狀態」與「查詢失敗」：避免把暫時錯誤（超時／token 錯）誤標成「未註冊」。
type Status = {
  botConfigured: boolean;
  secretSet?: boolean;
  infoOk?: boolean;
  info?: { url: string; lastError?: string } | null;
};

export default function TelegramWebhookSetup() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const mountedRef = useRef(true);

  async function refresh() {
    try {
      const res = await fetch("/api/telegram/setup-webhook");
      const json = await res.json();
      if (!mountedRef.current) return;
      if (json.ok) setStatus(json);
      else setMsg(`❌ 讀取 webhook 狀態失敗：${json.error ?? res.status}`);
    } catch (e) {
      if (mountedRef.current) setMsg(`❌ 讀取 webhook 狀態失敗：${e instanceof Error ? e.message : String(e)}`);
    }
  }

  useEffect(() => {
    mountedRef.current = true;
    refresh();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  async function setup() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/telegram/setup-webhook", { method: "POST" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error);
      if (!mountedRef.current) return;
      setMsg(`✅ 已註冊 webhook：${json.webhookUrl}`);
      await refresh();
    } catch (e) {
      if (mountedRef.current) setMsg(`❌ ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (mountedRef.current) setBusy(false);
    }
  }

  if (status && !status.botConfigured) return null; // 沒設 bot token 就不顯示

  const registered = Boolean(status?.info?.url);
  const lookupFailed = Boolean(status && status.infoOk === false); // 查詢失敗 ≠ 未註冊

  return (
    <div className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-medium">Telegram Webhook（管理者）</span>
        {status &&
          (lookupFailed ? (
            <span className="badge-neutral">狀態查詢失敗</span>
          ) : registered ? (
            <span className="badge-success">已註冊</span>
          ) : (
            <span className="badge-neutral">未註冊</span>
          ))}
      </div>
      <p className="mb-2 text-xs text-ink-2">
        deeplink 一鍵綁定與遠端核准都靠 webhook 收訊。<b>若 bot 對 /start 完全沒回應，多半是 webhook 沒註冊</b>。
        按下方按鈕即把 webhook 註冊到「目前網域」。
      </p>

      {status && !status.secretSet && (
        <p className="mb-2 rounded-lg bg-warn/10 p-2 text-xs text-warn">
          ⚠️ 尚未設定 <code>TELEGRAM_WEBHOOK_SECRET</code>：webhook 需要此密鑰驗證請求。請先在環境變數設定並重新部署，再按下方註冊。
        </p>
      )}

      {status?.info?.url && (
        <p className="mb-2 break-all text-[11px] text-ink-2">
          目前：<code>{status.info.url}</code>
          {status.info.lastError ? <span className="text-warn">（最近錯誤：{status.info.lastError}）</span> : null}
        </p>
      )}

      <button
        onClick={setup}
        disabled={!status || busy || !status.secretSet}
        className="btn btn-brand shrink-0"
      >
        {!status ? "載入中…" : busy ? "註冊中…" : registered ? "重新註冊 webhook" : "設定 webhook"}
      </button>

      {msg && <p className="mt-2 break-all text-xs text-ink-2">{msg}</p>}
    </div>
  );
}
