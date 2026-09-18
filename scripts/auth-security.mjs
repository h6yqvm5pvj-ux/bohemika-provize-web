// Use the same revocation protocol in operator scripts as in the application.
import { createJiti } from "jiti";
const runtime = createJiti(import.meta.url)("../src/lib/server/tokenRevocation.ts");
export const withFirestoreTokenRevocation = runtime.withFirestoreTokenRevocation;
