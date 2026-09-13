"use client";

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "bohemka.sidebar.collapsed";
const listeners = new Set<() => void>();
let snapshot: boolean | undefined;
let unsaved = false;

function readPreference() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return snapshot ?? false;
  }
}

function getSnapshot() {
  return (snapshot ??= readPreference());
}

function onStorage(event: StorageEvent) {
  if (event.key !== STORAGE_KEY && event.key !== null) return;
  unsaved = false;
  snapshot = readPreference();
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  // Recheck after a period with no mounted navigation (e.g. on the login page).
  if (!listeners.size) {
    if (!unsaved) snapshot = readPreference();
    window.addEventListener("storage", onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (!listeners.size) window.removeEventListener("storage", onStorage);
  };
}

function toggleCollapsed() {
  snapshot = !getSnapshot();
  try {
    // This device preference contains no account or client data.
    window.localStorage.setItem(STORAGE_KEY, snapshot ? "1" : "0");
    unsaved = false;
  } catch {
    unsaved = true;
    // Still works in memory when browser storage is unavailable.
  }
  listeners.forEach((listener) => listener());
}

const getServerSnapshot = () => false;

export function useSidebarPreference() {
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return [collapsed, toggleCollapsed] as const;
}
