"use client";

import { Fragment, useSyncExternalStore, type ReactNode } from "react";
import { AppLayout } from "@/components/AppLayout";
import { getMeetingRecordContext, subscribeMeetingRecordContext, type MeetingRecordContext } from "@/app/lib/meetingRecordPrivacy";

export function MeetingRecordSession({ children }: { children: (owner: MeetingRecordContext) => ReactNode }) {
  const owner = useSyncExternalStore(subscribeMeetingRecordContext, getMeetingRecordContext, () => null);
  return owner ? <Fragment key={owner.generation}>{children(owner)}</Fragment> : (
    <AppLayout active="tools"><p role="status" className="px-4 py-12 text-center text-sm text-slate-600">Ověřuji přihlášení…</p></AppLayout>
  );
}
