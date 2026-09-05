This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Firestore rules tests

Install Java 21 or newer and the Firebase CLI, then run `npm run test:rules`.
The suite uses only the local Firestore emulator on `127.0.0.1:8180` and the
non-production project `demo-bohemika-rules`. It refuses to run against another
host and needs no production credentials. Ordinary `npm test` runs separately.

The rules tests cover adding, modifying and deleting every supported role alias,
identity and hierarchy fields, subscription/setup flags, profile replacement,
ordinary profile preferences and push tokens, contract isolation, support versus
admin/owner access, and the server-only client-card collection.

For a reviewed rules-only release, `node scripts/firestore-rules-release.mjs prepare <plan-directory>`
backs up the active source and records its ruleset ID and both SHA-256 hashes.
After testing and reviewing that exact candidate, the `deploy` command with the
same directory creates and activates it, refusing to overwrite a changed release.
The `verify` command checks the active source against the prepared candidate.
These commands use the configured Firebase Admin credentials and never modify
application documents. Rollback uses the previous ruleset ID saved in `plan.json`;
do not redeploy the website or Storage rules as part of a Firestore-only release.

## Server Rate Limiting

API rate limits use a shared Redis REST store when configured. Set these variables in production:

```bash
RATE_LIMIT_REDIS_REST_URL=...
RATE_LIMIT_REDIS_REST_TOKEN=...
```

The implementation also accepts `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` and Vercel KV `KV_REST_API_URL` / `KV_REST_API_TOKEN`. If no Redis REST credentials are present, the app falls back to per-process memory limits for local development.

## Mailbox encryption

Direct-message subjects, message bodies, and attachment bytes are encrypted on the server before they are stored in Firestore or Firebase Storage. Configure a dedicated 32-byte Base64 master key in every environment that can send or read encrypted messages:

```bash
MAILBOX_ENCRYPTION_KEY=<output of: openssl rand -base64 32>
MAILBOX_ENCRYPTION_KEY_ID=v1
```

The application uses envelope encryption with AES-256-GCM: every message and attachment receives a random data key and only the wrapped data key is persisted. Never expose these variables through `NEXT_PUBLIC_*` or commit their values.

For a key rotation, set a new `MAILBOX_ENCRYPTION_KEY` and a new `MAILBOX_ENCRYPTION_KEY_ID`. Keep earlier keys available for decryption as a JSON object until all retained messages have been re-encrypted:

```bash
MAILBOX_ENCRYPTION_PREVIOUS_KEYS='{"v1":"<previous Base64 key>"}'
```

If the active key is absent or invalid, sending fails closed. Existing legacy messages without an encryption envelope remain readable for backwards compatibility. Audit them with `npm run mailbox:encrypt-legacy`; after reviewing the dry-run summary, migrate them with `npm run mailbox:encrypt-legacy -- --apply`.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

Use `npm run build` so `scripts/check-image-runtime.mjs` verifies Next.js, `sharp`, and the native `libheif` loaded on the build platform before compilation. The same check is available as `npm run check:image-runtime`. It checks both the application's image upload dependency and the dependency resolved from Next.js, and fails if the August 2026 security fixes are missing. Confirm the `imageRuntimeSecurity: verified` record in the production build logs before promoting a deployment; checking a developer machine alone does not verify the Linux dependency used on Vercel.

Profile photos accept JPG, PNG, and WEBP. The image optimizer only accepts remote images from configured Firebase Storage buckets. `.vercelignore` excludes local environment files, audit evidence, and caches from CLI deployments.

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
