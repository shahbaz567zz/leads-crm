import { z } from "zod";

import {
  ACTIVITY_TYPES,
  LEAD_PRIORITIES,
  LEAD_STATUSES,
  USER_ROLES,
} from "@/lib/crm-constants";

const optionalText = (maxLength = 160) =>
  z
    .union([
      z.string().trim().max(maxLength),
      z.literal(""),
      z.null(),
      z.undefined(),
    ])
    .transform((value) => {
      if (typeof value !== "string") {
        return undefined;
      }

      const trimmed = value.trim();
      return trimmed.length ? trimmed : undefined;
    });

const optionalPassword = z
  .union([z.string().min(8).max(120), z.literal(""), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value !== "string") {
      return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length ? trimmed : undefined;
  });

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(120),
});

export const createLeadSchema = z.object({
  name: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(10).max(20),
  email: optionalText(120),
  city: optionalText(120),
  twelfthLocation: optionalText(120),
  jeeRankRange: optionalText(120),
  courseInterest: optionalText(120),
  source: optionalText(120),
  campaignName: optionalText(140),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assignedToId: optionalText(40),
});

export const updateLeadSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  nextFollowUpAt: optionalText(40),
  meetingScheduledAt: optionalText(40),
  assignedToId: optionalText(40),
  counsellorNotes: optionalText(4000),
});

export const createActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES).default("NOTE"),
  title: optionalText(140),
  notes: z.string().trim().min(2).max(4000),
  nextFollowUpAt: optionalText(40),
  statusAfter: z.enum(LEAD_STATUSES).optional(),
  meetingScheduledAt: optionalText(40),
  venue: optionalText(160),
});

export const dashboardFiltersSchema = z.object({
  q: optionalText(160),
  status: z.enum(LEAD_STATUSES).optional(),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  assigned: optionalText(40),
  due: z.enum(["all", "today", "overdue"]).optional(),
  sla: z
    .enum([
      "overdue_open",
      "due_today_open",
      "high_priority_uncontacted",
      "stale_30m",
      "stale_2h",
    ])
    .optional(),
});

const DASHBOARD_FILTER_DEFAULTS = {
  q: undefined,
  assigned: undefined,
} satisfies Pick<z.infer<typeof dashboardFiltersSchema>, "q" | "assigned">;

export const filteredCountSchema = z.object({
  filters: dashboardFiltersSchema.default(DASHBOARD_FILTER_DEFAULTS),
  telecallerId: optionalText(40),
});

export const bulkDeleteSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("selected"),
    ids: z.array(z.string().trim().min(1)).min(1).max(500),
  }),
  z.object({
    mode: z.literal("filtered"),
    filters: dashboardFiltersSchema.default(DASHBOARD_FILTER_DEFAULTS),
  }),
]);

export const bulkAssignSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("selected"),
    ids: z.array(z.string().trim().min(1)).min(1).max(500),
    telecallerId: z.string().trim().min(1),
  }),
  z.object({
    mode: z.literal("filtered"),
    filters: dashboardFiltersSchema.default(DASHBOARD_FILTER_DEFAULTS),
    telecallerId: z.string().trim().min(1),
  }),
]);

export const csvImportColumnMappingSchema = z
  .record(z.string(), z.string().trim().min(1).max(200))
  .optional();

const MAPPING_SOURCES = ["META", "GOOGLE", "CSV"] as const;

export const campaignMappingSchema = z.object({
  source: z.enum(MAPPING_SOURCES),
  label: z.string().trim().min(2).max(160),
  campaignName: optionalText(200),
  formId: optionalText(200),
  columnMapping: z.record(z.string(), z.string().trim().min(1).max(200)),
});

export const createPortalUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  phone: optionalText(40),
  role: z.enum(USER_ROLES),
  isActive: z.boolean().optional().default(true),
  isPriorityAgent: z.boolean().optional().default(false),
  password: z.string().trim().min(8).max(120),
});

export const updatePortalUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase())
    .optional(),
  phone: optionalText(40),
  role: z.enum(USER_ROLES).optional(),
  isActive: z.boolean().optional(),
  isPriorityAgent: z.boolean().optional(),
  password: optionalPassword,
});

export const reassignManagedUserLeadsSchema = z.object({
  targetTelecallerId: z.string().trim().min(1),
  deleteSourceUser: z.boolean().optional().default(false),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type CreateActivityInput = z.infer<typeof createActivitySchema>;
export type DashboardFiltersInput = z.infer<typeof dashboardFiltersSchema>;
export type BulkDeleteInput = z.infer<typeof bulkDeleteSchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
export type CsvImportColumnMappingInput = z.infer<
  typeof csvImportColumnMappingSchema
>;
export type CampaignMappingInput = z.infer<typeof campaignMappingSchema>;
export type FilteredCountInput = z.infer<typeof filteredCountSchema>;
export type CreatePortalUserInput = z.infer<typeof createPortalUserSchema>;
export type UpdatePortalUserInput = z.infer<typeof updatePortalUserSchema>;
export type ReassignManagedUserLeadsInput = z.infer<
  typeof reassignManagedUserLeadsSchema
>;
