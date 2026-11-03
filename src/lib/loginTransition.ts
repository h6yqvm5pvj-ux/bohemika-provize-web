// A visual handoff between client routes. Never used to determine access.
// Keep it in memory so refreshes and other tabs do not replay the animation.
const TRANSITION_REQUEST_TTL_MS = 30_000;
let requestedUntil = 0;

export function requestLoginTransition(): void {
  requestedUntil = Date.now() + TRANSITION_REQUEST_TTL_MS;
}

export function consumeLoginTransition(): boolean {
  const requested = requestedUntil > Date.now();
  requestedUntil = 0;
  return requested;
}
