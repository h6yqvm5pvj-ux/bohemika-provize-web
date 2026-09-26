# Cloud Functions

This directory restores the twelve deployed functions to version control and adds
their direct authentication, authorization and billing protections. Deploy these
functions separately from the Next.js application.

## Invariants

- Seven user-facing HTTP functions require a current, enabled Firebase account,
  verified email, enrolled TOTP, proof of MFA in the token, matching internal
  profile UID, and valid revocation state. Passkey custom tokens use the same
  `app_totp_enrolled` and `app_auth_generation` claims as the web application.
- Authentication and Firestore failures deny access. Rates are shared through
  the existing `_rateLimits` collection and `expiresAt` TTL field.
- Team messages derive authority from the authenticated manager and validate
  every recipient's hierarchy before sending anything. Device tokens stay on the
  server. Administrator impersonation continues through the web API's separately
  authorized local dispatch.
- Billing requires the configured webhook secret, an invoice ID and one uniquely
  matched customer. Invoice deduplication and subscription updates share a
  Firestore transaction. `billingWebhookInvoices` records must not expire or be
  made client-writable. The previous version's `lastInvoiceId` is recognized.
- `notifyManagerOnNewEntry` intentionally remains disabled, matching its actual
  deployed source from May 10. Existing schedules and other notification behavior
  are preserved.
- Public HTTP reachability is intentional for Firebase bearer authentication and
  the webhook. The four internal event/scheduled functions retain private IAM.
- Each function has its own runtime identity listed in `runtime.js`. Build uses
  `bf-build`, never a runtime identity with access to application secrets.

## Validation

```sh
npm --prefix functions ci --ignore-scripts --no-audit --no-fund
npm --prefix functions test
firebase emulators:exec --only firestore --project demo-bohemika-rules \
  --config firebase.rules-test.json "node --test functions/test/firestore.cjs"
```

Tests use synthetic data and mock outgoing messages/API calls. Integration tests
assert a local emulator and cannot run against the production Firestore endpoint.

## Deployment

Use an authorized operator identity. Preserve the explicit runtime/build accounts,
secret versions, event identities, scheduler identities and private invoker
bindings. Do not add Editor or project-wide Token Creator to repair a deployment.
The September 26 release patches the existing functions through the Cloud
Functions API with an explicit field mask, keeping their trigger configuration
and secret versions. A later Firebase CLI release must verify those settings.

Read each current configuration and IAM policy before changing it. Keep a private
backup of the original sources/configuration, use an archive containing only
`index.js`, `security.js`, `billing.js`, `runtime.js`, `package.json` and the lockfile,
then deploy and verify both the Cloud Functions and Cloud Run URLs. Remove old
permissions only after the new service identities have been tested successfully.

The custom Firestore runtime role allows entity reads, queries, creation and
updates, plus database metadata/transaction access. It intentionally does not
allow deleting entities, changing rules, IAM, accounts or service credentials.
Authentication functions add only `firebaseauth.users.get`; notification functions
add only `cloudmessaging.messages.create`. Three read-only notification functions
use the Firestore viewer role. Secrets are granted individually only to functions
that use them. Firestore IAM is database-wide: these roles do not enforce
collection-level authorization, so the code's access checks remain essential.

Personal Google-account MFA and the use of legacy keys by external integrations
require confirmation by the account/integration owner. Never infer MFA from a
successful CLI token refresh or revoke an unidentified external integration's key
as a substitute for completing its migration.
