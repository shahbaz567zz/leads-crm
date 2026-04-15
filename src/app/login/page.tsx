import Image from "next/image";
import { PhoneCall, Users, CalendarCheck2 } from "lucide-react";
import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export default async function LoginPage() {
  const user = await getCurrentUser();

  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className="grid w-full max-w-5xl gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="flex flex-col justify-center">
          <Image
            src="/logo.png"
            alt="CollegeTpoint"
            width={64}
            height={64}
            className="mb-6 object-contain"
          />
          <div className="mb-8 inline-flex w-max rounded-lg bg-indigo-100 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-indigo-700">
            CollegeTpoint Admissions CRM
          </div>

          <h1 className="text-4xl font-bold tracking-tight text-slate-900 sm:text-5xl">
            Lead to admission,
            <br />
            <span className="text-indigo-600">one workflow.</span>
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-slate-500">
            Capture campaign leads, route them to telecallers, track calls and
            meetings, convert into paid counselling.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <PhoneCall className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Speed-to-call
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Track first-contact time to keep leads warm.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <Users className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Smart routing
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Priority pool for high-value leads.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <CalendarCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
              <div>
                <p className="text-sm font-semibold text-slate-800">
                  Meeting pipeline
                </p>
                <p className="mt-1 text-xs leading-5 text-slate-500">
                  Schedule visits and track no-shows.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="card-elevated p-8">
          <h2 className="text-2xl font-bold text-slate-900">Sign in</h2>
          <p className="mt-2 text-sm text-slate-500">
            Enter your CRM credentials to access the pipeline.
          </p>

          <div className="mt-8">
            <LoginForm />
          </div>
        </section>
      </div>
    </main>
  );
}
