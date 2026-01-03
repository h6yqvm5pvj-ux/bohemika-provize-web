// src/app/firebase-auth.ts
import { getAuth } from "firebase/auth";
import { firebaseApp } from "./firebase-app";

export const auth = getAuth(firebaseApp);
