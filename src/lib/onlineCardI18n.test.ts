import { describe, expect, it } from "vitest";

import {
  resolveOnlineCardLocale,
  resolveOnlineCardPendingTestimonials,
  resolveOnlineCardTestimonials,
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

  it("keeps only publishable testimonial fields and removes duplicates", () => {
    expect(
      resolveOnlineCardTestimonials([
        {
          id: "reference-1",
          quote: "  Everything was explained clearly. ",
          author: "John S.",
          context: "Family insurance review",
          locale: "en",
          published: true,
          submittedAt: "2026-08-09T12:00:00.000Z",
        },
        {
          id: "reference-1",
          quote: "Duplicate",
          locale: "cs",
          published: true,
        },
        {
          id: "empty-quote",
          quote: "   ",
          locale: "cs",
          published: true,
        },
      ])
    ).toEqual([
      {
        id: "reference-1",
        quote: "Everything was explained clearly.",
        author: "John S.",
        context: "Family insurance review",
        locale: "en",
        published: true,
        submittedAt: "2026-08-09T12:00:00.000Z",
      },
    ]);
  });

  it("keeps valid reviews awaiting approval separately from public testimonials", () => {
    expect(
      resolveOnlineCardPendingTestimonials([
        {
          id: "pending-1",
          quote: "  Friendly and professional help. ",
          author: "Jana K.",
          context: "Insurance review",
          locale: "cs",
          submittedAt: "2026-08-09T12:00:00.000Z",
        },
        {
          id: "pending-1",
          quote: "Duplicate",
          submittedAt: "2026-08-09T12:01:00.000Z",
        },
        {
          id: "missing-date",
          quote: "Ignored",
        },
      ])
    ).toEqual([
      {
        id: "pending-1",
        quote: "Friendly and professional help.",
        author: "Jana K.",
        context: "Insurance review",
        locale: "cs",
        submittedAt: "2026-08-09T12:00:00.000Z",
      },
    ]);
  });
});
