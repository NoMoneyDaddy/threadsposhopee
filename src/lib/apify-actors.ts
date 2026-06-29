// Threads 抓文 actor 清單（單一真實來源）：UI 選擇器、綁定路由白名單、scraper 預設皆引用此處。
// 只開放這兩個「已知輸入/輸出 schema」的 actor（buildScraperInput / parseSearchPosts 有對應分流）；
// 不開放任意 actor，避免輸入格式不符而靜默抓空或計費浪費。純常數，無 server 依賴（client 可 import）。

export const THREADS_ACTORS = {
  default: "automation-lab/threads-scraper",
  legacy: "igview-owner/threads-search-scraper"
} as const;

export interface ThreadsActorOption {
  id: string;
  label: string;
  note: string;
}

export const THREADS_ACTOR_OPTIONS: ThreadsActorOption[] = [
  {
    id: THREADS_ACTORS.default,
    label: "新版 automation-lab",
    note: "搜尋＋帳號貼文，回傳影片/輪播媒體；不支援『帳號內關鍵字搜尋／排序／日期區間』"
  },
  {
    id: THREADS_ACTORS.legacy,
    label: "舊版 igview",
    note: "支援關鍵字＋排序（熱門/最新）＋日期區間＋帳號內搜尋"
  }
];

// 是否為允許切換的已知 actor（綁定路由用，擋掉任意 actor）。
export function isAllowedThreadsActor(actor: string): boolean {
  return actor === THREADS_ACTORS.default || actor === THREADS_ACTORS.legacy;
}
