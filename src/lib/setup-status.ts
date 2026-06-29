import {
  listThreadsAccounts,
  hasGeminiKey,
  listShopeeAccounts,
  getShopeeAffiliateId,
  getUserCloudinary,
  hasUserR2,
  hasApifyCredentials,
  getUserTelegramChatId
} from "@/lib/store";
import type { AppUser } from "@/lib/auth";

export interface SetupStep {
  key: string;
  title: string;
  desc: string;
  done: boolean;
  required: boolean;
  href: string;
}

// 計算「目前這位使用者」的設定完成度（引導卡牌用）。一律以 user.id 查 → 各人各自的狀態。
export async function getSetupSteps(user: AppUser): Promise<SetupStep[]> {
  const id = user.id;
  const [threads, shopeeAccts, affId, cloud, r2, apify, tg, gem] = await Promise.all([
    listThreadsAccounts(id),
    listShopeeAccounts(id),
    getShopeeAffiliateId(id),
    getUserCloudinary(id),
    hasUserR2(id),
    // Apify 為平台管理員專屬：非管理員不顯示此步驟，也不必查（避免無謂 I/O 與失敗耦合）。
    user.isOwner ? hasApifyCredentials(id) : Promise.resolve({ bound: false, actor: null }),
    getUserTelegramChatId(id),
    hasGeminiKey(id)
  ]);

  const steps: SetupStep[] = [
    {
      key: "threads",
      title: "連結 Threads 發文帳號",
      desc: "到帳號管理貼上你的 Threads access token 即完成綁定（系統會在到期前自動嘗試展期；失效則需重新貼上）。",
      done: threads.length > 0,
      required: true,
      href: "/accounts#setup-threads"
    },
    {
      key: "gemini",
      title: "綁定你自己的 AI 金鑰（Gemini）",
      desc: "AI 文案只會用你自己綁的 Gemini 金鑰，不與他人共用。",
      done: gem,
      required: true,
      href: "/accounts#setup-gemini"
    },
    {
      key: "shopee",
      title: "綁定蝦皮分潤金鑰",
      desc: "用你自己的蝦皮分潤帳號產生連結；未綁也能直接貼現成的分潤連結。",
      done: shopeeAccts.length > 0 || Boolean(affId),
      required: user.isOwner,
      href: "/accounts#setup-shopee"
    },
    {
      key: "media",
      title: "綁定圖片／影片存放（Cloudinary 或 Cloudflare R2）",
      desc: "想發圖片／影片再綁；純文字發文不需要。素材會存進你自己的雲端（二擇一），不耗伺服器流量。",
      done: Boolean(cloud) || r2,
      required: false,
      href: "/accounts#setup-media"
    },
    {
      key: "notify",
      title: "設定通知（選填）",
      desc: "綁 Telegram，待審與異常即時通知你。",
      done: Boolean(tg),
      required: false,
      href: "/settings#setup-notify"
    }
  ];

  // 自動抓文（Apify，選填）：平台管理員專屬功能，插在分潤金鑰之後；一般成員不顯示此步驟。
  if (user.isOwner) {
    steps.splice(3, 0, {
      key: "apify",
      title: "綁定抓文生素材（Apify，選填）",
      desc: "綁 Apify 帳號即可自動監看來源、自動產生草稿；不綁也能手動建素材。計費算在你自己帳上。",
      done: apify.bound,
      required: false,
      href: "/accounts#setup-apify"
    });
  }

  return steps;
}
