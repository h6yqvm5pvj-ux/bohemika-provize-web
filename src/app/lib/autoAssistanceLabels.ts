const AUTO_ASSISTANCE_LABELS: Record<string, string> = {
  zakladni: "Základní",
  standard: "Standard",
  nadstandard: "Nadstandard",
  "bez limitu": "Bez limitu",
  bez_limitu: "Bez limitu",
  plus: "PLUS",
  plus_dvojnasob: "PLUS Dvojnásob",
  "plus dvojnasob": "PLUS Dvojnásob",
  cr_bez_limitu: "CAR PLUS v ČR bez limitu",
  "v čr bez limitu": "CAR PLUS v ČR bez limitu",
  "v cr bez limitu": "CAR PLUS v ČR bez limitu",
  evropa_cr_bez_limitu: "CAR PREMIUM ČR a EVROPA bez limitu",
  "evropa a čr bez limitu": "CAR PREMIUM ČR a EVROPA bez limitu",
  "evropa a cr bez limitu": "CAR PREMIUM ČR a EVROPA bez limitu",
  odtah_50_km_pri_nehode: "Odtah 50 km při nehodě",
  odtah_50_km: "Odtah 50 km",
  odtah_v_cr_neomezene: "Odtah v ČR neomezeně",
  odtah_i_ze_zahranici: "Odtah i ze zahraničí",
};

export const autoAssistancePlanLabel = (value?: string | null): string => {
  if (!value) return "—";
  const key = value.trim().toLowerCase();
  return AUTO_ASSISTANCE_LABELS[key] ?? value;
};
