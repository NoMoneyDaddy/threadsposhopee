import { runAllSources } from "@/services/pipeline/run";
import { createCronHandler } from "@/lib/cron-handler";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 爬取／產草稿排程。Cron 以 GET 呼叫，帶 Authorization: Bearer <CRON_SECRET>。
export const GET = createCronHandler("爬取", async () => ({ results: await runAllSources() }));
