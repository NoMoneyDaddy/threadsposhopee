import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="mx-auto flex min-h-[70vh] max-w-sm flex-col justify-center py-10">
      <div className="mb-7 text-center">
        <span
          aria-hidden
          className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-ink text-bg shadow-pop"
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="m22 2-7 20-4-9-9-4Z" />
          </svg>
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          <span className="text-ink">Iwant</span>
          <span className="text-brand">Po</span>
        </h1>
        <p className="mt-2 text-sm text-ink-2">把商品分潤連結，自動排程發文。</p>
      </div>
      <div className="card-p">
        <LoginForm next={searchParams.next ?? "/"} />
      </div>
      <p className="mt-5 text-center text-xs text-ink-3">多帳號 · 排程 · AI 文案 · 防封節奏</p>
    </div>
  );
}
