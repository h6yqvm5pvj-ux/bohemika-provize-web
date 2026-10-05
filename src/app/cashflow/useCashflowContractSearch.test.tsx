// @vitest-environment happy-dom

import { act, StrictMode, useLayoutEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCashflowContractSearch } from "./useCashflowContractSearch";

describe("cashflow contract search debounce", () => {
  let root: Root | null;
  let latest: ReturnType<typeof useCashflowContractSearch>;
  let onCommit: (() => void) | undefined;
  const applied: string[] = [];

  function Harness({ identity }: { identity: string | null }) {
    const result = useCashflowContractSearch(identity);
    useLayoutEffect(() => { latest = result; onCommit?.(); });
    useLayoutEffect(() => { applied.push(result.query); }, [result.query]);
    return null;
  }
  const render = (identity: string | null = "account-a", strict = false) => act(async () => {
    const element = <Harness identity={identity} />;
    root!.render(strict ? <StrictMode>{element}</StrictMode> : element);
  });
  const input = (value: string) => act(async () => latest.setInput(value));
  const advance = (ms: number) => act(async () => vi.advanceTimersByTime(ms));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    root = createRoot(document.createElement("div"));
    applied.length = 0;
    onCommit = undefined;
  });
  afterEach(async () => {
    if (root) await act(async () => root!.unmount());
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("updates input immediately and applies only the latest query 200 ms after typing stops", async () => {
    await render();
    await input("A");
    await advance(100);
    await input("AB 12");
    expect(latest.input).toBe("AB 12");
    expect(latest.pending).toBe(true);
    await advance(199);
    expect(applied).toEqual([""]);
    await advance(1);
    expect(applied).toEqual(["", "ab12"]);
    expect(latest.pending).toBe(false);
  });

  it.each(["", " -- "])("clears immediately and cancels pending work for %j", async value => {
    await render();
    await input("ABC");
    await advance(200);
    await input("ABCD");
    await advance(100);
    await input(value);
    expect(latest.query).toBe("");
    expect(latest.pending).toBe(false);
    await advance(200);
    expect(applied).toEqual(["", "abc", ""]);
  });

  it("does not recalculate when only the query's formatting changes", async () => {
    await render();
    await input("AB12");
    await advance(200);
    await input("ab-12");
    expect(latest.input).toBe("ab-12");
    expect(latest.pending).toBe(false);
    await advance(200);
    expect(applied).toEqual(["", "ab12"]);
  });

  it.each([null, "account-b", "account-a|impersonated-b"])("clears applied and pending input on the first commit of scope %j", async identity => {
    await render();
    await input("ABC");
    await advance(200);
    await input("ABCD");
    let checked = false;
    onCommit = () => {
      checked = true;
      expect(latest.input).toBe("");
      expect(latest.query).toBe("");
      expect(latest.pending).toBe(false);
    };
    await render(identity);
    expect(checked).toBe(true);
    await advance(200);
    onCommit = undefined;
    await render();
    await advance(200);
    expect(latest.query).toBe("");
  });

  it("ignores input without an active identity", async () => {
    await render(null);
    await input("ABC");
    await advance(200);
    expect(latest.input).toBe("");
    expect(latest.query).toBe("");
  });

  it("cancels its timer on unmount", async () => {
    await render();
    await input("ABC");
    expect(vi.getTimerCount()).toBe(1);
    await act(async () => root!.unmount());
    root = null;
    expect(vi.getTimerCount()).toBe(0);
    await advance(200);
    expect(applied).toEqual([""]);
  });

  it("applies the query once under StrictMode", async () => {
    await render("account-a", true);
    await input("ABC");
    await advance(200);
    expect(applied.filter(query => query === "abc")).toEqual(["abc"]);
    expect(latest.pending).toBe(false);
  });
});
