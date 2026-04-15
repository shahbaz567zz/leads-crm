import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

import {
  CONTACT_TOUCHPOINT_STATUSES,
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits.slice(2);
  }

  if (digits.length === 11 && digits.startsWith("0")) {
    return digits.slice(1);
  }

  return digits;
}

export function normaliseMetaKey(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export function normalizeEmpty(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function parseOptionalDate(value?: string | null) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function formatDateTime(value?: Date | string | null) {
  if (!value) {
    return "Not set";
  }

  return format(new Date(value), "d MMM yyyy, h:mm a");
}

export function formatDurationFromMinutes(totalMinutes: number) {
  if (totalMinutes < 60) {
    return `${totalMinutes}m`;
  }

  if (totalMinutes < 1440) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  return hours ? `${days}d ${hours}h` : `${days}d`;
}

export function formatPercent(value: number) {
  const rounded = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(1);
  return `${rounded}%`;
}

export function toDateTimeLocal(value?: Date | string | null) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function inferLeadPriority(rank?: string | null): LeadPriorityValue {
  const normalized = rank?.replace(/,/g, "").toLowerCase();

  if (!normalized) {
    return "MEDIUM";
  }

  const firstNumber = normalized.match(/\d+/)?.[0];
  const numericRank = firstNumber ? Number(firstNumber) : Number.NaN;

  if (!Number.isNaN(numericRank)) {
    if (normalized.includes("above") || numericRank >= 200000) {
      return "LOW";
    }

    if (normalized.includes("below") || numericRank <= 100000) {
      return "HIGH";
    }
  }

  if (normalized.includes("top") || normalized.includes("best")) {
    return "HIGH";
  }

  return "MEDIUM";
}

export function isContactedStatus(status: LeadStatusValue) {
  return CONTACT_TOUCHPOINT_STATUSES.includes(status);
}
