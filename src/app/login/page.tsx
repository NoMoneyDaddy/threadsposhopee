import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage({ searchParams }: { searchParams: { next?: string } }) {
  return (
    <div className="mx-auto mt-20 max-w-sm rounded-lg border bg-white p-6">
      <h1 className="mb-1 text-xl font-bold">
        <span className="text-shopee">ThreadsPo</span>Shopee
      </h1>
      <p className="mb-4 text-sm text-neutral-500">登入以使用控制台</p>
      <LoginForm next={searchParams.next ?? "/"} />
    </div>
  );
}
