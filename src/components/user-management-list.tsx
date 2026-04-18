"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  ArrowRightLeft,
  Plus,
  Shield,
  Trash2,
  UserCog,
  UserRoundCheck,
  X,
} from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { USER_ROLES, type UserRoleValue } from "@/lib/crm-constants";

type ManagedUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: UserRoleValue;
  isActive: boolean;
  isPriorityAgent: boolean;
  createdAt: string | Date;
  updatedAt: string | Date;
  _count: {
    assignedLeads: number;
  };
};

type UserFormState = {
  name: string;
  email: string;
  phone: string;
  role: UserRoleValue;
  isActive: boolean;
  isPriorityAgent: boolean;
  password: string;
};

const ROLE_BADGES: Record<UserRoleValue, string> = {
  ADMIN: "bg-indigo-100 text-indigo-700",
  MANAGER: "bg-amber-100 text-amber-700",
  TELECALLER: "bg-emerald-100 text-emerald-700",
};

const ROLE_LABELS: Record<UserRoleValue, string> = {
  ADMIN: "Admin",
  MANAGER: "Manager",
  TELECALLER: "Telecaller",
};

const EMPTY_FORM: UserFormState = {
  name: "",
  email: "",
  phone: "",
  role: "TELECALLER",
  isActive: true,
  isPriorityAgent: false,
  password: "",
};

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function UserManagementList({
  initialUsers,
  currentUserId,
}: {
  initialUsers: ManagedUserRow[];
  currentUserId: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState<"ALL" | UserRoleValue>("ALL");
  const [formOpen, setFormOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUserRow | null>(null);
  const [reassigningUser, setReassigningUser] = useState<ManagedUserRow | null>(
    null,
  );
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return users.filter((user) => {
      if (roleFilter !== "ALL" && user.role !== roleFilter) {
        return false;
      }

      if (!normalizedQuery) {
        return true;
      }

      return [user.name, user.email, user.phone ?? ""]
        .join(" ")
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [query, roleFilter, users]);

  const summary = useMemo(
    () => ({
      totalUsers: users.length,
      activeTelecallers: users.filter(
        (user) => user.role === "TELECALLER" && user.isActive,
      ).length,
      priorityPool: users.filter(
        (user) => user.role === "TELECALLER" && user.isPriorityAgent,
      ).length,
      inactiveUsers: users.filter((user) => !user.isActive).length,
    }),
    [users],
  );

  function openCreate() {
    setEditingUser(null);
    setFormOpen(true);
  }

  function openEdit(user: ManagedUserRow) {
    setEditingUser(user);
    setFormOpen(true);
  }

  async function patchUser(
    userId: string,
    payload: Partial<{
      role: UserRoleValue;
      isActive: boolean;
      isPriorityAgent: boolean;
    }>,
  ) {
    setBusyUserId(userId);

    try {
      const response = await fetch(`/api/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to update user.");
      }

      setUsers((current) =>
        current.map((user) => (user.id === userId ? body.user : user)),
      );
      toast.success("User updated.");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to update user.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  async function removeUser(user: ManagedUserRow) {
    if (user.id === currentUserId) {
      toast.error("You cannot delete your own account.");
      return;
    }

    if (user._count.assignedLeads > 0) {
      toast.error(
        `Reassign or unassign ${user._count.assignedLeads} lead(s) before deleting this user.`,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete ${user.name} permanently? This removes the login account and clears old user links from historical records where the database uses set-null behavior.`,
    );

    if (!confirmed) {
      return;
    }

    setBusyUserId(user.id);

    try {
      const response = await fetch(`/api/users/${user.id}`, {
        method: "DELETE",
      });
      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to delete user.");
      }

      setUsers((current) => current.filter((row) => row.id !== user.id));
      toast.success(`${user.name} deleted.`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete user.",
      );
    } finally {
      setBusyUserId(null);
    }
  }

  const activeTelecallers = useMemo(
    () => users.filter((user) => user.role === "TELECALLER" && user.isActive),
    [users],
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label="Total users"
          value={summary.totalUsers}
          icon={UserCog}
        />
        <SummaryCard
          label="Active telecallers"
          value={summary.activeTelecallers}
          icon={UserRoundCheck}
        />
        <SummaryCard
          label="Priority pool"
          value={summary.priorityPool}
          icon={Shield}
        />
        <SummaryCard
          label="Inactive users"
          value={summary.inactiveUsers}
          icon={X}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-slate-100 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Users & Telecallers
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Create CRM logins, activate or deactivate accounts, and control
              the priority telecaller pool.
            </p>
          </div>

          <Button type="button" className="gap-2" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            Add User
          </Button>
        </div>

        <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by name, email, or phone"
            className="md:max-w-sm"
          />
          <Select
            value={roleFilter}
            onChange={(event) =>
              setRoleFilter(event.target.value as "ALL" | UserRoleValue)
            }
            className="md:max-w-52"
          >
            <option value="ALL">All roles</option>
            {USER_ROLES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </Select>
        </div>

        <div className="overflow-x-auto">
          <table className="data-table min-w-full">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Status</th>
                <th>Priority Pool</th>
                <th>Assigned Leads</th>
                <th>Updated</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((user) => {
                const isBusy = busyUserId === user.id;
                const canTogglePriority = user.role === "TELECALLER";
                const isCurrentUser = user.id === currentUserId;

                return (
                  <tr key={user.id}>
                    <td>
                      <div>
                        <p className="font-medium text-slate-900">
                          {user.name}
                        </p>
                        <p className="text-sm text-slate-500">{user.email}</p>
                        <p className="text-xs text-slate-400">
                          {user.phone ?? "No phone"}
                        </p>
                      </div>
                    </td>
                    <td>
                      <span
                        className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${ROLE_BADGES[user.role]}`}
                      >
                        {ROLE_LABELS[user.role]}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        disabled={isBusy || isCurrentUser}
                        onClick={() =>
                          patchUser(user.id, { isActive: !user.isActive })
                        }
                        className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${user.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600"}`}
                        title={
                          isCurrentUser
                            ? "You cannot deactivate your own account"
                            : user.isActive
                              ? "Deactivate account"
                              : "Activate account"
                        }
                      >
                        {user.isActive ? "Active" : "Inactive"}
                      </button>
                    </td>
                    <td>
                      {canTogglePriority ? (
                        <button
                          type="button"
                          disabled={isBusy || !user.isActive}
                          onClick={() =>
                            patchUser(user.id, {
                              isPriorityAgent: !user.isPriorityAgent,
                            })
                          }
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${user.isPriorityAgent ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {user.isPriorityAgent ? "Priority" : "Standard"}
                        </button>
                      ) : (
                        <span className="text-sm text-slate-400">
                          Not applicable
                        </span>
                      )}
                    </td>
                    <td>{user._count.assignedLeads}</td>
                    <td className="text-sm text-slate-500">
                      {formatDate(user.updatedAt)}
                    </td>
                    <td>
                      <div className="flex items-center gap-2">
                        {user._count.assignedLeads > 0 && (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={isBusy}
                            onClick={() => setReassigningUser(user)}
                          >
                            <ArrowRightLeft className="h-4 w-4" />
                            Reassign
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => openEdit(user)}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          variant="danger"
                          size="sm"
                          disabled={
                            isBusy ||
                            isCurrentUser ||
                            user._count.assignedLeads > 0
                          }
                          title={
                            isCurrentUser
                              ? "You cannot delete your own account"
                              : user._count.assignedLeads > 0
                                ? `Use Reassign to move ${user._count.assignedLeads} lead(s) before deleting`
                                : "Delete user permanently"
                          }
                          onClick={() => removeUser(user)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredUsers.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-10 text-center text-sm text-slate-500"
                  >
                    No users match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {formOpen && (
        <UserFormModal
          existingUser={editingUser}
          onClose={() => {
            setFormOpen(false);
            setEditingUser(null);
          }}
          onSaved={(savedUser, mode) => {
            setUsers((current) => {
              if (mode === "create") {
                return [savedUser, ...current];
              }

              return current.map((user) =>
                user.id === savedUser.id ? savedUser : user,
              );
            });
          }}
        />
      )}

      {reassigningUser && (
        <ReassignLeadsModal
          user={reassigningUser}
          telecallers={activeTelecallers.filter(
            (telecaller) => telecaller.id !== reassigningUser.id,
          )}
          onClose={() => setReassigningUser(null)}
          onComplete={(result) => {
            setUsers((current) => {
              const nextUsers = current
                .map((user) => {
                  if (result.deletedUser?.id === user.id) {
                    return null;
                  }

                  if (result.sourceUser && user.id === result.sourceUser.id) {
                    return result.sourceUser;
                  }

                  if (user.id === result.targetUser.id) {
                    return result.targetUser;
                  }

                  return user;
                })
                .filter((user): user is ManagedUserRow => Boolean(user));

              if (
                result.sourceUser &&
                !nextUsers.some((user) => user.id === result.sourceUser?.id)
              ) {
                nextUsers.unshift(result.sourceUser);
              }

              if (!nextUsers.some((user) => user.id === result.targetUser.id)) {
                nextUsers.unshift(result.targetUser);
              }

              return nextUsers;
            });
            setReassigningUser(null);
          }}
        />
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: typeof UserCog;
}) {
  return (
    <article className="metric-card border-slate-200 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
        </div>
        <div className="rounded-xl bg-slate-100 p-3 text-slate-600">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </article>
  );
}

function UserFormModal({
  existingUser,
  onClose,
  onSaved,
}: {
  existingUser: ManagedUserRow | null;
  onClose: () => void;
  onSaved: (user: ManagedUserRow, mode: "create" | "update") => void;
}) {
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(() =>
    existingUser
      ? {
          name: existingUser.name,
          email: existingUser.email,
          phone: existingUser.phone ?? "",
          role: existingUser.role,
          isActive: existingUser.isActive,
          isPriorityAgent: existingUser.isPriorityAgent,
          password: "",
        }
      : EMPTY_FORM,
  );

  function setField<K extends keyof UserFormState>(
    key: K,
    value: UserFormState[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit() {
    if (!form.name.trim() || !form.email.trim()) {
      setError("Name and email are required.");
      return;
    }

    if (!existingUser && form.password.trim().length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setError(null);

    startSaving(async () => {
      try {
        const response = await fetch(
          existingUser ? `/api/users/${existingUser.id}` : "/api/users",
          {
            method: existingUser ? "PATCH" : "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: form.name.trim(),
              email: form.email.trim().toLowerCase(),
              phone: form.phone.trim() || undefined,
              role: form.role,
              isActive: form.isActive,
              isPriorityAgent:
                form.role === "TELECALLER" ? form.isPriorityAgent : false,
              password: form.password.trim() || undefined,
            }),
          },
        );
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to save user.");
        }

        onSaved(body.user, existingUser ? "update" : "create");
        toast.success(existingUser ? "User updated." : "User created.");
        onClose();
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to save user.",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {existingUser ? "Edit User" : "Create User"}
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              {existingUser
                ? "Update login access, role, or telecaller settings."
                : "Create a new CRM login for admin, manager, or telecaller access."}
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full Name">
              <Input
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Telecaller name"
              />
            </Field>
            <Field label="Email Address">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setField("email", event.target.value)}
                placeholder="name@collegetpoint.in"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="9876543210"
              />
            </Field>
            <Field label="Role">
              <Select
                value={form.role}
                onChange={(event) => {
                  const nextRole = event.target.value as UserRoleValue;
                  setForm((current) => ({
                    ...current,
                    role: nextRole,
                    isPriorityAgent:
                      nextRole === "TELECALLER"
                        ? current.isPriorityAgent
                        : false,
                  }));
                }}
              >
                {USER_ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field
            label={existingUser ? "Reset Password" : "Temporary Password"}
            hint={
              existingUser
                ? "Leave blank to keep the current password."
                : "Use at least 8 characters."
            }
          >
            <Input
              type="password"
              value={form.password}
              onChange={(event) => setField("password", event.target.value)}
              placeholder={
                existingUser
                  ? "Leave blank to keep unchanged"
                  : "Enter password"
              }
            />
          </Field>

          <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={form.isActive}
                onChange={(event) => setField("isActive", event.target.checked)}
              />
              <span>
                <span className="font-medium text-slate-900">
                  Active account
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Inactive users cannot sign in to the CRM.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-3 text-sm text-slate-700">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 rounded border-slate-300"
                checked={form.role === "TELECALLER" && form.isPriorityAgent}
                disabled={form.role !== "TELECALLER"}
                onChange={(event) =>
                  setField("isPriorityAgent", event.target.checked)
                }
              />
              <span>
                <span className="font-medium text-slate-900">
                  Priority telecaller pool
                </span>
                <span className="mt-1 block text-xs text-slate-500">
                  Used for high-priority round-robin assignments.
                </span>
              </span>
            </label>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving}>
            {saving
              ? existingUser
                ? "Saving..."
                : "Creating..."
              : existingUser
                ? "Save Changes"
                : "Create User"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1.5">
      <span className="block text-sm font-medium text-slate-700">{label}</span>
      {children}
      {hint ? (
        <span className="block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

function ReassignLeadsModal({
  user,
  telecallers,
  onClose,
  onComplete,
}: {
  user: ManagedUserRow;
  telecallers: ManagedUserRow[];
  onClose: () => void;
  onComplete: (result: {
    reassignedCount: number;
    targetUser: ManagedUserRow;
    sourceUser: ManagedUserRow | null;
    deletedUser: { id: string; name: string } | null;
  }) => void;
}) {
  const [saving, startSaving] = useTransition();
  const [deleteSourceUser, setDeleteSourceUser] = useState(false);
  const [targetTelecallerId, setTargetTelecallerId] = useState(
    telecallers[0]?.id ?? "",
  );
  const [error, setError] = useState<string | null>(null);

  function handleSubmit() {
    if (!targetTelecallerId) {
      setError("Select a telecaller to receive these leads.");
      return;
    }

    setError(null);

    startSaving(async () => {
      try {
        const response = await fetch(`/api/users/${user.id}/reassign-leads`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetTelecallerId,
            deleteSourceUser,
          }),
        });
        const body = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(body.error ?? "Unable to reassign leads.");
        }

        onComplete(body);
        toast.success(
          deleteSourceUser
            ? `Reassigned ${body.reassignedCount} lead(s) and deleted ${user.name}.`
            : `Reassigned ${body.reassignedCount} lead(s) from ${user.name}.`,
        );
      } catch (submitError) {
        setError(
          submitError instanceof Error
            ? submitError.message
            : "Unable to reassign leads.",
        );
      }
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              Reassign {user.name}&apos;s Leads
            </h3>
            <p className="mt-1 text-sm text-slate-500">
              Move {user._count.assignedLeads} assigned lead(s) to another
              active telecaller.
            </p>
          </div>
          <button
            type="button"
            className="rounded-full p-1 text-slate-500 hover:bg-slate-100"
            onClick={onClose}
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <Field
            label="Target Telecaller"
            hint="Only active telecallers are available for reassignment."
          >
            <Select
              value={targetTelecallerId}
              onChange={(event) => setTargetTelecallerId(event.target.value)}
              disabled={!telecallers.length}
            >
              {!telecallers.length && (
                <option value="">No other active telecallers available</option>
              )}
              {telecallers.map((telecaller) => (
                <option key={telecaller.id} value={telecaller.id}>
                  {telecaller.name}
                  {telecaller.isPriorityAgent ? " · Priority" : ""}
                </option>
              ))}
            </Select>
          </Field>

          <label className="flex items-start gap-3 rounded-xl bg-slate-50 p-4 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-slate-300"
              checked={deleteSourceUser}
              onChange={(event) => setDeleteSourceUser(event.target.checked)}
            />
            <span>
              <span className="font-medium text-slate-900">
                Delete this user after reassignment
              </span>
              <span className="mt-1 block text-xs text-slate-500">
                Use this when you are replacing or removing a telecaller
                account.
              </span>
            </span>
          </label>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-100 px-5 py-4">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleSubmit}
            disabled={saving || !telecallers.length}
          >
            {saving
              ? "Reassigning..."
              : deleteSourceUser
                ? "Reassign and Delete"
                : "Reassign Leads"}
          </Button>
        </div>
      </div>
    </div>
  );
}
