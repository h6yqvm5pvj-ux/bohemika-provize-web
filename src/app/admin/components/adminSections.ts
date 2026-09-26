import { Activity, Globe2, Inbox, Landmark, Link2, Megaphone, ShieldCheck, UserPlus, UsersRound } from "lucide-react";

export const ADMIN_SECTIONS = [
  { id: "requests", label: "Žádosti", title: "Žádosti a požadavky", description: "Vše, co potřebuje tvoje rozhodnutí. Žádosti, převody smluv a změny v týmu na jednom místě.", icon: Inbox },
  { id: "createUser", label: "Nový uživatel", title: "Nový člen týmu", description: "Založ nový účet a připrav kolegovi vše potřebné pro první přihlášení.", icon: UserPlus },
  { id: "users", label: "Uživatelé", title: "Lidé v Bohemce", description: "Přehled kolegů, jejich profilů a přístupů. Najdi člověka a spravuj jeho účet.", icon: UsersRound },
  { id: "broadcasts", label: "Notifikace", title: "Dej týmu vědět", description: "Důležité novinky ve správný čas. Připrav upozornění a vyber, komu se zobrazí.", icon: Megaphone },
  { id: "subscriptions", label: "Předplatné", title: "Platby a předplatné", description: "Tarify, platnost přístupů a historie plateb. Přehledně pro každý účet.", icon: Landmark },
  { id: "security", label: "Zabezpečení", title: "Přístupy pod kontrolou", description: "Ověření účtů a zabezpečení přihlášení. Uvidíš, kde je potřeba doplnit ochranu.", icon: ShieldCheck },
  { id: "loginActivity", label: "Přihlášení", title: "Odkud přicházejí přihlášení", description: "Historie přihlášení a odmítnutých pokusů. Země, účty a výsledky pro bezpečnostní dohled.", icon: Globe2 },
  { id: "productMap", label: "Mapa výpisů", title: "Produktová mapa výpisů", description: "Propoj kódy z provizních výpisů s produkty a nastav pravidla jejich zpracování.", icon: Link2, href: "/admin/provizni-vypisy/produktova-mapa" },
  { id: "dataHealth", label: "Kontrola dat", title: "Kondice tvých dat", description: "Odhal duplicity, neúplné vazby a rozdíly v součtech. Všechny nálezy na jednom místě.", icon: Activity, href: "/admin/data-health" },
] as const;

export type AdminPage = (typeof ADMIN_SECTIONS)[number]["id"];
export type AdminSection = Exclude<AdminPage, "productMap" | "dataHealth">;
