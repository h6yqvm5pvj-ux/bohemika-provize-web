import { createScreenshotSection, excluded, positive, negative, neutral } from "./screenshotData";
import { ADDITIONAL_COINSURED_ANSWERS } from "./additionalProductData";
import { REMAINING_COINSURED_ANSWERS } from "./remainingProductData";
import { HISTORICAL_COINSURED_ANSWERS } from "./historicalCoinsuredData";

const yes = positive("Ano");
const anyAge = positive("Ano (jakéhokoliv věku a stavu)");
const household = { parentId: "household-members", parentLabel: "Osoby trvale žijící ve společné domácnosti" };
const helper = { parentId: "household-helpers", parentLabel: "Výpomoc v domácnosti" };
const contractedHelper = { parentId: "contracted-helpers", parentLabel: "Výpomoc na základě smlouvy (bez pracovněprávního vztahu)", coverageParentId: "contracted-helpers" };

// Podklady uživatele z 19. 9. 2026, 18:18:55, 18:19:06 a 18:19:13.
export const COINSURED_SECTION = createScreenshotSection({ id: "coinsured", title: "Spolupojištěné osoby", number: "06" }, [
  {
    id: "household-members", title: "Osoby trvale žijící ve společné domácnosti (a hradící společné náklady)",
    values: [yes, yes, yes, yes, yes],
  },
  {
    id: "partners", title: "Partneři (manžel a manželka, druh a družka, registrované partnerství)", ...household,
    values: [yes, yes, yes, yes, yes],
  },
  {
    id: "children", title: "Dítě (včetně nevlastního, osvojeného či dítěte svěřeného do pěstounské péče)", ...household,
    values: [anyAge, neutral("Ano, do 26 let věku dítěte"), anyAge, positive("Ano, jakéhokoliv věku dítěte", "Pokud dítě s pojištěným nežije, pak platí hranice 26 let."), anyAge],
  },
  {
    id: "direct-relatives", title: "Osoby příbuzné v linii přímé (pochází-li jedna osoba od druhé), vyjma výše uvedených, které se podílejí na úhradě nákladů (např. prarodiče)", ...household,
    values: [yes, yes, yes, yes, yes],
  },
  { id: "limited-capacity-relative", title: "Příbuzný s omezenou svéprávností", ...household, values: [yes, negative("Není součástí, jen v přímé linii"), yes, yes, yes] },
  { id: "other-paying-members", title: "Ostatní osoby hradící náklady na své potřeby", ...household, values: [yes, excluded, yes, yes, yes] },
  { id: "non-paying-friends", title: "Osoby blízké, které se nepodílejí na úhradě společných potřeb (např. přátelé)", ...household, values: [excluded, excluded, excluded, excluded, excluded] },
  { id: "household-helpers", title: "Osoby vypomáhající v domácnosti pojištěného", values: [yes, yes, yes, yes, yes] },
  { id: "helper-chores", title: "Běžné činnosti v domácnosti (např. úklid, údržba)", ...helper, values: [yes, yes, yes, yes, yes] },
  { id: "helper-childcare", title: "Hlídání a opatrování dětí", ...helper, values: [excluded, yes, yes, excluded, yes] },
  { id: "helper-pet-care", title: "Hlídání a opatrování zvířat", ...helper, values: [yes, yes, yes, yes, yes] },
  { id: "helper-property-care", title: "Opatrování a údržba nemovité věci", ...helper, values: [yes, yes, excluded, yes, yes] },
  { id: "helper-path-maintenance", title: "Čištění a údržba chodníků, schodišť, chodeb apod.", ...helper, values: [yes, yes, excluded, yes, yes] },
  { id: "helper-construction", title: "Pomocné stavební práce", ...helper, values: [yes, yes, excluded, excluded, yes] },
  {
    id: "contracted-helpers", title: "Osoby vypomáhající v domácnosti pojištěného na základě smlouvy (nezakládající pracovněprávní vztah)",
    values: [excluded, yes, yes, yes, excluded],
  },
  { id: "contracted-helper-chores", title: "Běžné činnosti v domácnosti (např. úklid, údržba)", ...contractedHelper, values: [excluded, yes, yes, yes, excluded] },
  { id: "contracted-helper-childcare", title: "Hlídání a opatrování dětí", ...contractedHelper, values: [excluded, yes, yes, excluded, excluded] },
  { id: "contracted-helper-pet-care", title: "Hlídání a opatrování zvířat", ...contractedHelper, values: [excluded, yes, yes, yes, excluded] },
  { id: "contracted-helper-property-care", title: "Opatrování a údržba nemovité věci", ...contractedHelper, values: [excluded, yes, excluded, yes, excluded] },
  { id: "contracted-helper-path-maintenance", title: "Čištění a údržba chodníků, schodišť, chodeb apod.", ...contractedHelper, values: [excluded, yes, excluded, yes, excluded] },
  { id: "contracted-helper-construction", title: "Pomocné stavební práce", ...contractedHelper, values: [excluded, yes, excluded, excluded, excluded] },
], { ...ADDITIONAL_COINSURED_ANSWERS, ...REMAINING_COINSURED_ANSWERS, ...HISTORICAL_COINSURED_ANSWERS });
