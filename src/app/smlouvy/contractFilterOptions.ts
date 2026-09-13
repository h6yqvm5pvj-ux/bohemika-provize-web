import { AlertCircle, Clock, CircleDollarSign, BriefcaseBusiness, WalletCards, type LucideIcon } from "lucide-react";
import type { CommissionAuditFilterMode, CommissionAuditFilterCode } from "./contractsPageTypes";
export const COMMISSION_AUDIT_MODE_DEFS: {
  id: Exclude<CommissionAuditFilterMode, "off">;
  label: string;
  description: string;
  icon: LucideIcon;
  tone: string;
}[] = [
  {
    id: "overdue",
    label: "Nevyplacené",
    description: "Provize po termínu za posledních 180 dní bez zapsané platby.",
    icon: AlertCircle,
    tone: "border-rose-200 bg-rose-50 text-rose-700",
  },
  {
    id: "upcoming",
    label: "Blíží se",
    description: "Provize s očekávanou výplatou do 90 dní.",
    icon: Clock,
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  {
    id: "difference",
    label: "Rozdíly ve výpisu",
    description: "Rozdíl ve vyplacené částce nebo v kariérním stupni.",
    icon: CircleDollarSign,
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  {
    id: "career_mismatch",
    label: "Jiný kariérní stupeň",
    description: "Vyplaceno na jiném stupni bez pozdější opravy přes storno a správnou platbu.",
    icon: BriefcaseBusiness,
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  {
    id: "all",
    label: "Vše k provizím",
    description: "Nevyplacené, blížící se, rozdílové i kariérní položky.",
    icon: WalletCards,
    tone: "border-slate-200 bg-slate-100 text-slate-700",
  },
];

export const COMMISSION_AUDIT_CODE_DEFS: {
  id: CommissionAuditFilterCode;
  label: string;
}[] = [
  { id: "all", label: "Všechny kódy" },
  { id: "a101", label: "A101-A112" },
  { id: "b0301", label: "B0301 / B301" },
  { id: "b36", label: "B36 / B036 / B3601" },
  { id: "b48", label: "B48 / B048 / B4801" },
  { id: "subsequent", label: "Následné B101-B112" },
];
