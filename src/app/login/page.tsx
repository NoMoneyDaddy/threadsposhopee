import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-10">
      <div className="mb-7 text-center">
        <span
          aria-hidden
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-ink text-3xl font-bold leading-none text-bg shadow-pop"
        >
          @
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-brand">ThreadsPo</span>Shopee
        </h1>
        <p className="mt-2 text-sm text-ink-2">把蝦皮分潤，自動發成 Threads 貼文。</p>
      </div>
      <div className="card-p">
        <LoginForm next={searchParams.next ?? "/"} />
      </div>
      <p className="mt-5 text-center text-xs text-ink-3">多帳號 · 排程 · AI 文案 · 防封節奏</p>
    </div>
  );
}
