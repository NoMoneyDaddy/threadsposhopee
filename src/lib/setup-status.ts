import {
  listThreadsAccounts,
  hasGeminiKey,
  listShopeeAccounts,
  getShopeeAffiliateId,
  getUserCloudinary,
  hasApifyCredentials,
  getUserTelegramChatId,
  getUserDiscordWebhook
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
  const [threads, shopeeAccts, affId, cloud, apify, tg, dc, gem] = await Promise.all([
    listThreadsAccounts(id),
    listShopeeAccounts(id),
    getShopeeAffiliateId(id),
    getUserCloudinary(id),
    user.isOwner ? hasApifyCredentials(id) : Promise.resolve({ bound: true, actor: null }),
    getUserTelegramChatId(id),
    getUserDiscordWebhook(id),
    hasGeminiKey(id)
  ]);

  const steps: SetupStep[] = [
    {
      key: "threads",
      title: "連結 Threads 發文帳號",
      desc: "用官方 OAuth 一鍵綁定你要發文的 Threads 帳號。",
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
      key: "cloudinary",
      title: "綁定圖片／影片存放（Cloudinary）",
      desc: "圖片／影片會存進你自己的 Cloudinary 帳號，不耗伺服器流量。必綁，無共用後備。",
      done: Boolean(cloud),
      required: true,
      href: "/accounts#setup-cloudinary"
    },
    {
      key: "notify",
      title: "設定通知（選填）",
      desc: "綁 Telegram／Discord，待審與異常即時通知你。",
      done: Boolean(tg) || Boolean(dc),
      required: false,
      href: "/settings#setup-notify"
    }
  ];

  // 爬蟲為管理者專屬，插在分潤金鑰之後。
  if (user.isOwner) {
    steps.splice(3, 0, {
      key: "apify",
      title: "綁定自動抓文（Apify）",
      desc: "管理者專屬：綁你自己的 Apify 帳號才能自動監看來源。",
      done: apify.bound,
      required: true,
      href: "/accounts#setup-apify"
    });
  }

  return steps;
}
