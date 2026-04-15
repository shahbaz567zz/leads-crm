import {
  LEAD_PRIORITY_LABELS,
  LEAD_STATUS_LABELS,
  PRIORITY_STYLES,
  STATUS_STYLES,
  type LeadPriorityValue,
  type LeadStatusValue,
} from "@/lib/crm-constants";
import { cn } from "@/lib/utils";

type PillProps = {
  className?: string;
  value: LeadStatusValue | LeadPriorityValue;
  mode: "status" | "priority";
};

export function StatusPill({ value, className, mode }: PillProps) {
  const label =
    mode === "status"
      ? LEAD_STATUS_LABELS[value as LeadStatusValue]
      : LEAD_PRIORITY_LABELS[value as LeadPriorityValue];

  const tone =
    mode === "status"
      ? STATUS_STYLES[value as LeadStatusValue]
      : PRIORITY_STYLES[value as LeadPriorityValue];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold tracking-wide",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}
