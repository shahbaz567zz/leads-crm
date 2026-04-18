"use client";

import { Settings2 } from "lucide-react";
import { useRef } from "react";

import {
  DataTable,
  type DataTableHandle,
  type DataTableProps,
} from "@/components/data-table";
import { LeadQueueFilters } from "@/components/lead-queue-filters";
import { Button } from "@/components/ui/button";

export function LeadQueueSection({
  telecallers,
  managerMode,
  ...tableProps
}: DataTableProps) {
  const dataTableRef = useRef<DataTableHandle>(null);

  return (
    <>
      <LeadQueueFilters
        managerMode={managerMode}
        telecallers={telecallers}
        actions={
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 whitespace-nowrap"
            onClick={() => dataTableRef.current?.openColumnPicker()}
          >
            <Settings2 className="h-4 w-4" />
            Columns
          </Button>
        }
      />

      <DataTable
        ref={dataTableRef}
        telecallers={telecallers}
        managerMode={managerMode}
        {...tableProps}
      />
    </>
  );
}
