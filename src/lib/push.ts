// Web Push（VAPID）發送。設了 NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY 才啟用。
// 絕不丟錯（通知失敗不該炸上層）；推播回 404/410 視為失效訂閱，順手清除。
import webpush from "web-push";
import { env, isDemoMode } from "./env";
import { log } from "./logger";
import { listPushSubscriptions, deletePushSubscriptionsByEndpoint } from "./push-store";

export function isPushConfigured(): boolean {
  return !isDemoMode && Boolean(env.vapidPublicKey && env.vapidPrivateKey);
}

let vapidSet = false;
function ensureVapid() {
  if (vapidSet) return;
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
  vapidSet = true;
}

// 發推播給某使用者的所有裝置。payload 為通知標題＋內文＋點擊網址。
export async function sendUserPush(
  ownerId: string,
  body: string,
  opts: { title?: string; url?: string } = {}
): Promise<void> {
  if (!isPushConfigured() || !ownerId) return;
  try {
    ensureVapid();
    const subs = await listPushSubscriptions(ownerId);
    if (subs.length === 0) return;
    const payload = JSON.stringify({ title: opts.title ?? "IwantPo", body, url: opts.url ?? "/" });
    const dead: string[] = [];
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload);
        } catch (e) {
          const code = (e as { statusCode?: number })?.statusCode;
          if (code === 404 || code === 410) dead.push(s.endpoint);
          else log.warn("Web Push 發送失敗", { code, err: e instanceof Error ? e.message : e });
        }
      })
    );
    if (dead.length) await deletePushSubscriptionsByEndpoint(dead).catch(() => {});
  } catch (e) {
    log.warn("Web Push 發送流程失敗", { err: e instanceof Error ? e.message : e });
  }
}
