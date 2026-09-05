import { renderToStaticMarkup } from "react-dom/server";
import type { User as FirebaseUser } from "firebase/auth";
import { describe, expect, it, vi } from "vitest";

import { MailboxGroupManager } from "./MailboxGroupManager";

describe("MailboxGroupManager", () => {
  it("shows rename controls, member roles and safe remove actions", () => {
    const html = renderToStaticMarkup(
      <MailboxGroupManager
        user={{} as FirebaseUser}
        currentUserEmail="owner@example.cz"
        conversation={{
          ok: true,
          conversationId: "group_1234567890",
          groupName: "Tým hypotéky",
          ownerEmail: "owner@example.cz",
          canManage: true,
          active: true,
          muted: false,
          participantEmails: ["owner@example.cz", "anna@example.cz", "petr@example.cz"],
          participants: [
            { email: "owner@example.cz", name: "Majitel Skupiny" },
            { email: "anna@example.cz", name: "Anna Nováková" },
            { email: "petr@example.cz", name: "Petr Svoboda" },
          ],
        }}
        onClose={vi.fn()}
        onChanged={vi.fn()}
      />
    );

    expect(html).toContain("Správa skupiny");
    expect(html).toContain("Tým hypotéky");
    expect(html).toContain("3/12");
    expect(html).toContain("owner@example.cz · Ty");
    expect(html).toContain("Přidat člověka");
    expect(html).not.toContain("Odebrat Majitel Skupiny");
    expect(html).toContain("Odebrat Anna Nováková");
    expect(html).toContain("Odebrat Petr Svoboda");
  });
});
