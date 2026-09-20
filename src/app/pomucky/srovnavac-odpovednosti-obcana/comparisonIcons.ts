import {
  Baby, Banknote, Bike, BookOpenText, Building2, CalendarDays, CarFront, Cat,
  Crosshair, Dog, Dumbbell, Fence, FileSignature, Footprints, Globe2, Hammer,
  HandHelping, HeartHandshake, HeartPulse, House, KeyRound, LandPlot, PawPrint,
  Plane, Rabbit, Route, Scale, ShieldCheck, ShieldX, Ship, Smartphone, Sprout,
  Trees, UserRoundCheck, UsersRound, WalletCards, Wrench, Zap, type LucideIcon,
} from "lucide-react";

export const SECTION_ICONS: Record<string, LucideIcon> = {
  general: ShieldCheck, "life-sport": Bike, breeder: PawPrint,
  property: House, tenancy: KeyRound, coinsured: UsersRound,
};

const CRITERION_ICONS: Record<string, LucideIcon> = {
  "maximum-limit": WalletCards, territory: Globe2, negligence: Scale,
  "negligence-definition": BookOpenText, "negligence-position": UserRoundCheck, "negligence-refusal": ShieldX,
  "everyday-life": Footprints, household: House, "recreational-sport": Dumbbell,
  "recreational-cycling": Bike, "electric-vehicles": Zap, "electric-vehicles-sidewalk": Route,
  "electric-vehicles-definition": BookOpenText, "legally-held-weapons": Crosshair,
  "health-insurer-recourse": HeartPulse, electronics: Smartphone,
  "consequential-financial-loss": Banknote, "pure-financial-loss": WalletCards,
  dog: Dog, "multiple-dogs": PawPrint, cats: Cat, "other-pets": Rabbit, livestock: Fence, "animal-plant-damage": Sprout,
  "dangerous-animals": ShieldX, "commercial-animals": Banknote, "exotic-animals": PawPrint,
  "property-owner": KeyRound, "listed-property": House, "listed-property-land": LandPlot,
  "other-properties": Building2, "other-home": House, "other-holiday-home": Trees,
  "other-farm-building": Fence, "other-business-property": Building2, "other-apartment-building": Building2,
  "other-property-land": LandPlot, "other-separate-land": LandPlot, "other-property-territory": Globe2,
  "minor-building-work": Hammer, "self-build": Wrench,
  "rented-property": House, "rented-property-risks": ShieldCheck, "rented-equipment": KeyRound,
  "rented-equipment-risks": ShieldCheck, "borrowed-items": HeartHandshake, "item-lender": UserRoundCheck,
  "borrowed-tools": Wrench, "borrowed-sports-equipment": Dumbbell, "borrowed-animals": PawPrint,
  "borrowed-electronics": Smartphone, "borrowed-vehicle": CarFront, "rental-vehicle-deductible": WalletCards,
  "borrowed-motorboat": Ship, "borrowed-drone": Plane, "borrowed-aircraft": Plane,
  "landlord-tenant-belongings": KeyRound, "tenant-damage-to-landlord": House,
  "maximum-rental-income": Banknote, "rental-without-address": LandPlot, "landlord-territory": Globe2,
  partners: HeartHandshake, children: Baby, "direct-relatives": UsersRound,
  "limited-capacity-relative": HandHelping, "other-paying-members": WalletCards,
  "non-paying-friends": UsersRound, "household-helpers": HandHelping, "contracted-helpers": FileSignature,
};

export function getCriterionIcon(id: string, sectionId: string): LucideIcon {
  if (CRITERION_ICONS[id]) return CRITERION_ICONS[id];
  if (id.endsWith("childcare")) return Baby;
  if (id.endsWith("pet-care")) return PawPrint;
  if (id.endsWith("construction")) return Hammer;
  if (id.endsWith("property-care")) return House;
  if (id.endsWith("path-maintenance")) return Route;
  if (id.endsWith("chores")) return Wrench;
  return SECTION_ICONS[sectionId] ?? CalendarDays;
}
