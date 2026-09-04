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

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
