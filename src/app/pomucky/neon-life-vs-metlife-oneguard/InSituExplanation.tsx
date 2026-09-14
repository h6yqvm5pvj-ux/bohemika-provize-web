"use client";

import { useState } from "react";
import { CircleHelp } from "lucide-react";

import { HelpDialog } from "@/components/HelpDialog";
import { IN_SITU_CONTENT, IN_SITU_DESCRIPTION, IN_SITU_TITLE } from "./inSituContent";
import styles from "./comparison.module.css";

export function InSituExplanation() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={styles.helpButton}
      >
        <CircleHelp className="h-3.5 w-3.5" aria-hidden="true" />
        Co je to?
      </button>

      <HelpDialog
        isOpen={open}
        onClose={() => setOpen(false)}
        title={IN_SITU_TITLE}
        description={IN_SITU_DESCRIPTION}
      >
        {IN_SITU_CONTENT}
      </HelpDialog>
    </>
  );
}
