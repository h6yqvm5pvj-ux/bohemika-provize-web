export const INSURERS = [
  { id: "allianz", name: "Allianz", logo: "/icons/allianz.png" },
  { id: "axa", name: "AXA", logo: "/icons/axalogo.png" },
  { id: "cpp", name: "ČPP", logo: "/icons/cpp.png" },
  { id: "csob", name: "ČSOB Pojišťovna", logo: "/icons/csb.png" },
  { id: "direct", name: "Direct", logo: "/icons/direct.png" },
  { id: "generali", name: "Generali Česká pojišťovna", logo: "/icons/generali.png" },
  { id: "kb", name: "Komerční pojišťovna", logo: "/icons/kblogo.png" },
  { id: "kooperativa", name: "Kooperativa", logo: "/icons/koop-v2.png" },
  { id: "maxima", name: "Maxima", logo: "/icons/maxima.png" },
  { id: "metlife", name: "MetLife", logo: "/icons/metlife.png" },
  { id: "nn", name: "NN", logo: "/icons/nn.png" },
  { id: "pillow", name: "Pillow", logo: "/icons/pillow.png" },
  { id: "pvzp", name: "Pojišťovna VZP", logo: "/icons/pdf/pvzp.png" },
  { id: "simplea", name: "Simplea", logo: "/icons/simplea.png" },
  { id: "slavia", name: "Slavia", logo: "/icons/pdf/slavia.png" },
  { id: "uniqa", name: "UNIQA", logo: "/icons/uniqa.png" },
  { id: "youplus", name: "YouPlus", logo: "/icons/youplus.png" },
] as const;

export function insurerById(id: string) { return INSURERS.find(insurer => insurer.id === id); }
export const normalizeSearch = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
