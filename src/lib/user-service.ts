import { compare, hash } from "bcryptjs";
import type { Prisma } from "@prisma/client";

import type { SessionUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type {
  ChangeOwnPasswordInput,
  CreatePortalUserInput,
  ReassignManagedUserLeadsInput,
  UpdatePortalUserInput,
} from "@/lib/validations";

const managedUserSelect = {
  id: true,
  name: true,
  email: true,
  phone: true,
  role: true,
  isActive: true,
  isPriorityAgent: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      assignedLeads: true,
    },
  },
} as const;

export type ManagedUser = Prisma.UserGetPayload<{
  select: typeof managedUserSelect;
}>;

type UserDeleteSummary = {
  id: string;
  name: string;
};

function assertAdmin(actor: SessionUser) {
  if (actor.role !== "ADMIN") {
    throw new Error("Admin only.");
  }
}

async function ensureAnotherActiveAdmin(
  tx: Prisma.TransactionClient,
  excludedUserId: string,
) {
  const otherActiveAdminCount = await tx.user.count({
    where: {
      role: "ADMIN",
      isActive: true,
      NOT: { id: excludedUserId },
    },
  });

  if (otherActiveAdminCount === 0) {
    throw new Error("At least one active admin must remain.");
  }
}

async function deleteManagedUserWithinTransaction(
  tx: Prisma.TransactionClient,
  userId: string,
  actor: SessionUser,
): Promise<UserDeleteSummary> {
  const existing = await tx.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      role: true,
      isActive: true,
      _count: {
        select: {
          assignedLeads: true,
        },
      },
    },
  });

  if (!existing) {
    throw new Error("User not found.");
  }

  if (actor.id === userId) {
    throw new Error("You cannot delete your own account.");
  }

  if (existing._count.assignedLeads > 0) {
    throw new Error(
      `Reassign or unassign ${existing._count.assignedLeads} lead(s) before deleting this user.`,
    );
  }

  if (existing.role === "ADMIN" && existing.isActive) {
    await ensureAnotherActiveAdmin(tx, userId);
  }

  await tx.user.delete({
    where: { id: userId },
  });

  return {
    id: existing.id,
    name: existing.name,
  };
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  return prisma.user.findMany({
    orderBy: [
      { isActive: "desc" },
      { role: "asc" },
      { isPriorityAgent: "desc" },
      { createdAt: "asc" },
    ],
    select: managedUserSelect,
  });
}

export async function createManagedUser(
  input: CreatePortalUserInput,
  actor: SessionUser,
) {
  assertAdmin(actor);

  const existing = await prisma.user.findUnique({
    where: { email: input.email },
    select: { id: true },
  });

  if (existing) {
    throw new Error("A user with this email already exists.");
  }

  const passwordHash = await hash(input.password, 12);

  return prisma.user.create({
    data: {
      name: input.name,
      email: input.email,
      phone: input.phone,
      role: input.role,
      isActive: input.isActive,
      isPriorityAgent:
        input.role === "TELECALLER" ? input.isPriorityAgent : false,
      passwordHash,
    },
    select: managedUserSelect,
  });
}

export async function updateManagedUser(
  userId: string,
  input: UpdatePortalUserInput,
  actor: SessionUser,
) {
  assertAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
      },
    });

    if (!existing) {
      throw new Error("User not found.");
    }

    const nextRole = input.role ?? existing.role;
    const nextIsActive = input.isActive ?? existing.isActive;

    if (actor.id === userId) {
      if (input.isActive === false) {
        throw new Error("You cannot deactivate your own account.");
      }

      if (input.role && input.role !== "ADMIN") {
        throw new Error("You cannot remove your own admin access.");
      }
    }

    if (
      existing.role === "ADMIN" &&
      existing.isActive &&
      (!nextIsActive || nextRole !== "ADMIN")
    ) {
      await ensureAnotherActiveAdmin(tx, userId);
    }

    if (input.email) {
      const duplicate = await tx.user.findFirst({
        where: {
          email: input.email,
          NOT: { id: userId },
        },
        select: { id: true },
      });

      if (duplicate) {
        throw new Error("A user with this email already exists.");
      }
    }

    const updateData: Prisma.UserUpdateInput = {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.phone !== undefined ? { phone: input.phone } : {}),
      ...(input.role !== undefined ? { role: input.role } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    };

    if (input.password) {
      updateData.passwordHash = await hash(input.password, 12);
    }

    if (nextRole === "TELECALLER") {
      if (input.isPriorityAgent !== undefined) {
        updateData.isPriorityAgent = input.isPriorityAgent;
      }
    } else {
      updateData.isPriorityAgent = false;
    }

    return tx.user.update({
      where: { id: userId },
      data: updateData,
      select: managedUserSelect,
    });
  });
}

export async function changeOwnPassword(
  input: ChangeOwnPasswordInput,
  actor: SessionUser,
) {
  const existingUser = await prisma.user.findUnique({
    where: { id: actor.id },
    select: {
      id: true,
      passwordHash: true,
      isActive: true,
    },
  });

  if (!existingUser || !existingUser.isActive) {
    throw new Error("User not found.");
  }

  const currentPasswordMatches = await compare(
    input.currentPassword,
    existingUser.passwordHash,
  );

  if (!currentPasswordMatches) {
    throw new Error("Current password is incorrect.");
  }

  if (input.currentPassword === input.newPassword) {
    throw new Error(
      "New password must be different from the current password.",
    );
  }

  await prisma.user.update({
    where: { id: actor.id },
    data: {
      passwordHash: await hash(input.newPassword, 12),
    },
  });
}

export async function deleteManagedUser(userId: string, actor: SessionUser) {
  assertAdmin(actor);

  return prisma.$transaction(async (tx) => {
    return deleteManagedUserWithinTransaction(tx, userId, actor);
  });
}

export async function reassignManagedUserLeads(
  sourceUserId: string,
  input: ReassignManagedUserLeadsInput,
  actor: SessionUser,
) {
  assertAdmin(actor);

  return prisma.$transaction(async (tx) => {
    const sourceUser = await tx.user.findUnique({
      where: { id: sourceUserId },
      select: {
        id: true,
        name: true,
        role: true,
        _count: {
          select: {
            assignedLeads: true,
          },
        },
      },
    });

    if (!sourceUser) {
      throw new Error("User not found.");
    }

    if (sourceUser.id === input.targetTelecallerId) {
      throw new Error("Select a different telecaller for reassignment.");
    }

    if (sourceUser._count.assignedLeads === 0) {
      throw new Error("This user has no assigned leads to reassign.");
    }

    const targetUser = await tx.user.findFirst({
      where: {
        id: input.targetTelecallerId,
        role: "TELECALLER",
        isActive: true,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!targetUser) {
      throw new Error("Target telecaller not found.");
    }

    const sourceLeadIds = await tx.lead.findMany({
      where: {
        assignedToId: sourceUser.id,
      },
      select: {
        id: true,
      },
    });
    const leadIds = sourceLeadIds.map((lead) => lead.id);

    if (!leadIds.length) {
      throw new Error("This user has no assigned leads to reassign.");
    }

    await tx.lead.updateMany({
      where: {
        id: {
          in: leadIds,
        },
      },
      data: {
        assignedToId: targetUser.id,
      },
    });

    await tx.leadAssignment.createMany({
      data: leadIds.map((leadId) => ({
        leadId,
        userId: targetUser.id,
        strategy: "MANUAL" as const,
        poolKey: `reassign:${sourceUser.id}:${actor.id}`,
      })),
    });

    await tx.leadActivity.createMany({
      data: leadIds.map((leadId) => ({
        leadId,
        userId: actor.id,
        type: "SYSTEM" as const,
        notes: `Lead reassigned from ${sourceUser.name} to ${targetUser.name} by ${actor.name}.`,
      })),
    });

    const updatedTargetUser = await tx.user.findUnique({
      where: { id: targetUser.id },
      select: managedUserSelect,
    });

    if (!updatedTargetUser) {
      throw new Error("Target telecaller not found.");
    }

    let updatedSourceUser: ManagedUser | null = await tx.user.findUnique({
      where: { id: sourceUser.id },
      select: managedUserSelect,
    });
    let deletedUser: UserDeleteSummary | null = null;

    if (input.deleteSourceUser) {
      deletedUser = await deleteManagedUserWithinTransaction(
        tx,
        sourceUser.id,
        actor,
      );
      updatedSourceUser = null;
    }

    return {
      reassignedCount: leadIds.length,
      targetUser: updatedTargetUser,
      sourceUser: updatedSourceUser,
      deletedUser,
    };
  });
}
