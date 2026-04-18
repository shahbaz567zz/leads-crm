import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { Sidebar } from "@/components/sidebar";
import { CampaignMappingList } from "@/components/campaign-mapping-list";
import { canManageAssignments, requireUser } from "@/lib/auth";
import { listCampaignMappings } from "@/lib/campaign-mapping-service";

export default async function CampaignMappingsPage() {
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sidebar-collapsed")?.value === "true";

  const user = await requireUser();

  if (!canManageAssignments(user)) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <p className="text-sm text-slate-500">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const mappings = await listCampaignMappings();
  const isAdmin = user.role === "ADMIN";

  return (
    <>
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        managerMode
        initialCollapsed={initialSidebarCollapsed}
      />

      <main className="main-content pt-14 lg:pt-0">
        <div className="mx-auto max-w-5xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="page-title">Campaign Mappings</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Saved header mappings used during CSV imports and webhook lead
                  ingestion from Meta and Google Ads.
                </p>
              </div>
            </div>
          </div>

          <CampaignMappingList initialMappings={mappings} isAdmin={isAdmin} />
        </div>
      </main>
    </>
  );
}
