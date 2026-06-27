// view-as 共用常量（純值、無 server 相依），供 client 元件與 server（auth/middleware/route）共用，
// 避免字串在前後端各自硬編碼而漂移導致預覽切換無聲失效。
export const VIEW_AS_COOKIE = "view_as";
// 特殊值：用管理者自己的帳號/資料，但以「一般成員」身分呈現（預覽非管理者選單與權限），唯讀。
export const VIEW_AS_MEMBER_PREVIEW = "__member_preview__";
