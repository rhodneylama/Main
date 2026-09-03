"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

function Form() {
  const router = useRouter();
  const params = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not sign in.");

      // A full navigation, so the new cookie is on the request the server sees.
      window.location.href = params.get("next") || "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="panel space-y-3 p-5">
      <div>
        <label className="label" htmlFor="password">
          Team password
        </label>
        <input
          id="password"
          type="password"
          className="field"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button type="submit" className="btn-primary w-full" disabled={busy || !password}>
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-xs text-muted">
        One password for the whole team. Ask whoever set up the board if you don&rsquo;t have it.
      </p>
    </form>
  );
}

export default function LoginForm() {
  // useSearchParams needs a Suspense boundary to keep this page prerenderable.
  return (
    <Suspense fallback={<div className="panel h-48 animate-pulse p-5" />}>
      <Form />
    </Suspense>
  );
}
