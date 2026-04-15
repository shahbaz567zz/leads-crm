export const USER_ROLES = ["ADMIN", "MANAGER", "TELECALLER"] as const;
export const LEAD_STATUSES = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "INTERESTED",
  "MEETING_SCHEDULED",
  "VISITED",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
] as const;
export const LEAD_PRIORITIES = ["HIGH", "MEDIUM", "LOW"] as const;
export const ACTIVITY_TYPES = [
  "CALL",
  "WHATSAPP",
  "NOTE",
  "STATUS_CHANGE",
  "MEETING",
  "SYSTEM",
] as const;
export const MEETING_STATUSES = [
  "SCHEDULED",
  "COMPLETED",
  "NO_SHOW",
  "CANCELLED",
] as const;

export type UserRoleValue = (typeof USER_ROLES)[number];
export type LeadStatusValue = (typeof LEAD_STATUSES)[number];
export type LeadPriorityValue = (typeof LEAD_PRIORITIES)[number];
export type ActivityTypeValue = (typeof ACTIVITY_TYPES)[number];

export const LEAD_STATUS_LABELS: Record<LeadStatusValue, string> = {
  NEW: "New",
  ASSIGNED: "Assigned",
  CONTACTED: "Contacted",
  INTERESTED: "Interested",
  MEETING_SCHEDULED: "Meeting Scheduled",
  VISITED: "Visited Office",
  CONVERTED: "Converted",
  NOT_INTERESTED: "Not Interested",
  LOST: "Lost",
};

export const LEAD_PRIORITY_LABELS: Record<LeadPriorityValue, string> = {
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
};

export const ACTIVITY_TYPE_LABELS: Record<ActivityTypeValue, string> = {
  CALL: "Call",
  WHATSAPP: "WhatsApp",
  NOTE: "Note",
  STATUS_CHANGE: "Status Change",
  MEETING: "Meeting",
  SYSTEM: "System",
};

export const STATUS_STYLES: Record<LeadStatusValue, string> = {
  NEW: "bg-amber-100 text-amber-900 border-amber-200",
  ASSIGNED: "bg-sky-100 text-sky-900 border-sky-200",
  CONTACTED: "bg-indigo-100 text-indigo-900 border-indigo-200",
  INTERESTED: "bg-emerald-100 text-emerald-900 border-emerald-200",
  MEETING_SCHEDULED: "bg-cyan-100 text-cyan-900 border-cyan-200",
  VISITED: "bg-violet-100 text-violet-900 border-violet-200",
  CONVERTED: "bg-emerald-200 text-emerald-950 border-emerald-300",
  NOT_INTERESTED: "bg-rose-100 text-rose-900 border-rose-200",
  LOST: "bg-zinc-200 text-zinc-800 border-zinc-300",
};

export const PRIORITY_STYLES: Record<LeadPriorityValue, string> = {
  HIGH: "bg-rose-100 text-rose-900 border-rose-200",
  MEDIUM: "bg-amber-100 text-amber-900 border-amber-200",
  LOW: "bg-teal-100 text-teal-900 border-teal-200",
};

export const CONTACT_TOUCHPOINT_STATUSES: LeadStatusValue[] = [
  "CONTACTED",
  "INTERESTED",
  "MEETING_SCHEDULED",
  "VISITED",
  "CONVERTED",
];

export const CLOSED_LEAD_STATUSES: LeadStatusValue[] = [
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
];

export const STATUS_FLOW: LeadStatusValue[] = [
  "NEW",
  "ASSIGNED",
  "CONTACTED",
  "INTERESTED",
  "MEETING_SCHEDULED",
  "VISITED",
  "CONVERTED",
  "NOT_INTERESTED",
  "LOST",
];

export const PRIORITY_WEIGHT: Record<LeadPriorityValue, number> = {
  HIGH: 0,
  MEDIUM: 1,
  LOW: 2,
};
