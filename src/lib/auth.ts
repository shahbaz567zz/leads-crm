import { compare } from "bcryptjs";
import { jwtVerify, SignJWT } from "jose";
import type { Prisma } from "@prisma/client";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { UserRoleValue } from "@/lib/crm-constants";
import { prisma } from "@/lib/db";

const SESSION_COOKIE = "lead-crm-session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;

const sessionUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  isPriorityAgent: true,
} as const;

const loginUserSelect = {
  ...sessionUserSelect,
  passwordHash: true,
} as const;

export type SessionUser = Prisma.UserGetPayload<{
  select: typeof sessionUserSelect;
}>;

type LoginUser = Prisma.UserGetPayload<{
  select: typeof loginUserSelect;
}>;

function getSecretKey() {
  const secret = process.env.AUTH_SECRET;

  if (!secret) {
    throw new Error("AUTH_SECRET is missing.");
  }

  return new TextEncoder().encode(secret);
}

function withoutPassword(user: LoginUser): SessionUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    isActive: user.isActive,
    isPriorityAgent: user.isPriorityAgent,
  };
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: loginUserSelect,
  });

  if (!user || !user.isActive) {
    return null;
  }

  const isValid = await compare(password, user.passwordHash);

  if (!isValid) {
    return null;
  }

  return withoutPassword(user);
}

export async function createSession(user: SessionUser) {
  const token = await new SignJWT({
    role: user.role,
    email: user.email,
    name: user.name,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecretKey());

  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    const userId = payload.sub;

    if (!userId) {
      return null;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: sessionUserSelect,
    });

    if (!user || !user.isActive) {
      return null;
    }

    return user;
  } catch {
    return null;
  }
}

export async function requireUser(allowedRoles?: UserRoleValue[]) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    redirect("/dashboard");
  }

  return user;
}

export function canManageAssignments(user: SessionUser) {
  return user.role === "ADMIN" || user.role === "MANAGER";
}
