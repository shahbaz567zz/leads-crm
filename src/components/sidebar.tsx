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
  ChevronsLeft,
  ChevronsRight,
  Moon,
  Sun,
} from "lucide-react";
import { useState, useEffect } from "react";

type SidebarProps = {
  user: {
    name: string;
    email: string;
    role: string;
  };
  managerMode: boolean;
  initialCollapsed?: boolean;
};

const ROLE_COLORS: Record<string, string> = {
  ADMIN: "bg-indigo-100 text-indigo-700",
  MANAGER: "bg-amber-100 text-amber-700",
  TELECALLER: "bg-emerald-100 text-emerald-700",
};

export function Sidebar({
  user,
  managerMode,
  initialCollapsed = false,
}: SidebarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [logoutPending, startLogout] = useTransition();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const [darkMode, setDarkMode] = useState(false);
  const [themeReady, setThemeReady] = useState(false);

  useEffect(() => {
    const storedTheme = localStorage.getItem("theme");
    const initialDark =
      storedTheme != null
        ? storedTheme === "dark"
        : document.documentElement.classList.contains("dark");

    setDarkMode(initialDark);
    setThemeReady(true);
  }, []);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", String(collapsed));
    document.cookie = `sidebar-collapsed=${collapsed ? "true" : "false"}; path=/; max-age=31536000; samesite=lax`;
  }, [collapsed]);

  useEffect(() => {
    if (!themeReady) {
      return;
    }

    if (darkMode) {
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
      document.cookie = "theme=dark; path=/; max-age=31536000; samesite=lax";
    } else {
      document.documentElement.classList.remove("dark");
      localStorage.setItem("theme", "light");
      document.cookie = "theme=light; path=/; max-age=31536000; samesite=lax";
    }
  }, [darkMode, themeReady]);

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

  const sidebarContent = (collapsed: boolean) => (
    <>
      <div className="flex h-16 items-center gap-3 border-b border-slate-200 px-5 dark:border-slate-700">
        <Image
          src="/logo.png"
          alt="CollegeTpoint"
          width={32}
          height={32}
          className="shrink-0 object-contain"
        />
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              CollegeTpoint
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Leads CRM
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {!collapsed && (
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
            Navigation
          </p>
        )}
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setMobileOpen(false)}
            className={item.active ? "nav-link-active" : "nav-link"}
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" />
            {!collapsed && item.label}
          </Link>
        ))}

        {managerMode && (
          <>
            {!collapsed && (
              <p className="mb-2 mt-6 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                Settings
              </p>
            )}
            {collapsed && (
              <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-700" />
            )}
            {user.role === "ADMIN" && (
              <Link
                href="/settings/users"
                onClick={() => setMobileOpen(false)}
                className={
                  pathname === "/settings/users"
                    ? "nav-link-active"
                    : "nav-link"
                }
                title={collapsed ? "Users & Telecallers" : undefined}
              >
                <Users className="h-4 w-4 shrink-0" />
                {!collapsed && "Users & Telecallers"}
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
              title={collapsed ? "Campaign Mappings" : undefined}
            >
              <Settings className="h-4 w-4 shrink-0" />
              {!collapsed && "Campaign Mappings"}
            </Link>
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 p-4 dark:border-slate-700">
        <button
          type="button"
          className={`button-ghost mb-2 w-full ${collapsed ? "justify-center" : "justify-start gap-2"} text-slate-500 dark:text-slate-400`}
          onClick={() => setDarkMode(!darkMode)}
          title={
            collapsed ? (darkMode ? "Light Mode" : "Dark Mode") : undefined
          }
        >
          {darkMode ? (
            <Sun className="h-4 w-4" />
          ) : (
            <Moon className="h-4 w-4" />
          )}
          {!collapsed && (darkMode ? "Light Mode" : "Dark Mode")}
        </button>
        <div
          className={`mb-3 flex items-center ${collapsed ? "justify-center" : "gap-3"}`}
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            {user.name.charAt(0).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {user.name}
              </p>
              <span
                className={`pill text-[10px] ${ROLE_COLORS[user.role] ?? "bg-slate-100 text-slate-700"}`}
              >
                {user.role}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={`button-ghost w-full ${collapsed ? "justify-center" : "justify-start gap-2"} text-slate-500 dark:text-slate-400`}
          onClick={handleLogout}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="h-4 w-4" />
          {!collapsed && (logoutPending ? "Signing out..." : "Sign out")}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        type="button"
        className="fixed top-4 left-4 z-50 rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:hidden dark:border-slate-700 dark:bg-slate-800"
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
      <aside
        className={`fixed top-0 left-0 z-40 hidden h-full flex-col border-r border-slate-200 bg-white transition-[width] duration-200 lg:flex dark:border-slate-700 dark:bg-slate-900 ${
          collapsed ? "w-17" : "w-65"
        }`}
      >
        {sidebarContent(collapsed)}
        {/* Desktop collapse toggle */}
        <button
          type="button"
          className="absolute -right-3 top-20 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white shadow-sm hover:bg-slate-50 lg:flex dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700"
          onClick={() => setCollapsed(!collapsed)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronsRight className="h-3.5 w-3.5 text-slate-500" />
          ) : (
            <ChevronsLeft className="h-3.5 w-3.5 text-slate-500" />
          )}
        </button>
      </aside>

      {/* Desktop main-content margin pusher */}
      <style>{`
        @media (min-width: 1024px) {
          .main-content {
            margin-left: ${collapsed ? "68px" : "260px"} !important;
          }
        }
      `}</style>

      {/* Mobile sidebar */}
      <aside
        className={`sidebar lg:hidden ${mobileOpen ? "translate-x-0" : "-translate-x-full"} transition-transform duration-200`}
      >
        {sidebarContent(false)}
      </aside>
    </>
  );
}
