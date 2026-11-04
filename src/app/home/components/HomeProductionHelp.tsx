"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";
import { ProductionHelpDialog } from "./ProductionHelpDialog";

type Props = {
  className: string;
  showTeamBox: boolean;
  showOnlyTeamProduction: boolean;
};

export function HomeProductionHelp({ className, showTeamBox, showOnlyTeamProduction }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={() => setOpen(true)}
        aria-label="Otevřít nápovědu k produkci"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Nápověda"
      >
        <CircleHelp size={20} aria-hidden="true" />
        <span>Nápověda</span>
      </button>
      <ProductionHelpDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        showTeamBox={showTeamBox}
        showOnlyTeamProduction={showOnlyTeamProduction}
      />
    </>
  );
}
