"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import {
  LayoutDashboard,
  Users,
  LogOut,
  Zap,
  Menu,
  X,
  Clock,
  Settings,
} from "lucide-react";
import { useState } from "react";

type SidebarProps = {
  user: {
    name: string;
    email: string;
    role: string;
  };
  managerMode: boolean;
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-indigo-100 text-indigo-700",
  MANAGER: "bg-amber-100 text-amber-700",
  TELECALLER: "bg-emerald-100 text-emerald-700",
};

export function Sidebar({ user, managerMode }: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [logoutPending, startLogout] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);

  const dueParam = searchParams.get("due");
  const assignedParam = searchParams.get("assigned");
  const statusParam = searchParams.get("status");

  const navItems = [
    {
      href: "/dashboard",
      label: "All Leads",
      icon: LayoutDashboard,
      active:
        pathname === "/dashboard" &&
        !dueParam &&
        !assignedParam &&
        !statusParam,
    },
    {
      href: "/dashboard?due=today",
      label: "Due Today",
      icon: Zap,
      active: dueParam === "today",
    },
    {
      href: "/dashboard?due=overdue",
      label: "Overdue Leads",
      icon: Clock,
      active: dueParam === "overdue",
    },
    ...(managerMode
      ? [
          {
            href: "/dashboard?status=NEW",
            label: "New Leads",
            icon: Users,
            active: statusParam === "NEW",
          },
        ]
      : []),
  ];

  function handleLogout() {
    startLogout(async () => {
      await fetch("/api/auth/logout", { method: "POST" });
      router.replace("/login");
      router.refresh();
    });
  }

  const sidebarContent = (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5">
        <Image
          src="/logo.png"
          alt="CollegeTpoint"
          width={32}
          height={32}
          className="shrink-0 object-contain"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            CollegeTpoint
          </p>
          <p className="truncate text-xs text-slate-500">Leads CRM</p>
        </div>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
          Navigation
        </p>
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={item.active ? "nav-link-active" : "nav-link"}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        ))}

        {managerMode && (
          <>
            <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Settings
            </p>
            {user.role === "ADMIN" && (
              <Link
                href="/settings/users"
                onClick={() => setMobileOpen(false)}
                className={
                  pathname === "/settings/users"
                    ? "nav-link-active"
                    : "nav-link"
                }
              >
                <Users className="h-4 w-4 shrink-0" />
                Users & Telecallers
              </Link>
            )}
            <Link
              href="/settings/campaign-mappings"
              onClick={() => setMobileOpen(false)}
              className={
                pathname === "/settings/campaign-mappings"
                  ? "nav-link-active"
                  : "nav-link"
              }
            >
              <Settings className="h-4 w-4 shrink-0" />
              Campaign Mappings
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-slate-900">
              {user.name}
            </p>
            <span
              className={`pill text-[10px] ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-700"}`}
            >
              {user.role}
            </span>
          </div>
        </div>
        <button
          type="button"
          className="button-ghost w-full justify-start gap-2 text-slate-500"
          disabled={logoutPending}
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4" />
          {logoutPending ? "Signing out..." : "Sign out"}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:hidden"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? (
          <X className="h-5 w-5 text-slate-600" />
        ) : (
          <Menu className="h-5 w-5 text-slate-600" />
        )}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Desktop sidebar */}
      <aside className="sidebar hidden lg:flex">{sidebarContent}</aside>

      {/* Mobile sidebar */}
      <aside
        className={`sidebar lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-200`}
      >
        {sidebarContent}
      </aside>
    </>
  );
}
