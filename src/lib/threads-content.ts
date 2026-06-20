// Threads 內容合規（研究依據：重複/機器人式內容與「滿版 hashtag」是降觸及/shadowban 訊號；
// Threads 單則上限 500 字、且只有 1 個 hashtag 會被視為可點，多個常被當作 spam 訊號）。
export const THREADS_TEXT_LIMIT = 500;
export const THREADS_MAX_HASHTAGS = 1;

// 計 hashtag：詞首的 #（前面是字串開頭或空白），# 後接至少一個字母/數字/底線。
export function countHashtags(text: string): number {
  const m = (text ?? "").match(/(?:^|\s)#[\p{L}\p{N}_]+/gu);
  return m ? m.length : 0;
}

export interface ThreadsContentCheck {
  chars: number;
  overLimit: boolean;
  hashtags: number;
  tooManyHashtags: boolean;
  ok: boolean;
}

export function checkThreadsContent(text: string | null | undefined): ThreadsContentCheck {
  const chars = [...(text ?? "")].length; // 與 CharCount 一致：以碼位（含 emoji）計
  const hashtags = countHashtags(text ?? "");
  const overLimit = chars > THREADS_TEXT_LIMIT;
  const tooManyHashtags = hashtags > THREADS_MAX_HASHTAGS;
  return { chars, overLimit, hashtags, tooManyHashtags, ok: !overLimit && !tooManyHashtags };
}
