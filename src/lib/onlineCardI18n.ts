export const ONLINE_CARD_LOCALES = ["cs", "en", "uk"] as const;

export type OnlineCardLocale = (typeof ONLINE_CARD_LOCALES)[number];
export type OnlineCardTranslatedFields = {
  title: string;
  bio: string;
  location: string;
  officeLabel: string;
};
export type OnlineCardTranslations = Partial<
  Record<Exclude<OnlineCardLocale, "cs">, Partial<OnlineCardTranslatedFields>>
>;
export type OnlineCardTestimonial = {
  id: string;
  quote: string;
  author: string;
  context: string;
  locale: OnlineCardLocale;
  published: boolean;
  submittedAt?: string;
};
export type OnlineCardPendingTestimonial = Omit<OnlineCardTestimonial, "published"> & {
  submittedAt: string;
};

export const resolveOnlineCardLocale = (value: unknown): OnlineCardLocale =>
  value === "en" || value === "uk" ? value : "cs";

export const ONLINE_CARD_LANGUAGE_OPTIONS: ReadonlyArray<{
  id: OnlineCardLocale;
  label: string;
  shortLabel: string;
  htmlLang: string;
}> = [
  { id: "cs", label: "Čeština", shortLabel: "CZ", htmlLang: "cs-CZ" },
  { id: "en", label: "English", shortLabel: "EN", htmlLang: "en" },
  { id: "uk", label: "Українська", shortLabel: "UA", htmlLang: "uk" },
];

export const onlineCardLanguageMeta = (locale: OnlineCardLocale) =>
  ONLINE_CARD_LANGUAGE_OPTIONS.find((option) => option.id === locale) ??
  ONLINE_CARD_LANGUAGE_OPTIONS[0];

const advisorServices = {
  cs: [
    "Životní pojištění a zajištění příjmu",
    "Pojištění majetku a odpovědnosti",
    "Pojištění vozidel a flotil",
    "Cestovní pojištění",
    "Pojištění cizinců",
    "Investice",
    "Úvěry a hypotéky",
    "Investiční drahé kovy",
  ],
  en: [
    "Life insurance and income protection",
    "Property and liability insurance",
    "Vehicle and fleet insurance",
    "Travel insurance and policy care",
    "Health insurance for foreigners",
    "Investments",
    "Loans and mortgages",
    "Investment precious metals",
  ],
  uk: [
    "Страхування життя та захист доходу",
    "Страхування майна та відповідальності",
    "Страхування транспортних засобів і автопарків",
    "Туристичне страхування та супровід договорів",
    "Медичне страхування для іноземців",
    "Інвестиції",
    "Кредити та іпотека",
    "Інвестиційні дорогоцінні метали",
  ],
} as const;

export const ONLINE_CARD_COPY = {
  cs: {
    preview: {
      advisorProfile: "Profil poradce",
      fullName: "Jméno a příjmení",
      fullNamePlaceholder: "Jméno a příjmení",
      title: "Pozice",
      titlePlaceholder: "Pozice / role",
      about: "O mně",
      bioPlaceholder: "Krátké představení pro veřejnou vizitku.",
      noBio: "Bez doplněného představení.",
      phone: "Telefon",
      website: "Web",
      companyId: "IČO",
      location: "Lokalita",
      contact: "Kontakt",
      scheduleMeeting: "Sjednat schůzku",
    },
    public: {
      share: "Sdílet vizitku",
      shareShort: "Sdílet",
      shareSuccess: "Odkaz na vizitku byl zkopírován do schránky.",
      shareError: "Odkaz se nepodařilo sdílet. Zkopírujte ho prosím z adresního řádku.",
      saveContact: "Uložit kontakt",
      displayMode: "Režim zobrazení vizitky",
      dark: "Tmavý",
      light: "Světlý",
      language: "Jazyk vizitky",
      office: "Kancelář",
      noOfficePhotos: "Bez nahraných fotek kanceláře.",
      previousOfficePhoto: "Předchozí fotka kanceláře",
      nextOfficePhoto: "Další fotka kanceláře",
      showOfficePhoto: "Zobrazit fotku kanceláře",
      openMaps: "Otevřít v Google mapách",
      noOfficeAddress: "Adresa kanceláře není vyplněná.",
      contact: "Kontakt",
      notFilled: "Nevyplněno",
      testimonialsKicker: "Zkušenosti klientů",
      testimonialsTitle: "Důvěra vzniká z dobré zkušenosti",
      testimonialsContextFallback: "Klient Bohemika",
      writeReview: "Napsat recenzi",
      reviewPrompt: "Máte zkušenost se spoluprací? Budu rád za vaši recenzi !",
      reviewTitle: "Napsat recenzi",
      reviewDescription: "Recenze se zobrazí až po schválení poradcem.",
      reviewName: "Jméno nebo iniciály",
      reviewNamePlaceholder: "Např. Jana K.",
      reviewContext: "Oblast spolupráce (volitelné)",
      reviewContextPlaceholder: "Např. Revize pojištění",
      reviewText: "Vaše zkušenost",
      reviewTextPlaceholder: "Napište krátce, s čím vám spolupráce pomohla…",
      reviewConsent: "Souhlasím se zveřejněním této recenze po schválení poradcem.",
      reviewSubmit: "Odeslat ke schválení",
      reviewSubmitting: "Odesílám…",
      reviewSubmitted: "Děkujeme. Recenze byla odeslána ke schválení.",
      reviewValidation: "Vyplňte prosím jméno, recenzi a souhlas se zveřejněním.",
      reviewGenericError: "Recenzi se nepodařilo odeslat. Zkuste to prosím znovu.",
      scheduleKicker: "Sjednat schůzku",
      scheduleTitle: "Domluvte si termín",
      scheduleDescription: "Vyplňte kontakt a zprávu. V nejbližší době vás budu kontaktovat.",
      closeForm: "Zavřít formulář",
      submitted: "Žádost byla odeslána. Brzy se ti ozveme.",
      onlineCardTitle: "Online vizitka Bohemika",
    },
    meeting: {
      steps: ["Oblast řešení", "Kontakt", "Zpráva"],
      topics: [
        "Pojištění vozidel",
        "Pojištění majetku",
        "Pojištění odpovědnosti",
        "Životní a úrazové pojištění",
        "Zdravotní pojištění cizinců",
        "Úvěry a hypotéky",
        "Investice",
        "Drahé kovy",
        "Jiné",
      ],
      chooseTopic: "Co chcete řešit",
      name: "Jméno a příjmení",
      namePlaceholder: "Jan Novák",
      phone: "Telefon",
      email: "E-mail",
      selectedTopics: "Vybrané oblasti",
      message: "Zpráva (volitelné)",
      messagePlaceholder: "Napište preferovaný termín nebo stručný důvod schůzky.",
      company: "Společnost",
      chooseTopicError: "Vyberte prosím alespoň jednu oblast, kterou chcete řešit.",
      contactError: "Vyplňte prosím jméno, telefon a platný e-mail.",
      selected: "Vybráno",
      characters: "znaků",
      fillContact: "Vyplňte kontaktní údaje.",
      back: "Zpět",
      continue: "Pokračovat",
      submitting: "Odesílám…",
      submit: "Odeslat",
      genericError: "Žádost se nepodařilo odeslat.",
    },
    advisor: {
      serviceKicker: "Co pro vás zajistím",
      serviceTitle: "Poradenství, které nekončí sjednáním",
      serviceLead:
        "Nejde mi jen o podpis smlouvy. Poznám vaši situaci, vyberu řešení, které dává smysl dnes i do budoucna, a zůstávám vám k dispozici i po sjednání. Srozumitelně, férově a s péčí, na kterou se můžete spolehnout, když ji opravdu potřebujete.",
      services: advisorServices.cs,
      aboutKicker: "O firmě",
      companyLead:
        "Využíváme více než dvacetileté zkušenosti z finančně-poradenského trhu. Díky tomu vždy vyhledáme účinné řešení vašich potřeb a požadavků.",
      companyParagraphs: [
        "Profesionální jednání poradců společnosti Bohemika je naprostou a nezbytnou samozřejmostí. Spokojenost klientů je pro nás na prvním místě a jednáme vždy pouze v jejich zájmu.",
        "Samozřejmostí je pro nás zvyšování odborné kvalifikace, dodržování důvěrnosti zpracovaných informací a dat našich klientů. Netolerujeme jakékoli porušení zákonů, legislativy či nečestné jednání.",
        "Vše pečlivě vysvětlíme, dbáme na vzájemné porozumění a klientům poskytujeme komplexní informace a služby v celé šíři finančního portfolia. Objektivní analýza aktuální individuální situace klienta a přesná definice realistického cíle jsou základem úspěšného splnění našeho úkolu.",
      ],
      pillarsKicker: "Na čem stavíme spolupráci",
      pillars: [
        ["Klient na prvním místě", "Jednáme v zájmu klienta a nasloucháme připomínkám."],
        ["Profesionální standard", "Dbáme na kvalitu, legislativu a transparentní postup."],
        ["Odborný růst", "Průběžně zvyšujeme kvalifikaci našich poradců."],
        ["Srozumitelné řešení", "Vysvětlujeme varianty jasně a bez zbytečných složitostí."],
      ],
      vig: "Bohemika je součástí koncernu VIG, který patří mezi největší evropské pojišťovací skupiny.",
      partnersKicker: "Partnerské instituce",
      partnersTitle: "Spolupracujeme s předními značkami",
    },
  },
  en: {
    preview: {
      advisorProfile: "Advisor profile", fullName: "Full name", fullNamePlaceholder: "Full name", title: "Role", titlePlaceholder: "Role / position", about: "About me", bioPlaceholder: "A short introduction for your public profile.", noBio: "No introduction has been added yet.", phone: "Phone", website: "Website", companyId: "Company ID", location: "Location", contact: "Contact", scheduleMeeting: "Book a meeting",
    },
    public: {
      share: "Share profile", shareShort: "Share", shareSuccess: "The profile link has been copied to your clipboard.", shareError: "The link could not be shared. Please copy it from the address bar.", saveContact: "Save contact", displayMode: "Profile appearance", dark: "Dark", light: "Light", language: "Profile language", office: "Office", noOfficePhotos: "No office photos have been added.", previousOfficePhoto: "Previous office photo", nextOfficePhoto: "Next office photo", showOfficePhoto: "Show office photo", openMaps: "Open in Google Maps", noOfficeAddress: "The office address has not been added.", contact: "Contact", notFilled: "Not provided", scheduleKicker: "Book a meeting", scheduleTitle: "Arrange an appointment", scheduleDescription: "Leave your contact details and a message. I will get back to you shortly.", closeForm: "Close form", submitted: "Your request has been sent. We will get back to you soon.", onlineCardTitle: "Bohemika online profile",
      testimonialsKicker: "Client experiences", testimonialsTitle: "Trust is built through good experience", testimonialsContextFallback: "Bohemika client", writeReview: "Write a review", reviewPrompt: "Have you worked with us? We would appreciate a short review.", reviewTitle: "Write a review", reviewDescription: "Your review will appear only after the advisor approves it.", reviewName: "Name or initials", reviewNamePlaceholder: "For example, Jane K.", reviewContext: "Area of cooperation (optional)", reviewContextPlaceholder: "For example, insurance review", reviewText: "Your experience", reviewTextPlaceholder: "Briefly describe how the cooperation helped you…", reviewConsent: "I agree that this review may be published after the advisor approves it.", reviewSubmit: "Send for approval", reviewSubmitting: "Sending…", reviewSubmitted: "Thank you. Your review was sent for approval.", reviewValidation: "Please enter your name, review and consent to publication.", reviewGenericError: "The review could not be sent. Please try again.",
    },
    meeting: {
      steps: ["What you need", "Contact", "Message"], topics: ["Vehicle insurance", "Property insurance", "Liability insurance", "Life and accident insurance", "Health insurance for foreigners", "Loans and mortgages", "Investments", "Precious metals", "Other"], chooseTopic: "What would you like to discuss", name: "Full name", namePlaceholder: "John Smith", phone: "Phone", email: "Email", selectedTopics: "Selected areas", message: "Message (optional)", messagePlaceholder: "Let us know your preferred time or briefly describe what you need.", company: "Company", chooseTopicError: "Please select at least one area you would like to discuss.", contactError: "Please enter your name, phone number and a valid email address.", selected: "Selected", characters: "characters", fillContact: "Enter your contact details.", back: "Back", continue: "Continue", submitting: "Sending…", submit: "Send request", genericError: "Your request could not be sent.",
    },
    advisor: {
      serviceKicker: "How I can help", serviceTitle: "Advice that continues after the policy is arranged", serviceLead: "The aim is not simply to arrange a policy, but to build a long-term relationship based on trust. I take the time to understand each client's situation, plans and concerns. Together, we set up insurance, investments and a financial plan that make sense today and remain useful as work, business, family or housing circumstances change. I regularly review policies, explain the options and recommend practical steps that protect clients from unnecessary risks. Good advice starts with trust and continues with long-term care.", services: advisorServices.en, aboutKicker: "About the company", companyLead: "We draw on more than twenty years of experience in financial advisory. This helps us find an effective solution for your needs and requirements.", companyParagraphs: ["Professional conduct is an essential standard for every Bohemika advisor. Client satisfaction comes first and we always act in the client's best interests.", "We continuously strengthen professional qualifications and protect the confidentiality of our clients' information and data. We do not tolerate breaches of law, regulations or unfair conduct.", "We explain everything carefully and provide clear, comprehensive information and services across the financial portfolio. An objective understanding of a client's current situation and a realistic goal are the basis of a successful solution."], pillarsKicker: "What our cooperation is built on", pillars: [["Client first", "We act in the client's best interests and listen carefully."], ["Professional standard", "We value quality, compliance and transparent processes."], ["Continuous expertise", "We continuously develop our professional knowledge."], ["Clear solutions", "We explain options clearly, without unnecessary complexity."]], vig: "Bohemika is part of VIG, one of Europe's largest insurance groups.", partnersKicker: "Partner institutions", partnersTitle: "We work with leading brands",
    },
  },
  uk: {
    preview: {
      advisorProfile: "Профіль консультанта", fullName: "Ім’я та прізвище", fullNamePlaceholder: "Ім’я та прізвище", title: "Посада", titlePlaceholder: "Посада / роль", about: "Про мене", bioPlaceholder: "Коротко представте себе для публічного профілю.", noBio: "Опис ще не додано.", phone: "Телефон", website: "Вебсайт", companyId: "ІПН компанії", location: "Місто", contact: "Контакти", scheduleMeeting: "Записатися на зустріч",
    },
    public: {
      share: "Поділитися профілем", shareShort: "Поділитися", shareSuccess: "Посилання на профіль скопійовано в буфер обміну.", shareError: "Не вдалося поділитися посиланням. Скопіюйте його з адресного рядка.", saveContact: "Зберегти контакт", displayMode: "Вигляд профілю", dark: "Темний", light: "Світлий", language: "Мова профілю", office: "Офіс", noOfficePhotos: "Фотографії офісу ще не додані.", previousOfficePhoto: "Попереднє фото офісу", nextOfficePhoto: "Наступне фото офісу", showOfficePhoto: "Показати фото офісу", openMaps: "Відкрити в Google Maps", noOfficeAddress: "Адресу офісу ще не вказано.", contact: "Контакти", notFilled: "Не вказано", scheduleKicker: "Записатися на зустріч", scheduleTitle: "Домовтеся про зустріч", scheduleDescription: "Залиште свої контакти та повідомлення. Я зв’яжуся з вами найближчим часом.", closeForm: "Закрити форму", submitted: "Ваш запит надіслано. Ми зв’яжемося з вами найближчим часом.", onlineCardTitle: "Онлайн-профіль Bohemika",
      testimonialsKicker: "Досвід клієнтів", testimonialsTitle: "Довіра народжується з гарного досвіду", testimonialsContextFallback: "Клієнт Bohemika", writeReview: "Написати відгук", reviewPrompt: "Маєте досвід співпраці? Будемо вдячні за короткий відгук.", reviewTitle: "Написати відгук", reviewDescription: "Відгук з’явиться лише після схвалення консультантом.", reviewName: "Ім’я або ініціали", reviewNamePlaceholder: "Наприклад, Олена К.", reviewContext: "Напрям співпраці (необов’язково)", reviewContextPlaceholder: "Наприклад, перегляд страхування", reviewText: "Ваш досвід", reviewTextPlaceholder: "Коротко напишіть, чим вам допомогла співпраця…", reviewConsent: "Я погоджуюся на публікацію цього відгуку після схвалення консультантом.", reviewSubmit: "Надіслати на схвалення", reviewSubmitting: "Надсилаємо…", reviewSubmitted: "Дякуємо. Відгук надіслано на схвалення.", reviewValidation: "Вкажіть ім’я, текст відгуку та згоду на публікацію.", reviewGenericError: "Не вдалося надіслати відгук. Спробуйте ще раз.",
    },
    meeting: {
      steps: ["Ваше питання", "Контакти", "Повідомлення"], topics: ["Страхування транспорту", "Страхування майна", "Страхування відповідальності", "Страхування життя та від нещасних випадків", "Медичне страхування для іноземців", "Кредити та іпотека", "Інвестиції", "Дорогоцінні метали", "Інше"], chooseTopic: "Що ви хочете обговорити", name: "Ім’я та прізвище", namePlaceholder: "Іван Петренко", phone: "Телефон", email: "Електронна пошта", selectedTopics: "Обрані теми", message: "Повідомлення (необов’язково)", messagePlaceholder: "Вкажіть бажаний час або коротко опишіть ваше питання.", company: "Компанія", chooseTopicError: "Будь ласка, виберіть хоча б одну тему для обговорення.", contactError: "Будь ласка, введіть ім’я, телефон і дійсну електронну адресу.", selected: "Обрано", characters: "символів", fillContact: "Введіть контактні дані.", back: "Назад", continue: "Продовжити", submitting: "Надсилаємо…", submit: "Надіслати запит", genericError: "Не вдалося надіслати запит.",
    },
    advisor: {
      serviceKicker: "Чим я можу допомогти", serviceTitle: "Консультації, що не закінчуються оформленням договору", serviceLead: "Мета — не просто оформити договір, а побудувати довгострокові відносини, засновані на довірі. Я приділяю час, щоб зрозуміти ситуацію, плани та побоювання кожного клієнта. Разом ми налаштовуємо страхування, інвестиції та фінансовий план, які мають сенс сьогодні й залишаються корисними, коли змінюються робота, бізнес, сім’я чи житло. Я регулярно переглядаю договори, пояснюю варіанти та рекомендую практичні кроки для захисту від непотрібних ризиків. Якісна консультація починається з довіри й продовжується довгостроковою підтримкою.", services: advisorServices.uk, aboutKicker: "Про компанію", companyLead: "Ми використовуємо понад двадцятирічний досвід у сфері фінансового консультування. Завдяки цьому знаходимо ефективні рішення для ваших потреб.", companyParagraphs: ["Професійна поведінка є необхідним стандартом для кожного консультанта Bohemika. Задоволеність клієнта для нас на першому місці, і ми завжди діємо в його інтересах.", "Ми постійно підвищуємо професійну кваліфікацію та захищаємо конфіденційність інформації й даних клієнтів. Ми не допускаємо порушень законів, правил або нечесних дій.", "Ми все ретельно пояснюємо та надаємо зрозумілу, комплексну інформацію і послуги в межах фінансового портфеля. Об’єктивне розуміння поточної ситуації клієнта й реалістична мета є основою успішного рішення."], pillarsKicker: "На чому ґрунтується наша співпраця", pillars: [["Клієнт передусім", "Ми діємо в інтересах клієнта й уважно слухаємо."], ["Професійний стандарт", "Ми цінуємо якість, дотримання правил і прозорі процеси."], ["Постійний розвиток", "Ми постійно розвиваємо професійні знання."], ["Зрозумілі рішення", "Ми пояснюємо варіанти чітко, без зайвої складності."]], vig: "Bohemika є частиною VIG — однієї з найбільших страхових груп Європи.", partnersKicker: "Партнерські установи", partnersTitle: "Ми співпрацюємо з провідними брендами",
    },
  },
} as const;

export const resolveOnlineCardTranslations = (
  value: unknown
): OnlineCardTranslations => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const raw = value as Record<string, unknown>;
  const out: OnlineCardTranslations = {};

  (["en", "uk"] as const).forEach((locale) => {
    const row = raw[locale];
    if (!row || typeof row !== "object" || Array.isArray(row)) return;
    const fields = row as Record<string, unknown>;
    const normalized: Partial<OnlineCardTranslatedFields> = {};
    (["title", "bio", "location", "officeLabel"] as const).forEach((key) => {
      const maxLength = key === "bio" ? 1_000 : key === "officeLabel" ? 160 : 120;
      const text = typeof fields[key] === "string" ? fields[key].trim().slice(0, maxLength) : "";
      if (text) normalized[key] = text;
    });
    if (Object.keys(normalized).length > 0) out[locale] = normalized;
  });

  return out;
};

export const resolveOnlineCardTestimonials = (value: unknown): OnlineCardTestimonial[] => {
  if (!Array.isArray(value)) return [];
  const testimonials: OnlineCardTestimonial[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
    const quote = typeof raw.quote === "string" ? raw.quote.trim().slice(0, 600) : "";
    if (!id || !quote || seen.has(id)) continue;
    const author = typeof raw.author === "string" ? raw.author.trim().slice(0, 80) : "";
    const context = typeof raw.context === "string" ? raw.context.trim().slice(0, 120) : "";
    const submittedAt = typeof raw.submittedAt === "string" ? raw.submittedAt.trim().slice(0, 48) : "";
    testimonials.push({
      id,
      quote,
      author,
      context,
      locale: resolveOnlineCardLocale(raw.locale),
      published: raw.published === true,
      ...(submittedAt ? { submittedAt } : {}),
    });
    seen.add(id);
    if (testimonials.length >= 6) break;
  }

  return testimonials;
};

export const resolveOnlineCardPendingTestimonials = (
  value: unknown
): OnlineCardPendingTestimonial[] => {
  if (!Array.isArray(value)) return [];
  const testimonials: OnlineCardPendingTestimonial[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const raw = entry as Record<string, unknown>;
    const id = typeof raw.id === "string" ? raw.id.trim().slice(0, 80) : "";
    const quote = typeof raw.quote === "string" ? raw.quote.trim().slice(0, 600) : "";
    const submittedAt = typeof raw.submittedAt === "string" ? raw.submittedAt.trim().slice(0, 48) : "";
    if (!id || !quote || !submittedAt || seen.has(id)) continue;
    const author = typeof raw.author === "string" ? raw.author.trim().slice(0, 80) : "";
    const context = typeof raw.context === "string" ? raw.context.trim().slice(0, 120) : "";
    testimonials.push({
      id,
      quote,
      author,
      context,
      locale: resolveOnlineCardLocale(raw.locale),
      submittedAt,
    });
    seen.add(id);
    if (testimonials.length >= 30) break;
  }

  return testimonials;
};
