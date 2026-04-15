import { addDays, endOfDay, startOfDay } from "date-fns";
import { type Prisma } from "@prisma/client";

import { canManageAssignments, type SessionUser } from "@/lib/auth";
import {
  CLOSED_LEAD_STATUSES,
  LEAD_STATUS_LABELS,
  PRIORITY_WEIGHT,
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

const leadExportSelect = {
  name: true,
  phone: true,
  email: true,
  city: true,
  twelfthLocation: true,
  jeeRankRange: true,
  courseInterest: true,
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
) {
  const scopeWhere = buildScopedWhere(user);
  const visibleWhere = buildScopedWhere(user, filters);

  const [
    leads,
    totalLeads,
    newLeads,
    dueToday,
    overdue,
    converted,
    meetingsSoon,
    analyticsRows,
  ] = await prisma.$transaction([
    prisma.lead.findMany({
      where: visibleWhere,
      orderBy: [{ createdAt: "desc" }],
      include: {
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
      },
      take: 150,
    }),
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
  ]);
  const telecallers = await getTelecallers();
  const reporting = buildDashboardReporting(
    analyticsRows,
    telecallers,
    totalLeads,
    converted,
  );

  const sortedLeads = [...leads].sort((left, right) => {
    const priorityComparison =
      PRIORITY_WEIGHT[left.priority] - PRIORITY_WEIGHT[right.priority];
    if (priorityComparison !== 0) {
      return priorityComparison;
    }

    return right.createdAt.getTime() - left.createdAt.getTime();
  });

  return {
    leads: sortedLeads,
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
    },
  });

  if (!existingLead) {
    return null;
  }

  assertLeadAccess(actor, existingLead.assignedToId);

  if (input.assignedToId && !canManageAssignments(actor)) {
    throw new Error("Only managers can reassign leads.");
  }

  if (input.assignedToId && input.assignedToId !== existingLead.assignedToId) {
    await assignLeadManually(leadId, input.assignedToId, actor);
  }

  const nextFollowUpAt = parseOptionalDate(input.nextFollowUpAt);
  const meetingScheduledAt = parseOptionalDate(input.meetingScheduledAt);
  const nextStatus = input.status ?? existingLead.status;
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
        status: nextStatus,
        priority: nextPriority,
        nextFollowUpAt,
        meetingScheduledAt,
        counsellorNotes: input.counsellorNotes,
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
