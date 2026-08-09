import { describe, expect, it } from "vitest";

import {
  resolveOnlineCardLocale,
  resolveOnlineCardTranslations,
} from "./onlineCardI18n";

describe("online card localization", () => {
  it("accepts only supported public locales", () => {
    expect(resolveOnlineCardLocale("en")).toBe("en");
    expect(resolveOnlineCardLocale("uk")).toBe("uk");
    expect(resolveOnlineCardLocale("de")).toBe("cs");
    expect(resolveOnlineCardLocale(null)).toBe("cs");
  });

  it("keeps only supported translated profile fields", () => {
    expect(
      resolveOnlineCardTranslations({
        en: {
          title: "  Insurance advisor  ",
          bio: "Helping with insurance and finance.",
          unsupported: "ignored",
        },
        uk: {
          location: "Прага",
          officeLabel: "Bohemika Praha",
        },
        de: { title: "Ignored" },
      })
    ).toEqual({
      en: {
        title: "Insurance advisor",
        bio: "Helping with insurance and finance.",
      },
      uk: {
        location: "Прага",
        officeLabel: "Bohemika Praha",
      },
    });
  });
});
