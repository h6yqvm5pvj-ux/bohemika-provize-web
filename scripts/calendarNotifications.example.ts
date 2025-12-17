// scripts/calendarNotifications.example.ts
//
// Ukázková Cloud Function + plánovač (cron) pro odeslání FCM notifikací
// z kalendáře. Přizpůsob podle vaší deploy strategie (Firebase Functions /
// Cloud Run). Neintegruje se do Next.js buildu – slouží jako šablona.

import * as admin from "firebase-admin";

// Inicializace Admin SDK – očekává se, že credentials budou k dispozici
// přes GOOGLE_APPLICATION_CREDENTIALS nebo podobnou konfiguraci.
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

type CalendarEvent = {
  title: string;
  date: string; // "yyyy-MM-dd" (lokální čas, Europe/Prague)
  time?: string | null; // "HH:mm"
  note?: string | null;
  notify?: boolean;
};

type UserProfile = {
  fcmToken?: string | null;
  notifyMinutes?: number | null;
};

// Pomocná funkce: datum/čas z eventu -> JS Date v Europe/Prague
function eventDateTime(ev: CalendarEvent): Date | null {
  if (!ev.date) return null;
  const [y, m, d] = ev.date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const [hh, mm] = (ev.time ?? "00:00").split(":").map(Number);

  // Europe/Prague offset
  const prague = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(Date.UTC(y, m - 1, d, hh ?? 0, mm ?? 0)));

  const parts: Record<string, string> = {};
  prague.forEach((p) => {
    if (p.type !== "literal") parts[p.type] = p.value;
  });

  const yyyy = Number(parts.year);
  const MM = Number(parts.month);
  const DD = Number(parts.day);
  const HH = Number(parts.hour);
  const MIN = Number(parts.minute);

  if ([yyyy, MM, DD, HH, MIN].some((n) => Number.isNaN(n))) return null;

  return new Date(yyyy, MM - 1, DD, HH, MIN, 0, 0);
}

// Hlavní handler – zavolat z CRONu (např. každých 10–15 minut)
export async function sendCalendarNotifications() {
  const now = new Date();
  const horizonMinutes = 24 * 60; // hledáme události max 24h dopředu
  const horizon = new Date(now.getTime() + horizonMinutes * 60 * 1000);

  const usersSnap = await db.collection("users").get();

  for (const userDoc of usersSnap.docs) {
    const profile = userDoc.data() as UserProfile;
    const fcmToken = profile.fcmToken?.trim();
    if (!fcmToken) continue;

    const notifyMinutes = Math.max(
      0,
      Math.min(1440, profile.notifyMinutes ?? 60)
    );

    const eventsSnap = await db
      .collection("users")
      .doc(userDoc.id)
      .collection("calendarEvents")
      .get();

    for (const evDoc of eventsSnap.docs) {
      const ev = evDoc.data() as CalendarEvent;
      if (ev.notify === false) continue; // opt-out na eventu
      const dt = eventDateTime(ev);
      if (!dt) continue;

      const notifyAt = new Date(dt.getTime() - notifyMinutes * 60 * 1000);
      if (now >= notifyAt && now <= horizon && dt >= now) {
        const title = ev.title || "Událost v kalendáři";
        const bodyParts = [
          ev.date,
          ev.time ? `• ${ev.time}` : null,
          ev.note ? `• ${ev.note}` : null,
        ].filter(Boolean);

        try {
          await messaging.send({
            token: fcmToken,
            notification: {
              title,
              body: bodyParts.join(" "),
            },
            data: {
              type: "calendar_event",
              eventId: evDoc.id,
              date: ev.date,
              time: ev.time ?? "",
              note: ev.note ?? "",
              notifyMinutes: String(notifyMinutes),
              deepLink: "bohemika://calendar", // uprav podle appky
            },
          });
          console.log(
            `Sent calendar notification to ${userDoc.id} for ${evDoc.id}`
          );
        } catch (err) {
          console.error(
            `Failed to send notification to ${userDoc.id} for ${evDoc.id}`,
            err
          );
        }
      }
    }
  }
}

// Pokud nasazuješ jako Cloud Function (Firebase):
// exports.calendarNotifications = functions.pubsub
//   .schedule("every 15 minutes")
//   .timeZone("Europe/Prague")
//   .onRun(sendCalendarNotifications);
