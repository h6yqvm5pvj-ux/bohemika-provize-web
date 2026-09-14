# Client notes and meeting history

The client card's overview includes personal notes, calls and meetings. Each entry
records its author and creation time. Editing preserves its place in the history;
the modification time is shown separately. The first three entries are visible
initially, and older history loads in pages of 50.

Optional reminders use the existing `/api/cron/contract-note-reminders` job, daily
at 07:45 UTC (08:45 or 09:45 in Prague). They create an adviser inbox notification
and use existing push preferences and device tokens. The notification opens
`/klienti/{slug}?noteId={id}#client-notes`, including notes outside the first page.
No additional cron or Firestore index deployment is required.

Notes live in `clientCardsPrivate/{uid}/cards/{slug}/clientNotes/{id}` and are
private to that authenticated adviser, just like the saved personal client card.
The API disallows impersonation and uses private, no-store responses. Existing
Firestore fallback rules deny direct client access to both notes and the
server-owned `clientNoteReminders` queue.

Creating, editing or deleting a note updates its reminder queue entry in the same
transaction. Revisions prevent lost updates; a stable creation ID permits safe
request retries. Delivery claims and stable mailbox IDs suppress duplicates.
The worker checks the recipient's UID/email before delivery and respects a newer
revision when completing or releasing an older claim.

Validation covers API isolation, CRUD, reminder delivery/cancellation, overlapping
cron runs, retries, notification links, history pagination and the editor UI:

```sh
npx vitest run src/lib/server/clientNotes.test.ts src/app/_klienti/ClientNotesSection.test.tsx src/app/api/cron/contract-note-reminders/route.test.ts
```

These tests use an in-memory Firestore boundary and mocked delivery services;
they do not send real notifications.
