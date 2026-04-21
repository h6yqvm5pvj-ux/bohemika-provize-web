// src/app/firebase.ts
import {
  browserLocalPersistence,
  browserSessionPersistence,
  getAuth,
  initializeAuth,
  inMemoryPersistence,
  type Auth,
} from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { firebaseApp } from "./firebase-app";

function createClientAuth(): Auth {
  if (typeof window === "undefined") {
    return getAuth(firebaseApp);
  }

  try {
    return initializeAuth(firebaseApp, {
      // Safari může mít problém s default IndexedDB persistencí; fallback na session/memory.
      persistence: [
        browserLocalPersistence,
        browserSessionPersistence,
        inMemoryPersistence,
      ],
    });
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code !== "auth/already-initialized") {
      console.warn("[FirebaseAuth] initializeAuth fallback to getAuth()", error);
    }
    return getAuth(firebaseApp);
  }
}

export const auth = createClientAuth();
export const db = getFirestore(firebaseApp);
