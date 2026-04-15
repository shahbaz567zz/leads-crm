"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export function LoginForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <form
      className="space-y-5"
      onSubmit={(event) => {
        event.preventDefault();

        const formData = new FormData(event.currentTarget);
        const payload = {
          email: String(formData.get("email") ?? ""),
          password: String(formData.get("password") ?? ""),
        };

        setError(null);
        startTransition(async () => {
          const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          });

          const body = await response.json().catch(() => ({}));

          if (!response.ok) {
            setError(body.error ?? "Unable to sign in.");
            return;
          }

          router.replace("/dashboard");
          router.refresh();
        });
      }}
    >
      <div>
        <label className="field-label" htmlFor="email">
          Work Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          placeholder="admin@collegetpoint.in"
          required
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          placeholder="Enter your password"
          required
        />
      </div>

      {error ? (
        <div className="alert-error">
          {error}
        </div>
      ) : null}

      <button
        className="button-primary w-full"
        type="submit"
        disabled={pending}
      >
        {pending ? "Signing in..." : "Access CRM"}
      </button>
    </form>
  );
}
