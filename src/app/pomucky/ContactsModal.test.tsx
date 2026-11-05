// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { User } from "firebase/auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CONTACT_DIRECTORY_CHANGED_EVENT,
  type DirectoryContact,
  type ContactDirectoryGroup,
} from "@/app/lib/contactDirectory";

const mocks = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("@/app/lib/authenticatedApi", () => ({
  fetchAuthedJsonOrThrow: mocks.api,
}));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));
import { ContactsModal } from "./ContactsModal";

const userA = { uid: "manager-a", email: "manager-a@example.test" } as User;
const userB = { uid: "reader-b", email: "reader-b@example.test" } as User;
const syntheticContact = (
  overrides: Partial<DirectoryContact> = {},
): DirectoryContact => ({
  id: "synthetic-contact",
  institutionKey: "allianz",
  person: "Synthetic Support",
  phone: { display: "+420 777 000 111", href: "+420777000111" },
  audience: { type: "everyone" },
  ...overrides,
});
const directory = (
  options: {
    contacts?: DirectoryContact[];
    groups?: ContactDirectoryGroup[];
    canManage?: boolean;
    revision?: number;
    publicVersion?: string;
  } = {},
) => ({
  ok: true,
  contacts: [syntheticContact()],
  groups: [],
  canManage: true,
  revision: 1,
  publicVersion: `public-${options.revision ?? 1}`,
  ...options,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

let root: Root, container: HTMLDivElement;
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  mocks.api.mockReset().mockResolvedValue(directory());
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const button = (text: string) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find(
    (item) =>
      item.textContent?.trim() === text ||
      item.getAttribute("aria-label") === text,
  )!;
async function click(text: string) {
  const target = button(text);
  expect(target, text).toBeTruthy();
  await act(async () => target.click());
}
async function render(user: User | null = userA) {
  await act(async () =>
    root.render(<ContactsModal user={user} onClose={() => {}} />),
  );
}
async function fill(label: string, value: string) {
  const target = Array.from(
    container.querySelectorAll<HTMLLabelElement>("label"),
  )
    .find((item) => item.querySelector("span")?.textContent === label)
    ?.querySelector<HTMLInputElement>("input");
  expect(target, label).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(target, value);
    target!.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function openContact() {
  await click("Editovat");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[aria-label="Upravit kontakt Synthetic Support"]',
      )!
      .click(),
  );
}
async function submit() {
  await act(async () =>
    container
      .querySelector<HTMLFormElement>("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })),
  );
}
async function chooseAudience(value: string) {
  await act(async () =>
    container
      .querySelector<HTMLInputElement>(
        `input[name="contact-audience"][value="${value}"]`,
      )!
      .click(),
  );
}
const puts = () =>
  mocks.api.mock.calls
    .filter((call) => call[2]?.method === "PUT")
    .map((call) => JSON.parse(call[2].body));

describe("contact directory audience editor", () => {
  it("shows only server-provided contacts and keeps management unavailable to readers", async () => {
    mocks.api.mockResolvedValue(directory({ canManage: false }));
    await render(userB);
    expect(container.textContent).toContain("Synthetic Support");
    expect(
      container.querySelector('[aria-label="Určeno pro: Všichni"]'),
    ).not.toBeNull();
    expect(button("Editovat")).toBeUndefined();
    expect(button("Spravovat skupiny")).toBeUndefined();
    expect(mocks.api).toHaveBeenCalledExactlyOnceWith(
      userB,
      "/api/contacts",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("does not show fallback contacts without authentication or after a failed load", async () => {
    await render(null);
    expect(mocks.api).not.toHaveBeenCalled();
    expect(container.querySelector("article")).toBeNull();
    mocks.api.mockRejectedValue(new Error("unavailable"));
    await render();
    expect(container.querySelector("article")).toBeNull();
    expect(button("Editovat")).toBeUndefined();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "nepodařilo načíst",
    );
  });

  it("ignores an old account's late GET response", async () => {
    const first = deferred<ReturnType<typeof directory>>(),
      second = deferred<ReturnType<typeof directory>>();
    mocks.api.mockImplementation((user: User) =>
      user.uid === userA.uid ? first.promise : second.promise,
    );
    await render(userA);
    await render(userB);
    await act(async () =>
      first.resolve(
        directory({ contacts: [syntheticContact({ person: "Private A" })] }),
      ),
    );
    expect(container.textContent).not.toContain("Private A");
    expect(button("Editovat")).toBeUndefined();
    await act(async () =>
      second.resolve(
        directory({
          contacts: [syntheticContact({ person: "Visible B" })],
          canManage: false,
        }),
      ),
    );
    expect(container.textContent).toContain("Visible B");
    expect(container.textContent).not.toContain("Private A");
  });

  it("sends a targeted contact mutation with revision, explicit audience and all existing e-mails", async () => {
    const emails = Array.from({ length: 4 }, (_, index) => ({
      value: `support${index}@example.test`,
      label: `Support ${index}`,
      cc: `copy${index}@example.test`,
    }));
    const contact = syntheticContact({ audience: undefined, emails });
    mocks.api.mockImplementation(async (_user, _path, options) =>
      options.method === "GET"
        ? directory({ contacts: [contact] })
        : directory({
            contacts: [{ ...contact, audience: { type: "specialists" } }],
            revision: 2,
          }),
    );
    const changed = vi.fn();
    window.addEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, changed);
    try {
      await render();
      await openContact();
      expect(
        container.querySelector<HTMLInputElement>(
          'input[name="contact-audience"][value="everyone"]',
        )?.checked,
      ).toBe(true);
      await chooseAudience("specialists");
      await submit();
      expect(puts()).toEqual([
        {
          operation: "saveContact",
          revision: 1,
          publicVersion: "public-1",
          contact: expect.objectContaining({
            id: contact.id,
            audience: { type: "specialists" },
            emails,
          }),
        },
      ]);
      expect(puts()[0]).not.toHaveProperty("contacts");
      expect(changed).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, changed);
    }
  });

  it("requires a valid custom group before saving a contact", async () => {
    await render();
    await openContact();
    await chooseAudience("group");
    await submit();
    expect(puts()).toHaveLength(0);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Vyberte skupinu",
    );
  });

  it("ignores a late successful PUT after the account changes", async () => {
    const pending = deferred<ReturnType<typeof directory>>();
    mocks.api.mockImplementation(async (user: User, _path, options) =>
      options.method === "PUT"
        ? pending.promise
        : directory({
            contacts: user.uid === userA.uid ? [syntheticContact()] : [],
            canManage: user.uid === userA.uid,
          }),
    );
    const changed = vi.fn();
    window.addEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, changed);
    try {
      await render();
      await openContact();
      await submit();
      await render(userB);
      await act(async () =>
        pending.resolve(
          directory({ contacts: [syntheticContact({ person: "Private A" })] }),
        ),
      );
      expect(container.textContent).not.toContain("Private A");
      expect(container.textContent).not.toContain("Kontakt byl uložen");
      expect(changed).not.toHaveBeenCalled();
      expect(button("Editovat")).toBeUndefined();
    } finally {
      window.removeEventListener(CONTACT_DIRECTORY_CHANGED_EVENT, changed);
    }
  });

  it("preserves a draft after a revision conflict and retries only after an explicit refresh", async () => {
    let reads = 0,
      writes = 0;
    mocks.api.mockImplementation(async (_user, _path, options) => {
      if (options.method === "GET")
        return directory({ revision: ++reads, contacts: [syntheticContact()] });
      if (++writes === 1)
        return Promise.reject(
          Object.assign(new Error("conflict"), {
            status: 409,
            code: "contact-directory/revision-conflict",
          }),
        );
      return directory({ revision: 3 });
    });
    await render();
    await openContact();
    await fill("Jméno / kontaktní osoba", "Local Intent");
    await submit();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "mezitím změnil",
    );
    await click("Načíst aktuální verzi");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="např. Jana Nováková"]',
      )?.value,
    ).toBe("Local Intent");
    expect(puts()).toHaveLength(1);
    await submit();
    expect(puts().map((item) => item.revision)).toEqual([1, 2]);
    expect(puts()[1].contact.person).toBe("Local Intent");
  });

  it("refreshes the opaque public version when the private revision did not change", async () => {
    let reads = 0;
    let writes = 0;
    mocks.api.mockImplementation(async (_user, _path, options) => {
      if (options.method === "GET") {
        return directory({
          revision: 1,
          publicVersion: ++reads === 1 ? "public-before" : "public-after",
        });
      }
      if (++writes === 1) {
        throw Object.assign(new Error("conflict"), {
          status: 409,
          code: "contact-directory/revision-conflict",
        });
      }
      return directory({ revision: 2, publicVersion: "public-saved" });
    });
    await render();
    await openContact();
    await fill("Jméno / kontaktní osoba", "Preserved Intent");
    await submit();
    await click("Načíst aktuální verzi");
    expect(puts()).toHaveLength(1);
    await submit();
    expect(
      puts().map(({ revision, publicVersion }) => ({
        revision,
        publicVersion,
      })),
    ).toEqual([
      { revision: 1, publicVersion: "public-before" },
      { revision: 1, publicVersion: "public-after" },
    ]);
    expect(puts()[1].contact.person).toBe("Preserved Intent");
  });

  it("creates a custom group from a contact while preserving its unfinished fields", async () => {
    vi.useFakeTimers();
    const member = {
      uid: "reader-b",
      name: "Synthetic Member",
      email: "member@example.test",
    };
    const group = {
      id: "custom-group",
      name: "Podpora",
      members: [member],
      memberCount: 1,
    };
    mocks.api.mockImplementation(async (_user, path, options) => {
      if (path === "/api/contacts/members")
        return { ok: true, users: [member] };
      if (options.method === "GET") return directory();
      const body = JSON.parse(options.body);
      return body.operation === "saveGroup"
        ? directory({ groups: [group], revision: 2 })
        : directory({ groups: [group], revision: 3 });
    });
    await render();
    await openContact();
    await fill("Jméno / kontaktní osoba", "Unfinished Contact");
    await chooseAudience("group");
    await click("Vytvořit skupinu");
    await fill("Název skupiny", "Podpora");
    const search = container.querySelector<HTMLInputElement>(
      '[aria-label="Vyhledat členy skupiny"]',
    )!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(search, "Sy");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => vi.advanceTimersByTimeAsync(300));
    expect(mocks.api).toHaveBeenCalledWith(
      userA,
      "/api/contacts/members",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ query: "Sy" }),
      }),
    );
    await act(async () =>
      container
        .querySelector<HTMLInputElement>('input[type="checkbox"]')!
        .click(),
    );
    await submit();
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="např. Jana Nováková"]',
      )?.value,
    ).toBe("Unfinished Contact");
    expect(
      container.querySelector<HTMLSelectElement>(
        '[aria-label="Skupina kontaktu"]',
      )?.value,
    ).toBe(group.id);
    await submit();
    expect(puts()[0]).toEqual({
      operation: "saveGroup",
      revision: 1,
      publicVersion: "public-1",
      group: { name: "Podpora", memberUids: [member.uid] },
    });
    expect(puts()[1]).toMatchObject({
      operation: "saveContact",
      revision: 2,
      publicVersion: "public-2",
      contact: {
        person: "Unfinished Contact",
        audience: { type: "group", groupId: group.id },
      },
    });
  });

  it("lets an authorized editor edit an existing group's members and protects used groups from deletion", async () => {
    const member = {
      uid: "reader-b",
      name: "Synthetic Member",
      email: "member@example.test",
    };
    const group = {
      id: "other-editors-group",
      name: "Existing Group",
      members: [member],
      memberCount: 1,
    };
    mocks.api.mockResolvedValue(
      directory({
        contacts: [
          syntheticContact({ audience: { type: "group", groupId: group.id } }),
        ],
        groups: [group],
      }),
    );
    await render();
    await click("Spravovat skupiny");
    expect(
      container.querySelector<HTMLInputElement>(
        'input[placeholder="např. Podpora životního pojištění"]',
      )?.value,
    ).toBe(group.name);
    expect(button("Odstranit")?.disabled).toBe(true);
    await act(async () =>
      container
        .querySelector<HTMLButtonElement>(
          '[aria-label="Odebrat člena Synthetic Member"]',
        )!
        .click(),
    );
    await submit();
    expect(puts()[0]).toMatchObject({
      operation: "saveGroup",
      revision: 1,
      group: { id: group.id, name: group.name, memberUids: [] },
    });
  });

  it("filters contacts by their server-provided audience and custom group", async () => {
    const group = {
      id: "team-group",
      name: "Team Group",
      memberCount: 1,
      members: [],
    };
    mocks.api.mockResolvedValue(
      directory({
        groups: [group],
        contacts: [
          syntheticContact(),
          syntheticContact({
            id: "specialist-contact",
            person: "Specialist Support",
            audience: { type: "specialists" },
          }),
          syntheticContact({
            id: "group-contact",
            person: "Group Support",
            audience: { type: "group", groupId: group.id },
          }),
        ],
      }),
    );
    await render();
    const filter = container.querySelector<HTMLSelectElement>(
      '[aria-label="Filtrovat kontakty podle skupiny"]',
    )!;
    await act(async () => {
      filter.value = `group:${group.id}`;
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Group Support");
    expect(container.textContent).not.toContain("Synthetic Support");
    expect(container.textContent).not.toContain("Specialist Support");
    await act(async () => {
      filter.value = "specialists";
      filter.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(container.textContent).toContain("Specialist Support");
    expect(container.textContent).not.toContain("Group Support");
  });

  it("does not query for one character or expose a late member search after an account switch", async () => {
    vi.useFakeTimers();
    const pending = deferred<{
      users: { uid: string; name: string; email: string }[];
    }>();
    mocks.api.mockImplementation(async (user: User, path) =>
      path === "/api/contacts/members"
        ? pending.promise
        : directory({
            canManage: user.uid === userA.uid,
            contacts: user.uid === userA.uid ? [syntheticContact()] : [],
          }),
    );
    await render();
    await click("Spravovat skupiny");
    const input = container.querySelector<HTMLInputElement>(
      '[aria-label="Vyhledat členy skupiny"]',
    )!;
    const setQuery = async (value: string) => {
      await act(async () => {
        Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, value);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await act(async () => vi.advanceTimersByTimeAsync(300));
    };
    await setQuery("S");
    expect(
      mocks.api.mock.calls.filter(
        (call) => call[1] === "/api/contacts/members",
      ),
    ).toHaveLength(0);
    await setQuery("Sy");
    expect(
      mocks.api.mock.calls.filter(
        (call) => call[1] === "/api/contacts/members",
      ),
    ).toHaveLength(1);
    await render(userB);
    await act(async () =>
      pending.resolve({
        users: [
          {
            uid: "hidden",
            name: "Private Member A",
            email: "private-a@example.test",
          },
        ],
      }),
    );
    expect(container.textContent).not.toContain("Private Member A");
    expect(container.textContent).not.toContain("private-a@example.test");
  });

  it("shows group-in-use errors without treating them as revision conflicts", async () => {
    const group = {
      id: "now-used-group",
      name: "Existing Group",
      memberCount: 0,
      members: [],
    };
    mocks.api.mockImplementation(async (_user, _path, options) => {
      if (options.method === "GET") return directory({ groups: [group] });
      throw Object.assign(
        new Error(
          "Skupina obsahuje kontakty. Nejprve je přesuňte do jiné skupiny.",
        ),
        { status: 409, code: "contact-directory/group-in-use" },
      );
    });
    vi.stubGlobal("confirm", vi.fn().mockReturnValue(true));
    await render();
    await click("Spravovat skupiny");
    await click("Odstranit");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Skupina obsahuje kontakty",
    );
    expect(button("Načíst aktuální verzi")).toBeUndefined();
  });
});
