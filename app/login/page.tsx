import type { Metadata } from "next";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const next = (await searchParams).next;
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="animate-pop-in w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-accent text-xl font-bold text-accent-fg shadow-pop">
            T
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
            <p className="mt-1 text-sm text-muted">Your co-op search, all in one place.</p>
          </div>
        </div>
        <LoginForm next={typeof next === "string" ? next : "/"} />
      </div>
    </div>
  );
}
