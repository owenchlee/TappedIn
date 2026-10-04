"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { login, type LoginState } from "@/actions/auth";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export function LoginForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, { error: null });
  return (
    <form action={action} className="space-y-4 rounded-3xl border border-border bg-surface p-6 shadow-pop">
      <input type="hidden" name="next" value={next} />
      <label className="block">
        <span className="mb-1.5 block text-xs font-medium text-muted">Password</span>
        <Input name="password" type="password" autoComplete="current-password" autoFocus required />
      </label>
      {state.error && <p className="text-xs text-overdue">{state.error}</p>}
      <Button type="submit" variant="primary" className="w-full" disabled={pending}>
        {pending && <Loader2 className="animate-spin" />}
        Sign in
      </Button>
    </form>
  );
}
