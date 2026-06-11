import { type ProductInstitutionId } from "@/app/lib/productCatalog";

export type InstitutionLogoKey =
  | ProductInstitutionId
  | "generali"
  | "metlife"
  | "nn"
  | "simplea"
  | "unknown";

export type InstitutionLogoSize = "card" | "compact" | "chip";

const LOGO_KEY_BY_PATH: Record<string, InstitutionLogoKey> = {
  "/icons/cpp.png": "cpp",
  "/icons/koop-v2.png": "kooperativa",
  "/icons/maxima.png": "maxima",
  "/icons/allianz.png": "allianz",
  "/icons/slavialogo.png": "slavia",
  "/icons/uniqa.png": "uniqa",
  "/icons/csob.png": "csob",
  "/icons/csb.png": "csob",
  "/icons/pillow.png": "pillow",
  "/icons/axalogo.png": "axa",
  "/icons/cclogo.png": "comfort",
  "/icons/generali.png": "generali",
  "/icons/metlife.png": "metlife",
  "/icons/nn.png": "nn",
  "/icons/simplea.png": "simplea",
};

export function institutionLogoKeyFromPath(path?: string | null): InstitutionLogoKey {
  if (!path) return "unknown";
  return LOGO_KEY_BY_PATH[path] ?? "unknown";
}

export function institutionLogoKeyFromInsurerName(
  insurer?: string | null
): InstitutionLogoKey {
  const normalized = (insurer ?? "").toLowerCase();
  if (normalized.includes("čpp") || normalized.includes("cpp")) return "cpp";
  if (normalized.includes("kooperativa")) return "kooperativa";
  if (normalized.includes("maxima")) return "maxima";
  if (normalized.includes("allianz")) return "allianz";
  if (normalized.includes("slavia")) return "slavia";
  if (normalized.includes("comfort") || normalized.includes("commodity")) {
    return "comfort";
  }
  if (normalized.includes("uniqa")) return "uniqa";
  if (normalized.includes("čsob") || normalized.includes("csob")) return "csob";
  if (normalized.includes("pillow")) return "pillow";
  if (normalized.includes("axa")) return "axa";
  if (normalized.includes("generali")) return "generali";
  if (normalized.includes("metlife")) return "metlife";
  if (normalized.includes("simplea")) return "simplea";
  if (normalized.includes("nn")) return "nn";
  return "unknown";
}

export function institutionLogoFrameClass(
  logoKey?: InstitutionLogoKey | null,
  size: InstitutionLogoSize = "card"
): string {
  const key = logoKey ?? "unknown";

  if (size === "chip") {
    if (key === "slavia") return "h-7 w-7";
    if (key === "nn") return "h-7 w-8";
    if (key === "uniqa" || key === "csob") return "h-7 w-10";
    return "h-7 w-9";
  }

  if (size === "compact") {
    if (key === "slavia") return "h-9 w-12";
    if (key === "nn") return "h-9 w-12";
    if (key === "uniqa" || key === "csob") return "h-9 w-14";
    return "h-9 w-16";
  }

  if (key === "slavia") return "h-10 w-14";
  if (key === "nn") return "h-10 w-14";
  if (key === "uniqa" || key === "csob") return "h-10 w-16";
  return "h-10 w-[4.5rem]";
}

export function institutionLogoImageClass(
  logoKey?: InstitutionLogoKey | null
): string {
  const key = logoKey ?? "unknown";
  switch (key) {
    case "cpp":
    case "kooperativa":
      return "object-contain object-center scale-[1.22]";
    case "allianz":
    case "axa":
      return "object-contain object-center scale-[1.14]";
    case "slavia":
      return "object-contain object-center scale-[1.12]";
    case "pillow":
    case "maxima":
      return "object-contain object-center scale-[1.08]";
    case "csob":
    case "uniqa":
      return "object-contain object-center scale-[1.05]";
    case "simplea":
      return "object-contain object-center scale-[1.34]";
    default:
      return "object-contain object-center";
  }
}
