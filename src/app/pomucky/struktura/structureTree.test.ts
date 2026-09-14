import { describe, expect, it } from "vitest";
import { layoutStructure, NODE_WIDTH, type StructureMember } from "./structureTree";
const member = (email: string, managerEmail: string | null): StructureMember => ({ email, name: email, position: "poradce3", managerEmail });
describe("structure layout", () => {
  it("includes ancestors and descendants while separating sibling cards", () => {
    const layout = layoutStructure([member("boss", null), member("me", "boss"), member("a", "me"), member("b", "me")], "me");
    expect(layout.nodes).toHaveLength(4);
    expect(layout.edges).toHaveLength(3);
    expect(layout.levels).toBe(3);
    const a = layout.nodes.find((n) => n.email === "a")!;
    const b = layout.nodes.find((n) => n.email === "b")!;
    expect(b.x - a.x).toBeGreaterThan(NODE_WIDTH);
    expect(a.depth).toBe(2);
  });
  it("terminates cyclic and self-referential hierarchies without duplicating people", () => {
    expect(layoutStructure([member("a", "b"), member("b", "a")], "a").nodes).toHaveLength(2);
    expect(layoutStructure([member("a", "a")], "a").nodes).toHaveLength(1);
  });
  it("omits unrelated branches and returns an empty layout for an unknown user", () => {
    const members = [member("me", null), member("other", null)];
    expect(layoutStructure(members, "me").nodes.map((n) => n.email)).toEqual(["me"]);
    expect(layoutStructure(members, "missing").nodes).toEqual([]);
  });
});
