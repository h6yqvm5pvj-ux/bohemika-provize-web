export type ClientGender = "male" | "female";

export function getRecordClientWords(gender: ClientGender = "male") {
  const female = gender === "female";
  return {
    client: female ? "klientka" : "klient",
    Client: female ? "Klientka" : "Klient",
    clientGenitive: female ? "klientky" : "klienta",
    clientDative: female ? "klientce" : "klientovi",
    ClientDative: female ? "Klientce" : "Klientovi",
    clientInstrumental: female ? "klientkou" : "klientem",
    customerGenitive: female ? "zákaznice" : "zákazníka",
    customerAccusative: female ? "zákaznici" : "zákazníka",
    wasAcquainted: female ? "byla seznámena" : "byl seznámen",
    wasInformed: female ? "byla informována" : "byl informován",
    wasWarned: female ? "byla upozorněna" : "byl upozorněn",
    acquainted: female ? "seznámena" : "seznámen",
    warned: female ? "upozorněna" : "upozorněn",
    required: female ? "vyžadovala" : "vyžadoval",
    chose: female ? "zvolila" : "zvolil",
    requested: female ? "požadovala" : "požadoval",
    selected: female ? "vybrala" : "vybral",
    understood: female ? "porozuměla" : "porozuměl",
    had: female ? "měla" : "měl",
    decided: female ? "rozhodla" : "rozhodl",
    asked: female ? "dotazovala" : "dotazoval",
    obliged: female ? "povinna" : "povinen",
    recipient: female ? "jí" : "mu",
    byClient: female ? "jí" : "jím",
    possessiveDative: female ? "jejím" : "jeho",
  };
}

export function getRecordAdditionalRequirement(gender: ClientGender = "male") {
  const t = getRecordClientWords(gender);
  return `${t.Client} ${t.required} vysvětlení pojmů, které jsou uvedeny v pojistných podmínkách k požadovanému typu pojištění.`;
}
