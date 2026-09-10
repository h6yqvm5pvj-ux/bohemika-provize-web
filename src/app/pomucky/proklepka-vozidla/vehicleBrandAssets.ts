const BRAND_ALIASES: Record<string, readonly string[]> = {
  skoda: ["skoda"], audi: ["audi"], bmw: ["bmw"], mercedes: ["mercedes benz", "mercedes", "mb"],
  volkswagen: ["volkswagen", "vw"], toyota: ["toyota"], hyundai: ["hyundai"], kia: ["kia"],
  ford: ["ford"], renault: ["renault"], peugeot: ["peugeot"], citroen: ["citroen"], opel: ["opel"],
  dacia: ["dacia"], seat: ["seat"], nissan: ["nissan"], mazda: ["mazda"], honda: ["honda"],
  mitsubishi: ["mitsubishi"], fiat: ["fiat"], volvo: ["volvo"], tesla: ["tesla"], porsche: ["porsche"],
  jeep: ["jeep"], landrover: ["land rover", "landrover", "range rover"], chevrolet: ["chevrolet"],
  suzuki: ["suzuki"], subaru: ["subaru"], mini: ["mini"], alfaromeo: ["alfa romeo", "alfaromeo"],
};

export function vehicleBrandLogo(brand: string): string | null {
  if (/[<>/\\]/.test(brand)) return null;
  const normalized = brand.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const match = Object.entries(BRAND_ALIASES).find(([, aliases]) => aliases.some(alias => normalized === alias || normalized.startsWith(`${alias} `)));
  return match ? `/vehicle-brands/${match[0]}.svg` : null;
}
