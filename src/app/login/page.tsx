import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Sign in — Sales Floor" };

export default function LoginPage() {
  return (
    <div className="grid min-h-screen place-items-center px-6">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-base text-ink">
            ▲
          </span>
          <span className="text-base font-semibold tracking-tight">Sales Floor</span>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
