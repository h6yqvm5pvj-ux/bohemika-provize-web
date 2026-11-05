import "next/dist/compiled/server-only";

import { normalizeDirectoryContacts, type DirectoryContact } from "@/app/lib/contactDirectory";

const legacyContacts: DirectoryContact[] = [
  {
    id: "bohemika-pavlina-bartkova",
    institutionKey: "bohemika",
    person: "Bc. Pavlína Bártková",
    description:
      "Správa sjednatelů, registrace, pohledávky a požadavky sjednatelů",
    phone: { display: "+420 603 458 845", href: "+420603458845" },
    emails: [
      { value: "pavlina.bartkova@bohemika.eu", label: "Pavlína Bártková" },
      { value: "pohledavky@bohemika.eu", label: "Pohledávky" },
    ],
  },
  {
    id: "bohemika-bela-kulhankova",
    institutionKey: "bohemika",
    person: "Běla Kulhánková",
    description:
      "Reklamace provizí vůči sjednatelům, zpracování žádostí, elektronizace smluv, bonusové akce a soutěže",
    phone: { display: "+420 734 353 363", href: "+420734353363" },
    emails: [{ value: "bela.kulhankova@bohemika.eu" }],
  },
  {
    id: "cpp",
    institutionKey: "cpp",
    person: "Vojtěch Vodička",
    role: "KAM",
    phone: { display: "+420 734 522 927", href: "+420734522927" },
    emails: [{ value: "vojtech.vodicka@cpp.cz" }],
  },
  {
    id: "allianz-storno",
    institutionKey: "allianz",
    description: "Storno smluv",
    emails: [{ value: "BO_storno_auta@allianz.cz", label: "Storno smluv" }],
    notice: "Nesdělovat e-mail klientům, pouze pro interní účely!",
  },
  {
    id: "allianz-metodicka-podpora",
    institutionKey: "allianz",
    description: "Metodická podpora a informace o smlouvách",
    phone: { display: "+420 241 170 000", href: "+420241170000" },
    emails: [{ value: "info@allianz.cz" }],
  },
  {
    id: "allianz-eliska-stastna",
    institutionKey: "allianz",
    person: "Eliška Šťastná",
    role: "KAM",
    phone: { display: "+420 731 922 909", href: "+420731922909" },
    emails: [{ value: "eliska.stastna@allianz.cz" }],
  },
  {
    id: "uniqa",
    institutionKey: "uniqa",
    person: "Luboš Meruňka",
    role: "KAM",
    phone: { display: "+420 734 163 979", href: "+420734163979" },
    emails: [{ value: "lubos.merunka@uniqa.cz" }],
  },
  {
    id: "kooperativa",
    institutionKey: "kooperativa",
    person: "Jiří Kratochvíl",
    emails: [
      { value: "jkratochvil@koop.cz", label: "Jiří Kratochvíl" },
      {
        value: "podporasever@koop.cz",
        label: "Podpora Sever",
        cc: "jkratochvil@koop.cz",
      },
    ],
    notice:
      "Při e-mailu na Podporu Sever musí být v kopii také Jiří Kratochvíl. Kliknutím na adresu se kopie doplní automaticky.",
  },
  {
    id: "investika",
    institutionKey: "investika",
    person: "Tereza Bartůňková",
    phone: { display: "+420 702 218 819", href: "+420702218819" },
    emails: [
      { value: "terezabartunkova@investika.cz", label: "Tereza Bartůňková" },
      { value: "administrace@investika.cz", label: "Administrace" },
    ],
  },
  {
    id: "csob",
    institutionKey: "csob",
    person: "Daniel Vlk",
    role: "KAM",
    phone: { display: "+420 604 293 177", href: "+420604293177" },
    emails: [{ value: "dvlk@csob.cz" }],
  },
  {
    id: "maxima",
    institutionKey: "maxima",
    person: "Alena Zikmundová",
    phone: { display: "+420 736 777 434", href: "+420736777434" },
    emails: [{ value: "zikmundova@maxima-as.cz" }],
  },
  {
    id: "slavia",
    institutionKey: "slavia",
    phone: { display: "+420 731 011 598", href: "+420731011598" },
    emails: [{ value: "Katerina.Kubatova@slavia-pojistovna.cz" }],
  },
  {
    id: "pillow-martin-kroupa",
    institutionKey: "pillow",
    person: "Martin Kroupa",
    role: "KAM",
    description: "Online Ambasador",
    phone: { display: "+420 790 388 478", href: "+420790388478" },
    emails: [{ value: "martin.kroupa@pillow.cz" }],
  },
  {
    id: "pillow-klientsky-servis",
    institutionKey: "pillow",
    description: "Klientský servis Pillow",
    phone: { display: "+420 777 657 827", href: "+420777657827" },
  },
];


// Legacy contacts are available to every authenticated advisor.
export const DEFAULT_DIRECTORY_CONTACTS = normalizeDirectoryContacts(legacyContacts)!;
