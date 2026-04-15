"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickLeadForm } from "./quick-lead-form";

type TelecallerOption = { id: string; name: string };

export function AddLeadModal({
  canChooseAssignee,
  telecallers,
}: {
  canChooseAssignee: boolean;
  telecallers: TelecallerOption[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button onClick={() => setOpen(true)} className="gap-2" size="sm">
        <Plus className="h-4 w-4" />
        Quick Add Lead
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md max-h-[90vh] flex flex-col relative overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <h2 className="text-lg font-semibold">New Lead</h2>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-full hover:bg-slate-100 text-slate-500"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto p-4 custom-scrollbar">
              <div className="[&>.card]:shadow-none [&>.card]:border-0 [&>.card]:p-0">
                <QuickLeadForm
                  canChooseAssignee={canChooseAssignee}
                  telecallers={telecallers}
                  onSuccess={() => setOpen(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
