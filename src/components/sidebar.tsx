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
  KeyRound,
} from "lucide-react";
import { useState, useEffect } from "react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);

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
          className={`button-ghost mb-2 w-full ${collapsed ? "justify-center" : "justify-start gap-2"} text-slate-500 dark:text-slate-400`}
          onClick={() => setPasswordModalOpen(true)}
          title={collapsed ? "Change password" : undefined}
        >
          <KeyRound className="h-4 w-4" />
          {!collapsed && "Change Password"}
        </button>
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

      {passwordModalOpen ? (
        <ChangePasswordModal onClose={() => setPasswordModalOpen(false)} />
      ) : null}
    </>
  );
}

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function setField(
    key: "currentPassword" | "newPassword" | "confirmPassword",
    value: string,
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (
      form.currentPassword.trim().length < 8 ||
      form.newPassword.trim().length < 8
    ) {
      setError("Password must be at least 8 characters.");
      return;
    }

    if (form.newPassword !== form.confirmPassword) {
      setError("New password and confirmation do not match.");
      return;
    }

    setError(null);

    startSaving(async () => {
      try {
        const response = await fetch("/api/auth/change-password", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            currentPassword: form.currentPassword,
            newPassword: form.newPassword,
          }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to change password.");
        }

        toast.success("Password updated.");
        onClose();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to change password.",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl dark:bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
          <div>
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Change Password
            </h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Update your login password for this CRM account.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            onClick={onClose}
          >
            <span className="sr-only">Close</span>x
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Current Password
            </span>
            <Input
              type="password"
              value={form.currentPassword}
              onChange={(event) =>
                setField("currentPassword", event.target.value)
              }
              placeholder="Enter current password"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              New Password
            </span>
            <Input
              type="password"
              value={form.newPassword}
              onChange={(event) => setField("newPassword", event.target.value)}
              placeholder="Use at least 8 characters"
            />
          </label>

          <label className="space-y-1.5">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              Confirm New Password
            </span>
            <Input
              type="password"
              value={form.confirmPassword}
              onChange={(event) =>
                setField("confirmPassword", event.target.value)
              }
              placeholder="Re-enter new password"
            />
          </label>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-300">
              {error}
            </div>
          ) : null}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving ? "Saving..." : "Update Password"}
          </Button>
        </div>
      </div>
    </div>
  );
}
