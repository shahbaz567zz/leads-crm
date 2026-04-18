import Link from "next/link";
import { cookies } from "next/headers";
import { ArrowLeft } from "lucide-react";

import { Sidebar } from "@/components/sidebar";
import { UserManagementList } from "@/components/user-management-list";
import { requireUser } from "@/lib/auth";
import { listManagedUsers } from "@/lib/user-service";

export default async function UsersPage() {
  const cookieStore = await cookies();
  const initialSidebarCollapsed =
    cookieStore.get("sidebar-collapsed")?.value === "true";

  const user = await requireUser(["ADMIN"]);
  const users = await listManagedUsers();

  return (
    <>
      <Sidebar
        user={{ name: user.name, email: user.email, role: user.role }}
        managerMode
        initialCollapsed={initialSidebarCollapsed}
      />

      <main className="main-content pt-14 lg:pt-0">
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div>
                <h1 className="page-title">Users & Telecallers</h1>
                <p className="mt-1 text-sm text-slate-500">
                  Admin-only user management for CRM access, telecaller
                  activation, and priority assignment routing.
                </p>
              </div>
            </div>
          </div>

          <UserManagementList initialUsers={users} currentUserId={user.id} />
        </div>
      </main>
    </>
  );
}
