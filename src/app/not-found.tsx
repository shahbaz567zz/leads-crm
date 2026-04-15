import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="panel-strong max-w-xl p-10 text-center">
        <p className="section-kicker">Missing Record</p>
        <h1 className="mt-3 text-4xl font-semibold text-slate-950">
          Lead not found
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600">
          The lead record is unavailable or your role does not have access to
          it.
        </p>
        <div className="mt-8">
          <Link className="button-primary" href="/dashboard">
            Return to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
