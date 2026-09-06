import { adminDb, adminMessaging } from "@/lib/server/firebaseAdmin";
import { writeMailboxEntryOnce } from "@/lib/server/mailbox";
import { collectPushTokens } from "@/lib/server/pushTokens";
import type { IntranetSectionKey } from "@/app/intranet/sections";

const emailOf = (value: unknown) => typeof value === "string" ? value.trim().toLowerCase() : "";
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export function discussionNotificationChannels(profile: Record<string, unknown>, section: IntranetSectionKey, explicitlyFollowing: boolean) {
  const settings = record(profile.notificationSettings);
  const types = record(settings.types);
  const channels = record(settings.channels);
  const intranet = record(settings.intranet);
  const selected = intranet.mode !== "selected" || (Array.isArray(intranet.sections) && intranet.sections.includes(section));
  const inbox = types.intranet !== false && (explicitlyFollowing || selected);
  return { inbox, push: inbox && channels.push !== false };
}

export async function sendDiscussionCommentNotifications({ postId, commentId, section, sectionLabel, postAuthorEmail, commenterEmail, commenterName, origin }: {
  postId: string; commentId: string; section: IntranetSectionKey; sectionLabel: string;
  postAuthorEmail: string; commenterEmail: string; commenterName: string; origin: string;
}) {
  if (!adminDb) return;
  const db = adminDb;
  const states = db.collection("intranetWallPosts").doc(postId).collection("viewerStates");
  const owner = emailOf(postAuthorEmail);
  const actor = emailOf(commenterEmail);
  const [followers, ownerState] = await Promise.all([
    states.where("following", "==", true).get(),
    owner ? states.doc(owner).get() : Promise.resolve(null),
  ]);
  const recipients = new Map<string, boolean>();
  followers.docs.forEach(doc => {
    const email = emailOf(doc.id);
    if (email && email !== actor) recipients.set(email, true);
  });
  // Authors keep their existing comment notifications until they opt out.
  if (owner && owner !== actor && ownerState?.data()?.following !== false) {
    recipients.set(owner, ownerState?.data()?.following === true);
  }
  const emails = [...recipients.keys()];
  const deepLink = `/intranet?section=${encodeURIComponent(section)}&postId=${encodeURIComponent(postId)}`;
  const title = `Intranet • ${sectionLabel}`;
  for (let offset = 0; offset < emails.length; offset += 50) {
    const batch = emails.slice(offset, offset + 50);
    const snapshots = await db.getAll(...batch.flatMap(email => [db.collection("users").doc(email), db.collection("usersPrivate").doc(email)]));
    const results = await Promise.allSettled(batch.map(async (email, index) => {
      const profile = { ...snapshots[index * 2].data(), ...snapshots[index * 2 + 1].data() };
      const channels = discussionNotificationChannels(profile, section, recipients.get(email) === true);
      if (!channels.inbox) return;
      const body = email === owner
        ? `${commenterName} přidal(a) komentář k tvému příspěvku.`
        : `${commenterName} přidal(a) komentář do sledované diskuse.`;
      const result = await writeMailboxEntryOnce({
        recipientEmail: email, entryId: `intranet-comment-${commentId}`, type: "intranet_comment",
        title, body, deepLink, metadata: { postId, commentId, section, sectionLabel, commenterEmail: actor },
      });
      const tokens = collectPushTokens(profile).slice(0, 8);
      if (!result.written || !channels.push || !adminMessaging || !tokens.length) return;
      await adminMessaging.sendEachForMulticast({
        tokens, notification: { title, body },
        data: { type: "intranet_comment", postId, commentId, section, sectionLabel, commenterEmail: actor, commenterName, deepLink },
        webpush: { fcmOptions: { link: `${origin}${deepLink}` }, notification: { icon: "/pwa/icon-192.png", badge: "/pwa/icon-192.png", tag: `bohemika-intranet-comment-${postId}` } },
      });
    }));
    results.forEach(result => {
      if (result.status === "rejected") console.warn("Intranet discussion notification failed:", result.reason);
    });
  }
}
