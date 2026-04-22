import { addDays, endOfDay, startOfDay } from "date-fns";
import { Prisma } from "@prisma/client";

import { canManageAssignments, type SessionUser } from "@/lib/auth";
import {
  CLOSED_LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  STATUS_FLOW,
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import { prisma } from "@/lib/db";
import { sendLeadAutoReply } from "@/lib/msg91";
import { parseMetaLead } from "@/lib/meta";
import type { ParsedGoogleLead } from "@/lib/google-ads";
import type {
  CreateActivityInput,
  CreateLeadInput,
  UpdateLeadInput,
} from "@/lib/validations";
import {
  formatDateTime,
  inferLeadPriority,
  isContactedStatus,
  normalizeIndianPhone,
  parseOptionalDate,
} from "@/lib/utils";

const userListSelect = {
  id: true,
  name: true,
  isPriorityAgent: true,
} as const;

export type TelecallerOption = {
  id: string;
  name: string;
  isPriorityAgent: boolean;
};

export type DashboardFilters = {
  q?: string;
  status?: LeadStatusValue;
  priority?: LeadPriorityValue;
  assigned?: string;
  due?: "all" | "today" | "overdue";
  sla?:
    | "overdue_open"
    | "due_today_open"
    | "high_priority_uncontacted"
    | "stale_30m"
    | "stale_2h";
};

export type LeadPaginationInput = {
  page?: number;
  pageSize?: number;
};

export type LeadPagination = {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
};

export type LeadSortInput = {
  sortBy?: string | null;
  sortDirection?: string | null;
};

export const LEAD_SORT_FIELDS = [
  "leadNumber",
  "name",
  "email",
  "status",
  "priority",
  "jeeRankRange",
  "twelfthLocation",
  "courseInterest",
  "dynamicField1",
  "dynamicField2",
  "dynamicField3",
  "assignedTo",
  "createdAt",
  "nextFollowUpAt",
  "campaignName",
] as const;

export type LeadSortField = (typeof LEAD_SORT_FIELDS)[number];
export type LeadSortDirection = "asc" | "desc";

export type LeadSort = {
  sortBy: LeadSortField;
  sortDirection: LeadSortDirection;
};

export type StageMixItem = {
  status: LeadStatusValue;
  count: number;
  share: number;
};

export type CampaignSnapshotItem = {
  label: string;
  total: number;
  converted: number;
  overdue: number;
  highPriority: number;
};

export type TelecallerScorecardItem = {
  id: string;
  name: string;
  totalAssigned: number;
  activeLeads: number;
  converted: number;
  overdue: number;
  dueToday: number;
};

export type SlaSummary = {
  overdueOpen: number;
  dueTodayOpen: number;
  highPriorityUncontacted: number;
  staleThirtyMinutes: number;
  staleTwoHours: number;
};

export type DashboardReporting = {
  conversionRate: number;
  slaSummary: SlaSummary;
  stageMix: StageMixItem[];
  campaignSnapshot: CampaignSnapshotItem[];
  telecallerScorecard: TelecallerScorecardItem[];
};

export type LeadExportRow = {
  name: string;
  phone: string;
  email: string;
  city: string;
  twelfthLocation: string;
  jeeRankRange: string;
  courseInterest: string;
  dynamicField1: string;
  dynamicField2: string;
  dynamicField3: string;
  status: LeadStatusValue;
  priority: LeadPriorityValue;
  assignedTo: string;
  campaignName: string;
  source: string;
  nextFollowUpAt: Date | null;
  lastContactedAt: Date | null;
  meetingScheduledAt: Date | null;
  activityCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export const LEAD_PAGE_SIZE_OPTIONS = [20, 50, 100] as const;
export const DEFAULT_LEAD_PAGE_SIZE = LEAD_PAGE_SIZE_OPTIONS[0];
const DEFAULT_LEAD_SORTING: LeadSort = {
  sortBy: "createdAt",
  sortDirection: "desc",
};

const dashboardAnalyticsSelect = {
  id: true,
  name: true,
  status: true,
  priority: true,
  nextFollowUpAt: true,
  lastContactedAt: true,
  createdAt: true,
  campaignName: true,
  source: true,
  assignedTo: {
    select: {
      id: true,
      name: true,
    },
  },
} as const;

const leadQueueInclude = {
  assignedTo: {
    select: {
      id: true,
      name: true,
    },
  },
  _count: {
    select: {
      activities: true,
    },
  },
} as const;

const leadExportSelect = {
  name: true,
  phone: true,
  email: true,
  city: true,
  twelfthLocation: true,
  jeeRankRange: true,
  courseInterest: true,
  dynamicField1: true,
  dynamicField2: true,
  dynamicField3: true,
  status: true,
  priority: true,
  campaignName: true,
  source: true,
  nextFollowUpAt: true,
  lastContactedAt: true,
  meetingScheduledAt: true,
  createdAt: true,
  updatedAt: true,
  assignedTo: {
    select: {
      name: true,
    },
  },
  _count: {
    select: {
      activities: true,
    },
  },
} as const;

type DashboardAnalyticsLead = Prisma.LeadGetPayload<{
  select: typeof dashboardAnalyticsSelect;
}>;

type LeadExportRecord = Prisma.LeadGetPayload<{
  select: typeof leadExportSelect;
}>;

function isOpenLead(status: LeadStatusValue) {
  return !CLOSED_LEAD_STATUSES.includes(status);
}

export function normalizeLeadPagination(
  pagination?: LeadPaginationInput,
): Pick<LeadPagination, "page" | "pageSize"> {
  const page =
    Number.isInteger(pagination?.page) && (pagination?.page ?? 0) > 0
      ? (pagination?.page as number)
      : 1;
  const requestedPageSize =
    Number.isInteger(pagination?.pageSize) && (pagination?.pageSize ?? 0) > 0
      ? (pagination?.pageSize as number)
      : DEFAULT_LEAD_PAGE_SIZE;

  return {
    page,
    pageSize: LEAD_PAGE_SIZE_OPTIONS.includes(
      requestedPageSize as (typeof LEAD_PAGE_SIZE_OPTIONS)[number],
    )
      ? requestedPageSize
      : DEFAULT_LEAD_PAGE_SIZE,
  };
}

export function normalizeLeadSorting(
  sorting?: LeadSortInput | null,
): LeadSort | null {
  if (!sorting?.sortBy) {
    return null;
  }

  if (!LEAD_SORT_FIELDS.includes(sorting.sortBy as LeadSortField)) {
    return null;
  }

  return {
    sortBy: sorting.sortBy as LeadSortField,
    sortDirection: sorting.sortDirection === "desc" ? "desc" : "asc",
  };
}

function resolveLeadSorting(sorting?: LeadSortInput | null): LeadSort {
  return normalizeLeadSorting(sorting) ?? DEFAULT_LEAD_SORTING;
}

function buildLeadQueueOrderBy(
  sortingInput?: LeadSortInput | null,
): Prisma.LeadOrderByWithRelationInput[] {
  const sorting = resolveLeadSorting(sortingInput);
  const orderBy: Prisma.LeadOrderByWithRelationInput[] = [];

  switch (sorting.sortBy) {
    case "assignedTo":
      orderBy.push({
        assignedTo: {
          name: sorting.sortDirection,
        },
      });
      break;
    case "leadNumber":
      orderBy.push({ leadNumber: sorting.sortDirection });
      break;
    case "name":
      orderBy.push({ name: sorting.sortDirection });
      break;
    case "email":
      orderBy.push({ email: sorting.sortDirection });
      break;
    case "status":
      orderBy.push({ status: sorting.sortDirection });
      break;
    case "priority":
      orderBy.push({ priority: sorting.sortDirection });
      break;
    case "jeeRankRange":
      orderBy.push({ jeeRankRange: sorting.sortDirection });
      break;
    case "twelfthLocation":
      orderBy.push({ twelfthLocation: sorting.sortDirection });
      break;
    case "courseInterest":
      orderBy.push({ courseInterest: sorting.sortDirection });
      break;
    case "dynamicField1":
      orderBy.push({ dynamicField1: sorting.sortDirection });
      break;
    case "dynamicField2":
      orderBy.push({ dynamicField2: sorting.sortDirection });
      break;
    case "dynamicField3":
      orderBy.push({ dynamicField3: sorting.sortDirection });
      break;
    case "nextFollowUpAt":
      orderBy.push({ nextFollowUpAt: sorting.sortDirection });
      break;
    case "campaignName":
      orderBy.push({ campaignName: sorting.sortDirection });
      break;
    case "createdAt":
      orderBy.push({ createdAt: sorting.sortDirection });
      break;
  }

  if (sorting.sortBy !== "createdAt") {
    orderBy.push({ createdAt: "desc" });
  }

  orderBy.push({ id: "desc" });

  return orderBy;
}

function buildDashboardReporting(
  analyticsRows: DashboardAnalyticsLead[],
  telecallers: TelecallerOption[],
  totalLeads: number,
  converted: number,
): DashboardReporting {
  const now = new Date();
  const dueTodayStart = startOfDay(now);
  const dueTodayEnd = endOfDay(now);
  const staleThirtyMinuteThreshold = new Date(now.getTime() - 30 * 60 * 1000);
  const staleTwoHourThreshold = new Date(now.getTime() - 2 * 60 * 60 * 1000);
  const stageCounts = new Map<LeadStatusValue, number>();
  const campaignMap = new Map<string, CampaignSnapshotItem>();
  const telecallerMap = new Map<string, TelecallerScorecardItem>();
  const slaSummary: SlaSummary = {
    overdueOpen: 0,
    dueTodayOpen: 0,
    highPriorityUncontacted: 0,
    staleThirtyMinutes: 0,
    staleTwoHours: 0,
  };

  telecallers.forEach((telecaller) => {
    telecallerMap.set(telecaller.id, {
      id: telecaller.id,
      name: telecaller.name,
      totalAssigned: 0,
      activeLeads: 0,
      converted: 0,
      overdue: 0,
      dueToday: 0,
    });
  });

  analyticsRows.forEach((lead) => {
    const openLead = isOpenLead(lead.status);
    const dueAt = lead.nextFollowUpAt;
    const firstContactMissing = !lead.lastContactedAt;

    if (openLead && dueAt && dueAt >= dueTodayStart && dueAt <= dueTodayEnd) {
      slaSummary.dueTodayOpen += 1;
    }

    if (openLead && dueAt && dueAt < now) {
      slaSummary.overdueOpen += 1;
    }

    if (lead.priority === "HIGH" && !isContactedStatus(lead.status)) {
      slaSummary.highPriorityUncontacted += 1;
    }

    if (
      openLead &&
      firstContactMissing &&
      lead.createdAt <= staleThirtyMinuteThreshold
    ) {
      slaSummary.staleThirtyMinutes += 1;
    }

    if (
      openLead &&
      firstContactMissing &&
      lead.createdAt <= staleTwoHourThreshold
    ) {
      slaSummary.staleTwoHours += 1;
    }

    stageCounts.set(lead.status, (stageCounts.get(lead.status) ?? 0) + 1);

    const campaignLabel = lead.campaignName ?? lead.source ?? "Unknown Source";
    const campaign = campaignMap.get(campaignLabel) ?? {
      label: campaignLabel,
      total: 0,
      converted: 0,
      overdue: 0,
      highPriority: 0,
    };

    campaign.total += 1;

    if (lead.status === "CONVERTED") {
      campaign.converted += 1;
    }

    if (lead.priority === "HIGH") {
      campaign.highPriority += 1;
    }

    if (
      lead.nextFollowUpAt &&
      isOpenLead(lead.status) &&
      lead.nextFollowUpAt < now
    ) {
      campaign.overdue += 1;
    }

    campaignMap.set(campaignLabel, campaign);

    if (lead.assignedTo?.id) {
      const telecaller = telecallerMap.get(lead.assignedTo.id) ?? {
        id: lead.assignedTo.id,
        name: lead.assignedTo.name,
        totalAssigned: 0,
        activeLeads: 0,
        converted: 0,
        overdue: 0,
        dueToday: 0,
      };

      telecaller.totalAssigned += 1;

      if (isOpenLead(lead.status)) {
        telecaller.activeLeads += 1;
      }

      if (lead.status === "CONVERTED") {
        telecaller.converted += 1;
      }

      if (
        lead.nextFollowUpAt &&
        isOpenLead(lead.status) &&
        lead.nextFollowUpAt < now
      ) {
        telecaller.overdue += 1;
      }

      if (
        lead.nextFollowUpAt &&
        lead.nextFollowUpAt >= dueTodayStart &&
        lead.nextFollowUpAt <= dueTodayEnd
      ) {
        telecaller.dueToday += 1;
      }

      telecallerMap.set(telecaller.id, telecaller);
    }
  });

  return {
    conversionRate: totalLeads
      ? Number(((converted / totalLeads) * 100).toFixed(1))
      : 0,
    slaSummary,
    stageMix: STATUS_FLOW.map((status) => ({
      status,
      count: stageCounts.get(status) ?? 0,
      share: totalLeads
        ? Number(
            (((stageCounts.get(status) ?? 0) / totalLeads) * 100).toFixed(1),
          )
        : 0,
    })),
    campaignSnapshot: [...campaignMap.values()]
      .sort((left, right) => {
        if (right.total !== left.total) {
          return right.total - left.total;
        }

        return right.converted - left.converted;
      })
      .slice(0, 6),
    telecallerScorecard: [...telecallerMap.values()].sort((left, right) => {
      if (right.totalAssigned !== left.totalAssigned) {
        return right.totalAssigned - left.totalAssigned;
      }

      if (right.overdue !== left.overdue) {
        return right.overdue - left.overdue;
      }

      return right.converted - left.converted;
    }),
  };
}

function buildScopedWhere(
  user: SessionUser,
  filters?: DashboardFilters,
): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};

  if (user.role === "TELECALLER") {
    where.assignedToId = user.id;
  }

  if (!filters) {
    return where;
  }

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.priority) {
    where.priority = filters.priority;
  }

  if (filters.assigned && user.role !== "TELECALLER") {
    where.assignedToId =
      filters.assigned === "unassigned" ? null : filters.assigned;
  }

  if (filters.due === "today") {
    where.nextFollowUpAt = {
      gte: startOfDay(new Date()),
      lte: endOfDay(new Date()),
    };
  }

  if (filters.due === "overdue") {
    where.nextFollowUpAt = {
      lt: new Date(),
    };
  }

  if (filters.q) {
    where.OR = [
      { name: { contains: filters.q } },
      { phone: { contains: filters.q } },
      { city: { contains: filters.q } },
      { courseInterest: { contains: filters.q } },
      { campaignName: { contains: filters.q } },
    ];
  }

  if (filters.sla) {
    const now = new Date();
    const dueTodayStart = startOfDay(now);
    const dueTodayEnd = endOfDay(now);
    const uncontactedStatuses: LeadStatusValue[] = ["NEW", "ASSIGNED"];

    let slaCondition: Prisma.LeadWhereInput;

    switch (filters.sla) {
      case "overdue_open":
        slaCondition = {
          nextFollowUpAt: { lt: now },
          status: { notIn: CLOSED_LEAD_STATUSES },
        };
        break;
      case "due_today_open":
        slaCondition = {
          nextFollowUpAt: { gte: dueTodayStart, lte: dueTodayEnd },
          status: { notIn: CLOSED_LEAD_STATUSES },
        };
        break;
      case "high_priority_uncontacted":
        slaCondition = {
          priority: "HIGH",
          status: { in: uncontactedStatuses },
        };
        break;
      case "stale_30m":
        slaCondition = {
          lastContactedAt: null,
          createdAt: { lte: new Date(now.getTime() - 30 * 60 * 1000) },
          status: { notIn: CLOSED_LEAD_STATUSES },
        };
        break;
      case "stale_2h":
        slaCondition = {
          lastContactedAt: null,
          createdAt: { lte: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
          status: { notIn: CLOSED_LEAD_STATUSES },
        };
        break;
      default:
        slaCondition = {};
    }

    return {
      AND: [where, slaCondition],
    };
  }

  return where;
}

async function getTelecallers(): Promise<TelecallerOption[]> {
  return prisma.user.findMany({
    where: {
      role: "TELECALLER",
      isActive: true,
    },
    orderBy: [{ isPriorityAgent: "desc" }, { createdAt: "asc" }],
    select: userListSelect,
  });
}

function assertLeadAccess(user: SessionUser, assignedToId?: string | null) {
  if (user.role === "TELECALLER" && assignedToId !== user.id) {
    throw new Error("Forbidden");
  }
}

function assertAdminBulkAccess(user: SessionUser) {
  if (user.role !== "ADMIN") {
    throw new Error("Only admins can perform this action.");
  }
}

const AUTO_ASSIGN_SETTING_ID = "sla-notifications";

export async function getAutoAssignEnabled(): Promise<boolean> {
  const row = await prisma.automationSetting.findUnique({
    where: { id: AUTO_ASSIGN_SETTING_ID },
    select: { autoAssignEnabled: true },
  });
  return row?.autoAssignEnabled ?? false;
}

export async function setAutoAssignEnabled(enabled: boolean) {
  return prisma.automationSetting.upsert({
    where: { id: AUTO_ASSIGN_SETTING_ID },
    update: { autoAssignEnabled: enabled },
    create: { id: AUTO_ASSIGN_SETTING_ID, autoAssignEnabled: enabled },
  });
}

export async function getLeadQueuePage(
  user: SessionUser,
  filters: DashboardFilters,
  paginationInput?: LeadPaginationInput,
  sortingInput?: LeadSortInput | null,
) {
  const where = buildScopedWhere(user, filters);
  const { page: requestedPage, pageSize } =
    normalizeLeadPagination(paginationInput);
  const orderBy = buildLeadQueueOrderBy(sortingInput);

  return prisma.$transaction(async (tx) => {
    const totalCount = await tx.lead.count({ where });
    const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    const page = totalCount === 0 ? 1 : Math.min(requestedPage, totalPages);
    const leads = await tx.lead.findMany({
      where,
      orderBy,
      include: leadQueueInclude,
      skip: totalCount === 0 ? 0 : (page - 1) * pageSize,
      take: pageSize,
    });

    return {
      leads,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPreviousPage: page > 1,
      } satisfies LeadPagination,
    };
  });
}

async function assignLeadManually(
  leadId: string,
  assigneeId: string,
  actor: SessionUser,
) {
  return prisma.$transaction(async (tx) => {
    const assignee = await tx.user.findFirst({
      where: {
        id: assigneeId,
        role: "TELECALLER",
        isActive: true,
      },
      select: userListSelect,
    });

    if (!assignee) {
      throw new Error("Telecaller not found.");
    }

    await tx.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: assignee.id,
        status: "ASSIGNED",
      },
    });

    await tx.leadAssignment.create({
      data: {
        leadId,
        userId: assignee.id,
        strategy: "MANUAL",
        poolKey: `manual:${actor.id}`,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        userId: actor.id,
        type: "SYSTEM",
        notes: `Lead assigned manually to ${assignee.name}.`,
        statusAfter: "ASSIGNED",
      },
    });

    return assignee;
  });
}

async function resolveActiveTelecaller(telecallerId: string) {
  const assignee = await prisma.user.findFirst({
    where: {
      id: telecallerId,
      role: "TELECALLER",
      isActive: true,
    },
    select: userListSelect,
  });

  if (!assignee) {
    throw new Error("Telecaller not found.");
  }

  return assignee;
}

export async function deleteLeadsBulkSelected(
  leadIds: string[],
  actor: SessionUser,
) {
  assertAdminBulkAccess(actor);

  const dedupedIds = [...new Set(leadIds)].filter(Boolean);

  if (!dedupedIds.length) {
    return { deletedCount: 0, deletedIds: [] as string[] };
  }

  const existingLeads = await prisma.lead.findMany({
    where: {
      id: {
        in: dedupedIds,
      },
    },
    select: {
      id: true,
    },
  });
  const existingIds = existingLeads.map((lead) => lead.id);

  if (!existingIds.length) {
    return { deletedCount: 0, deletedIds: [] as string[] };
  }

  await prisma.lead.deleteMany({
    where: {
      id: {
        in: existingIds,
      },
    },
  });

  return {
    deletedCount: existingIds.length,
    deletedIds: existingIds,
  };
}

export async function deleteLeadsBulkFiltered(
  filters: DashboardFilters,
  actor: SessionUser,
) {
  assertAdminBulkAccess(actor);

  const where = buildScopedWhere(actor, filters);
  const matchingLeads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
    },
  });
  const matchingIds = matchingLeads.map((lead) => lead.id);

  if (!matchingIds.length) {
    return { deletedCount: 0, deletedIds: [] as string[] };
  }

  await prisma.lead.deleteMany({
    where: {
      id: {
        in: matchingIds,
      },
    },
  });

  return {
    deletedCount: matchingIds.length,
    deletedIds: matchingIds,
  };
}

async function assignLeadIdsToTelecaller(
  leadIds: string[],
  telecallerId: string,
  actor: SessionUser,
) {
  assertAdminBulkAccess(actor);

  const dedupedIds = [...new Set(leadIds)].filter(Boolean);

  if (!dedupedIds.length) {
    return { assignedCount: 0, assignedLeadIds: [] as string[] };
  }

  const assignee = await resolveActiveTelecaller(telecallerId);
  const matchingLeads = await prisma.lead.findMany({
    where: {
      id: {
        in: dedupedIds,
      },
    },
    select: {
      id: true,
      assignedToId: true,
    },
  });
  const leadIdsToAssign = matchingLeads
    .filter((lead) => lead.assignedToId !== assignee.id)
    .map((lead) => lead.id);

  if (!leadIdsToAssign.length) {
    return { assignedCount: 0, assignedLeadIds: [] as string[] };
  }

  await prisma.$transaction([
    prisma.lead.updateMany({
      where: {
        id: {
          in: leadIdsToAssign,
        },
      },
      data: {
        assignedToId: assignee.id,
        status: "ASSIGNED",
      },
    }),
    prisma.leadAssignment.createMany({
      data: leadIdsToAssign.map((leadId) => ({
        leadId,
        userId: assignee.id,
        strategy: "MANUAL" as const,
        poolKey: `manual:${actor.id}`,
      })),
    }),
    prisma.leadActivity.createMany({
      data: leadIdsToAssign.map((leadId) => ({
        leadId,
        userId: actor.id,
        type: "SYSTEM" as const,
        notes: `Lead bulk-assigned to ${assignee.name} by ${actor.name}.`,
        statusAfter: "ASSIGNED" as const,
      })),
    }),
  ]);

  return {
    assignedCount: leadIdsToAssign.length,
    assignedLeadIds: leadIdsToAssign,
  };
}

export async function assignLeadsBulkSelected(
  leadIds: string[],
  telecallerId: string,
  actor: SessionUser,
) {
  return assignLeadIdsToTelecaller(leadIds, telecallerId, actor);
}

export async function assignLeadsBulkFiltered(
  filters: DashboardFilters,
  telecallerId: string,
  actor: SessionUser,
) {
  assertAdminBulkAccess(actor);

  const where = buildScopedWhere(actor, filters);
  const matchingLeads = await prisma.lead.findMany({
    where,
    select: {
      id: true,
    },
  });

  return assignLeadIdsToTelecaller(
    matchingLeads.map((lead) => lead.id),
    telecallerId,
    actor,
  );
}

async function assignLeadAutomatically(
  leadId: string,
  priority: LeadPriorityValue,
) {
  return prisma.$transaction(async (tx) => {
    const priorityPool = await tx.user.findMany({
      where: {
        role: "TELECALLER",
        isActive: true,
        ...(priority === "HIGH" ? { isPriorityAgent: true } : {}),
      },
      orderBy: { createdAt: "asc" },
      select: userListSelect,
    });

    const defaultPool =
      priorityPool.length > 0
        ? priorityPool
        : await tx.user.findMany({
            where: {
              role: "TELECALLER",
              isActive: true,
            },
            orderBy: { createdAt: "asc" },
            select: userListSelect,
          });

    if (!defaultPool.length) {
      return null;
    }

    const poolKey =
      priority === "HIGH" && priorityPool.length ? "priority-high" : "default";
    const cursor = await tx.assignmentCursor.upsert({
      where: { id: poolKey },
      update: {},
      create: { id: poolKey, cursor: 0 },
    });
    const assignee = defaultPool[cursor.cursor % defaultPool.length];

    await tx.assignmentCursor.update({
      where: { id: poolKey },
      data: { cursor: { increment: 1 } },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: {
        assignedToId: assignee.id,
        status: "ASSIGNED",
      },
    });

    await tx.leadAssignment.create({
      data: {
        leadId,
        userId: assignee.id,
        strategy:
          priority === "HIGH" && priorityPool.length
            ? "PRIORITY_POOL"
            : "ROUND_ROBIN",
        poolKey,
      },
    });

    await tx.leadActivity.create({
      data: {
        leadId,
        type: "SYSTEM",
        notes: `Lead auto-assigned to ${assignee.name}${
          priority === "HIGH" && priorityPool.length
            ? " through the high-priority pool"
            : ""
        }.`,
        statusAfter: "ASSIGNED",
      },
    });

    return assignee;
  });
}

export async function getDashboardData(
  user: SessionUser,
  filters: DashboardFilters,
  paginationInput?: LeadPaginationInput,
  sortingInput?: LeadSortInput | null,
) {
  const scopeWhere = buildScopedWhere(user);
  const [pageData, telecallers, statsData] = await Promise.all([
    getLeadQueuePage(user, filters, paginationInput, sortingInput),
    getTelecallers(),
    prisma.$transaction([
      prisma.lead.count({ where: scopeWhere }),
      prisma.lead.count({ where: { ...scopeWhere, status: "NEW" } }),
      prisma.lead.count({
        where: {
          ...scopeWhere,
          nextFollowUpAt: {
            gte: startOfDay(new Date()),
            lte: endOfDay(new Date()),
          },
        },
      }),
      prisma.lead.count({
        where: {
          ...scopeWhere,
          nextFollowUpAt: {
            lt: new Date(),
          },
          status: {
            notIn: ["CONVERTED", "NOT_INTERESTED", "LOST"],
          },
        },
      }),
      prisma.lead.count({ where: { ...scopeWhere, status: "CONVERTED" } }),
      prisma.meeting.count({
        where: {
          status: "SCHEDULED",
          scheduledAt: {
            gte: startOfDay(new Date()),
            lte: endOfDay(addDays(new Date(), 7)),
          },
          lead: scopeWhere,
        },
      }),
      prisma.lead.findMany({
        where: scopeWhere,
        select: dashboardAnalyticsSelect,
      }),
    ]),
  ]);
  const [
    totalLeads,
    newLeads,
    dueToday,
    overdue,
    converted,
    meetingsSoon,
    analyticsRows,
  ] = statsData;
  const reporting = buildDashboardReporting(
    analyticsRows,
    telecallers,
    totalLeads,
    converted,
  );

  return {
    leads: pageData.leads,
    pagination: pageData.pagination,
    telecallers,
    reporting,
    stats: {
      totalLeads,
      newLeads,
      dueToday,
      overdue,
      converted,
      meetingsSoon,
    },
  };
}

export async function getGlobalDashboardReporting() {
  const [analyticsRows, totalLeads, converted] = await prisma.$transaction([
    prisma.lead.findMany({
      select: dashboardAnalyticsSelect,
    }),
    prisma.lead.count(),
    prisma.lead.count({
      where: {
        status: "CONVERTED",
      },
    }),
  ]);
  const telecallers = await getTelecallers();

  return buildDashboardReporting(
    analyticsRows,
    telecallers,
    totalLeads,
    converted,
  );
}

function mapLeadExportRecord(record: LeadExportRecord): LeadExportRow {
  return {
    name: record.name,
    phone: record.phone,
    email: record.email ?? "",
    city: record.city ?? "",
    twelfthLocation: record.twelfthLocation ?? "",
    jeeRankRange: record.jeeRankRange ?? "",
    courseInterest: record.courseInterest ?? "",
    dynamicField1: record.dynamicField1 ?? "",
    dynamicField2: record.dynamicField2 ?? "",
    dynamicField3: record.dynamicField3 ?? "",
    status: record.status,
    priority: record.priority,
    assignedTo: record.assignedTo?.name ?? "",
    campaignName: record.campaignName ?? "",
    source: record.source,
    nextFollowUpAt: record.nextFollowUpAt,
    lastContactedAt: record.lastContactedAt,
    meetingScheduledAt: record.meetingScheduledAt,
    activityCount: record._count.activities,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function getLeadExportRows(
  user: SessionUser,
  filters: DashboardFilters,
) {
  const where = buildScopedWhere(user, filters);
  const rows = await prisma.lead.findMany({
    where,
    orderBy: [{ createdAt: "desc" }],
    select: leadExportSelect,
  });

  return rows.map(mapLeadExportRecord);
}

export async function getReportExportRows(user: SessionUser) {
  const scopeWhere = buildScopedWhere(user);
  const [analyticsRows, totalLeads, converted] = await prisma.$transaction([
    prisma.lead.findMany({
      where: scopeWhere,
      select: dashboardAnalyticsSelect,
    }),
    prisma.lead.count({ where: scopeWhere }),
    prisma.lead.count({
      where: {
        ...scopeWhere,
        status: "CONVERTED",
      },
    }),
  ]);
  const telecallers = await getTelecallers();
  const reporting = buildDashboardReporting(
    analyticsRows,
    telecallers,
    totalLeads,
    converted,
  );

  const summaryRows: Array<Record<string, string | number>> = [
    {
      section: "summary",
      label: "total_leads",
      metric: "count",
      value: totalLeads,
    },
    {
      section: "summary",
      label: "conversion_rate",
      metric: "percent",
      value: reporting.conversionRate,
    },
    {
      section: "summary",
      label: "sla_overdue_open",
      metric: "count",
      value: reporting.slaSummary.overdueOpen,
    },
    {
      section: "summary",
      label: "sla_due_today_open",
      metric: "count",
      value: reporting.slaSummary.dueTodayOpen,
    },
    {
      section: "summary",
      label: "sla_high_priority_uncontacted",
      metric: "count",
      value: reporting.slaSummary.highPriorityUncontacted,
    },
    {
      section: "summary",
      label: "sla_stale_30m",
      metric: "count",
      value: reporting.slaSummary.staleThirtyMinutes,
    },
    {
      section: "summary",
      label: "sla_stale_2h",
      metric: "count",
      value: reporting.slaSummary.staleTwoHours,
    },
  ];

  const stageRows = reporting.stageMix.flatMap((row) => [
    {
      section: "stage_mix",
      label: row.status,
      metric: "count",
      value: row.count,
    },
    {
      section: "stage_mix",
      label: row.status,
      metric: "share_percent",
      value: row.share,
    },
  ]);

  const campaignRows = reporting.campaignSnapshot.flatMap((row) => [
    {
      section: "campaign",
      label: row.label,
      metric: "total",
      value: row.total,
    },
    {
      section: "campaign",
      label: row.label,
      metric: "converted",
      value: row.converted,
    },
    {
      section: "campaign",
      label: row.label,
      metric: "overdue",
      value: row.overdue,
    },
    {
      section: "campaign",
      label: row.label,
      metric: "high_priority",
      value: row.highPriority,
    },
  ]);

  const telecallerRows = reporting.telecallerScorecard.flatMap((row) => [
    {
      section: "telecaller",
      label: row.name,
      metric: "assigned",
      value: row.totalAssigned,
    },
    {
      section: "telecaller",
      label: row.name,
      metric: "active",
      value: row.activeLeads,
    },
    {
      section: "telecaller",
      label: row.name,
      metric: "overdue",
      value: row.overdue,
    },
    {
      section: "telecaller",
      label: row.name,
      metric: "converted",
      value: row.converted,
    },
  ]);

  return [...summaryRows, ...stageRows, ...campaignRows, ...telecallerRows];
}

export async function countFilteredLeads(
  user: SessionUser,
  filters: DashboardFilters,
) {
  const where = buildScopedWhere(user, filters);
  return prisma.lead.count({ where });
}

export async function countFilteredAssignableLeads(
  user: SessionUser,
  filters: DashboardFilters,
  telecallerId: string,
) {
  const where = buildScopedWhere(user, filters);
  return prisma.lead.count({
    where: {
      AND: [
        where,
        {
          OR: [{ assignedToId: null }, { assignedToId: { not: telecallerId } }],
        },
      ],
    },
  });
}

export async function getLeadDetail(leadId: string, user: SessionUser) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      assignments: {
        orderBy: { assignedAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },
      meetings: {
        orderBy: { scheduledAt: "desc" },
      },
    },
  });

  if (!lead) {
    return null;
  }

  assertLeadAccess(user, lead.assignedToId);

  const telecallers = canManageAssignments(user) ? await getTelecallers() : [];

  return { lead, telecallers };
}

export async function createLead(input: CreateLeadInput, actor: SessionUser) {
  const phoneNormalized = normalizeIndianPhone(input.phone);

  if (phoneNormalized.length !== 10) {
    throw new Error("A valid 10-digit phone number is required.");
  }

  const existingLead = await prisma.lead.findUnique({
    where: { phoneNormalized },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (existingLead) {
    return { lead: existingLead, duplicate: true };
  }

  const priority = input.priority ?? inferLeadPriority(input.jeeRankRange);
  const initialAssignee =
    actor.role === "TELECALLER" ? actor.id : input.assignedToId;

  const lead = await prisma.lead.create({
    data: {
      name: input.name,
      phone: input.phone,
      phoneNormalized,
      email: input.email,
      city: input.city,
      twelfthLocation: input.twelfthLocation,
      jeeRankRange: input.jeeRankRange,
      courseInterest: input.courseInterest,
      dynamicField1: input.dynamicField1,
      dynamicField2: input.dynamicField2,
      dynamicField3: input.dynamicField3,
      source: input.source ?? "Manual Entry",
      campaignName: input.campaignName,
      priority,
      assignedToId: initialAssignee,
      status: initialAssignee ? "ASSIGNED" : "NEW",
    },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (actor.role === "TELECALLER") {
    await prisma.$transaction([
      prisma.leadAssignment.create({
        data: {
          leadId: lead.id,
          userId: actor.id,
          strategy: "MANUAL",
          poolKey: `self:${actor.id}`,
        },
      }),
      prisma.leadActivity.create({
        data: {
          leadId: lead.id,
          userId: actor.id,
          type: "SYSTEM",
          notes: "Lead added manually and assigned to self.",
          statusAfter: "ASSIGNED",
        },
      }),
    ]);
  } else if (input.assignedToId) {
    await assignLeadManually(lead.id, input.assignedToId, actor);
  } else {
    const autoAssign = await getAutoAssignEnabled();
    if (autoAssign) {
      await assignLeadAutomatically(lead.id, priority);
    }
  }

  const refreshedLead = await prisma.lead.findUnique({
    where: { id: lead.id },
    include: {
      assignedTo: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  return { lead: refreshedLead ?? lead, duplicate: false };
}

export async function updateLead(
  leadId: string,
  input: UpdateLeadInput,
  actor: SessionUser,
) {
  const existingLead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      status: true,
      priority: true,
      assignedToId: true,
      meetingScheduledAt: true,
      counsellorNotes: true,
      dynamicField1: true,
      dynamicField2: true,
      dynamicField3: true,
    },
  });

  if (!existingLead) {
    return null;
  }

  assertLeadAccess(actor, existingLead.assignedToId);

  if (input.assignedToId !== undefined && !canManageAssignments(actor)) {
    throw new Error("Only managers can reassign leads.");
  }

  const assignmentChanged =
    input.assignedToId !== undefined &&
    input.assignedToId !== existingLead.assignedToId;

  if (
    assignmentChanged &&
    typeof input.assignedToId === "string" &&
    input.assignedToId
  ) {
    await assignLeadManually(leadId, input.assignedToId, actor);
  }

  const nextFollowUpAt = parseOptionalDate(input.nextFollowUpAt);
  const meetingScheduledAt = parseOptionalDate(input.meetingScheduledAt);
  const nextStatus =
    input.status ??
    (assignmentChanged && existingLead.status === "NEW"
      ? "ASSIGNED"
      : existingLead.status);
  const nextPriority = input.priority ?? existingLead.priority;
  const statusChanged = Boolean(
    input.status && input.status !== existingLead.status,
  );
  const priorityChanged = Boolean(
    input.priority && input.priority !== existingLead.priority,
  );

  const updatedLead = await prisma.$transaction(async (tx) => {
    const lead = await tx.lead.update({
      where: { id: leadId },
      data: {
        ...(assignmentChanged && input.assignedToId === null
          ? { assignedToId: null }
          : {}),
        status: nextStatus,
        priority: nextPriority,
        nextFollowUpAt,
        meetingScheduledAt,
        counsellorNotes: input.counsellorNotes,
        dynamicField1: input.dynamicField1,
        dynamicField2: input.dynamicField2,
        dynamicField3: input.dynamicField3,
        lastContactedAt: isContactedStatus(nextStatus) ? new Date() : undefined,
      },
    });

    if (meetingScheduledAt) {
      const existingMeeting = await tx.meeting.findFirst({
        where: {
          leadId,
          status: "SCHEDULED",
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingMeeting) {
        await tx.meeting.update({
          where: { id: existingMeeting.id },
          data: {
            scheduledAt: meetingScheduledAt,
            venue: process.env.CRM_OFFICE_LABEL ?? "CollegeTpoint Delhi Office",
          },
        });
      } else {
        await tx.meeting.create({
          data: {
            leadId,
            scheduledAt: meetingScheduledAt,
            venue: process.env.CRM_OFFICE_LABEL ?? "CollegeTpoint Delhi Office",
            notes: "Scheduled from lead update form.",
          },
        });
      }
    }

    const notes: string[] = [];

    if (statusChanged && input.status) {
      notes.push(`Status updated to ${LEAD_STATUS_LABELS[input.status]}.`);
    }

    if (priorityChanged && input.priority) {
      notes.push(`Priority set to ${input.priority.toLowerCase()}.`);
    }

    if (assignmentChanged) {
      notes.push(
        input.assignedToId === null
          ? "Lead moved back to Unassigned."
          : "Lead reassigned.",
      );
    }

    if (nextFollowUpAt) {
      notes.push(`Next follow-up set for ${formatDateTime(nextFollowUpAt)}.`);
    }

    if (meetingScheduledAt) {
      notes.push(
        `Meeting scheduled for ${formatDateTime(meetingScheduledAt)}.`,
      );
    }

    if (
      input.counsellorNotes &&
      input.counsellorNotes !== existingLead.counsellorNotes
    ) {
      notes.push("Counsellor notes updated.");
    }

    if (
      input.dynamicField1 !== undefined &&
      input.dynamicField1 !== existingLead.dynamicField1
    ) {
      notes.push("Dynamic 1 updated.");
    }

    if (
      input.dynamicField2 !== undefined &&
      input.dynamicField2 !== existingLead.dynamicField2
    ) {
      notes.push("Dynamic 2 updated.");
    }

    if (
      input.dynamicField3 !== undefined &&
      input.dynamicField3 !== existingLead.dynamicField3
    ) {
      notes.push("Dynamic 3 updated.");
    }

    if (notes.length) {
      await tx.leadActivity.create({
        data: {
          leadId,
          userId: actor.id,
          type: "STATUS_CHANGE",
          notes: notes.join(" "),
          nextFollowUpAt,
          statusAfter: nextStatus,
        },
      });
    }

    return lead;
  });

  return updatedLead;
}

export async function createLeadActivity(
  leadId: string,
  input: CreateActivityInput,
  actor: SessionUser,
) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    select: {
      id: true,
      assignedToId: true,
      status: true,
    },
  });

  if (!lead) {
    return null;
  }

  assertLeadAccess(actor, lead.assignedToId);

  const nextFollowUpAt = parseOptionalDate(input.nextFollowUpAt);
  const meetingScheduledAt = parseOptionalDate(input.meetingScheduledAt);
  const statusAfter =
    input.statusAfter ?? (meetingScheduledAt ? "MEETING_SCHEDULED" : undefined);

  return prisma.$transaction(async (tx) => {
    const activity = await tx.leadActivity.create({
      data: {
        leadId,
        userId: actor.id,
        type: input.type,
        title: input.title,
        notes: input.notes,
        nextFollowUpAt,
        statusAfter,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    await tx.lead.update({
      where: { id: leadId },
      data: {
        nextFollowUpAt,
        status: statusAfter,
        meetingScheduledAt,
        lastContactedAt:
          input.type === "CALL" || input.type === "WHATSAPP" || statusAfter
            ? new Date()
            : undefined,
      },
    });

    if (meetingScheduledAt) {
      await tx.meeting.create({
        data: {
          leadId,
          scheduledAt: meetingScheduledAt,
          venue:
            input.venue ??
            process.env.CRM_OFFICE_LABEL ??
            "CollegeTpoint Delhi Office",
          notes: input.notes,
        },
      });
    }

    return activity;
  });
}

export async function ingestMetaWebhook(payload: unknown) {
  const body = payload as {
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          leadgen_id?: string;
          form_id?: string;
          page_id?: string;
          ad_id?: string;
          ad_name?: string;
          adset_name?: string;
          campaign_name?: string;
        };
      }>;
    }>;
  };

  const results: Array<{
    leadId?: string;
    duplicate?: boolean;
    skipped?: boolean;
  }> = [];

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "leadgen" || !change.value?.leadgen_id) {
        results.push({ skipped: true });
        continue;
      }

      const externalId = change.value.leadgen_id;
      const existingEvent = await prisma.webhookEvent.findUnique({
        where: { externalId },
        select: { id: true, processedAt: true, leadId: true },
      });

      if (existingEvent?.processedAt) {
        results.push({
          leadId: existingEvent.leadId ?? undefined,
          duplicate: true,
        });
        continue;
      }

      const parsedLead = await parseMetaLead(externalId, change.value, payload);

      if (parsedLead.phoneNormalized.length !== 10) {
        throw new Error("Meta lead did not include a valid phone number.");
      }

      const existingLead = await prisma.lead.findFirst({
        where: {
          OR: [
            { metaLeadId: externalId },
            { phoneNormalized: parsedLead.phoneNormalized },
          ],
        },
        include: {
          assignedTo: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      let leadId: string;
      let assigneeName: string | null = existingLead?.assignedTo?.name ?? null;

      if (existingLead) {
        const existingLeadWithDynamic = existingLead as typeof existingLead & {
          dynamicField1?: string | null;
          dynamicField2?: string | null;
          dynamicField3?: string | null;
        };

        const refreshedLead = await prisma.lead.update({
          where: { id: existingLead.id },
          data: {
            metaLeadId: existingLead.metaLeadId ?? externalId,
            name:
              existingLead.name === "Meta Lead"
                ? parsedLead.name
                : existingLead.name,
            phone: existingLead.phone || parsedLead.phone,
            email: existingLead.email ?? parsedLead.email,
            city: existingLead.city ?? parsedLead.city,
            twelfthLocation:
              existingLead.twelfthLocation ?? parsedLead.twelfthLocation,
            jeeRankRange: existingLead.jeeRankRange ?? parsedLead.jeeRankRange,
            courseInterest:
              existingLead.courseInterest ?? parsedLead.courseInterest,
            dynamicField1:
              existingLeadWithDynamic.dynamicField1 ?? parsedLead.dynamicField1,
            dynamicField2:
              existingLeadWithDynamic.dynamicField2 ?? parsedLead.dynamicField2,
            dynamicField3:
              existingLeadWithDynamic.dynamicField3 ?? parsedLead.dynamicField3,
            campaignName: parsedLead.campaignName ?? existingLead.campaignName,
            adsetName: parsedLead.adsetName ?? existingLead.adsetName,
            adName: parsedLead.adName ?? existingLead.adName,
            formId: parsedLead.formId ?? existingLead.formId,
            pageId: parsedLead.pageId ?? existingLead.pageId,
            rawPayload: parsedLead.rawPayload as Prisma.InputJsonValue,
          },
          include: {
            assignedTo: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        leadId = refreshedLead.id;
        assigneeName = refreshedLead.assignedTo?.name ?? assigneeName;

        await prisma.leadActivity.create({
          data: {
            leadId,
            type: "SYSTEM",
            notes: "Duplicate Meta lead merged into the existing record.",
            statusAfter: refreshedLead.status,
          },
        });

        if (!refreshedLead.assignedToId) {
          const autoAssign = await getAutoAssignEnabled();
          if (autoAssign) {
            const assignee = await assignLeadAutomatically(
              leadId,
              refreshedLead.priority,
            );
            assigneeName = assignee?.name ?? assigneeName;
          }
        }
      } else {
        const createdLead = await prisma.lead.create({
          data: {
            metaLeadId: externalId,
            name: parsedLead.name,
            phone: parsedLead.phone,
            phoneNormalized: parsedLead.phoneNormalized,
            email: parsedLead.email,
            city: parsedLead.city,
            twelfthLocation: parsedLead.twelfthLocation,
            jeeRankRange: parsedLead.jeeRankRange,
            courseInterest: parsedLead.courseInterest,
            dynamicField1: parsedLead.dynamicField1,
            dynamicField2: parsedLead.dynamicField2,
            dynamicField3: parsedLead.dynamicField3,
            source: "Meta Ads",
            campaignName: parsedLead.campaignName,
            adsetName: parsedLead.adsetName,
            adName: parsedLead.adName,
            formId: parsedLead.formId,
            pageId: parsedLead.pageId,
            priority: parsedLead.priority,
            rawPayload: parsedLead.rawPayload as Prisma.InputJsonValue,
          },
        });

        leadId = createdLead.id;
        const autoAssign = await getAutoAssignEnabled();
        if (autoAssign) {
          const assignee = await assignLeadAutomatically(
            leadId,
            createdLead.priority,
          );
          assigneeName = assignee?.name ?? null;
        }
      }

      await prisma.webhookEvent.upsert({
        where: { externalId },
        update: {
          payload: parsedLead.rawPayload as Prisma.InputJsonValue,
          processedAt: new Date(),
          leadId,
        },
        create: {
          externalId,
          payload: parsedLead.rawPayload as Prisma.InputJsonValue,
          processedAt: new Date(),
          leadId,
        },
      });

      try {
        await sendLeadAutoReply({
          phone: parsedLead.phoneNormalized,
          name: parsedLead.name,
          campaignName: parsedLead.campaignName,
        });
      } catch (error) {
        console.error("MSG91 auto reply failed", error);
      }

      if (assigneeName) {
        await prisma.leadActivity.create({
          data: {
            leadId,
            type: "SYSTEM",
            notes: `Lead ingested from Meta Ads and routed to ${assigneeName}.`,
          },
        });
      }

      results.push({ leadId, duplicate: Boolean(existingLead) });
    }
  }

  return results;
}

/* ------------------------------------------------------------------ */
/*  Google Ads webhook ingestion                                       */
/* ------------------------------------------------------------------ */

export async function ingestGoogleWebhook(
  parsed: ParsedGoogleLead,
): Promise<{ leadId?: string; duplicate?: boolean }> {
  if (parsed.phoneNormalized.length !== 10) {
    throw new Error("Google lead did not include a valid phone number.");
  }

  const externalId = parsed.externalId;

  // Dedup by webhookEvent
  const existingEvent = await prisma.webhookEvent.findUnique({
    where: { externalId },
    select: { id: true, processedAt: true, leadId: true },
  });

  if (existingEvent?.processedAt) {
    return {
      leadId: existingEvent.leadId ?? undefined,
      duplicate: true,
    };
  }

  // Dedup by googleLeadId or phone
  const existingLead = await prisma.lead.findFirst({
    where: {
      OR: [
        ...(externalId ? [{ googleLeadId: externalId }] : []),
        { phoneNormalized: parsed.phoneNormalized },
      ],
    },
    include: {
      assignedTo: { select: { id: true, name: true } },
    },
  });

  let leadId: string;
  let assigneeName: string | null = existingLead?.assignedTo?.name ?? null;

  if (existingLead) {
    const existingLeadWithDynamic = existingLead as typeof existingLead & {
      dynamicField1?: string | null;
      dynamicField2?: string | null;
      dynamicField3?: string | null;
    };

    const refreshedLead = await prisma.lead.update({
      where: { id: existingLead.id },
      data: {
        googleLeadId: existingLead.googleLeadId ?? externalId,
        googleClickId: existingLead.googleClickId ?? parsed.googleClickId,
        name:
          existingLead.name === "Google Lead" ? parsed.name : existingLead.name,
        phone: existingLead.phone || parsed.phone,
        email: existingLead.email ?? parsed.email,
        city: existingLead.city ?? parsed.city,
        twelfthLocation: existingLead.twelfthLocation ?? parsed.twelfthLocation,
        jeeRankRange: existingLead.jeeRankRange ?? parsed.jeeRankRange,
        courseInterest: existingLead.courseInterest ?? parsed.courseInterest,
        dynamicField1:
          existingLeadWithDynamic.dynamicField1 ?? parsed.dynamicField1,
        dynamicField2:
          existingLeadWithDynamic.dynamicField2 ?? parsed.dynamicField2,
        dynamicField3:
          existingLeadWithDynamic.dynamicField3 ?? parsed.dynamicField3,
        campaignName: parsed.campaignName ?? existingLead.campaignName,
        formId: parsed.formId ?? existingLead.formId,
        rawPayload: parsed.rawPayload as Prisma.InputJsonValue,
      },
      include: {
        assignedTo: { select: { id: true, name: true } },
      },
    });

    leadId = refreshedLead.id;
    assigneeName = refreshedLead.assignedTo?.name ?? assigneeName;

    await prisma.leadActivity.create({
      data: {
        leadId,
        type: "SYSTEM",
        notes: "Duplicate Google lead merged into the existing record.",
        statusAfter: refreshedLead.status,
      },
    });

    if (!refreshedLead.assignedToId) {
      const autoAssign = await getAutoAssignEnabled();
      if (autoAssign) {
        const assignee = await assignLeadAutomatically(
          leadId,
          refreshedLead.priority,
        );
        assigneeName = assignee?.name ?? assigneeName;
      }
    }
  } else {
    const createdLead = await prisma.lead.create({
      data: {
        googleLeadId: externalId,
        googleClickId: parsed.googleClickId,
        name: parsed.name,
        phone: parsed.phone,
        phoneNormalized: parsed.phoneNormalized,
        email: parsed.email,
        city: parsed.city,
        twelfthLocation: parsed.twelfthLocation,
        jeeRankRange: parsed.jeeRankRange,
        courseInterest: parsed.courseInterest,
        dynamicField1: parsed.dynamicField1,
        dynamicField2: parsed.dynamicField2,
        dynamicField3: parsed.dynamicField3,
        source: "Google Ads",
        campaignName: parsed.campaignName,
        formId: parsed.formId,
        priority: parsed.priority,
        rawPayload: parsed.rawPayload as Prisma.InputJsonValue,
      },
    });

    leadId = createdLead.id;
    const autoAssign = await getAutoAssignEnabled();
    if (autoAssign) {
      const assignee = await assignLeadAutomatically(
        leadId,
        createdLead.priority,
      );
      assigneeName = assignee?.name ?? null;
    }
  }

  await prisma.webhookEvent.upsert({
    where: { externalId },
    update: {
      source: "GOOGLE",
      payload: parsed.rawPayload as Prisma.InputJsonValue,
      processedAt: new Date(),
      leadId,
    },
    create: {
      source: "GOOGLE",
      externalId,
      payload: parsed.rawPayload as Prisma.InputJsonValue,
      processedAt: new Date(),
      leadId,
    },
  });

  try {
    await sendLeadAutoReply({
      phone: parsed.phoneNormalized,
      name: parsed.name,
      campaignName: parsed.campaignName,
    });
  } catch (error) {
    console.error("MSG91 auto reply failed for Google lead", error);
  }

  if (assigneeName) {
    await prisma.leadActivity.create({
      data: {
        leadId,
        type: "SYSTEM",
        notes: `Lead ingested from Google Ads and routed to ${assigneeName}.`,
      },
    });
  }

  return { leadId, duplicate: Boolean(existingLead) };
}
