# SecureCall

SecureCall is a Next.js + Convex WebRTC video calling app with device-bound cryptography:

- each browser device gets its own ECDSA key pair,
- private keys are non-exportable and stored in IndexedDB,
- peers verify identity with challenge-response over a WebRTC data channel,
- audio frames can be HMAC-protected with Insertable Streams when both browsers support it.

## Current implementation

### Authentication
- Password authentication via `@convex-dev/auth`.
- Login/register UI in `app/page.tsx`.
- A BundID-like flow is simulated in the UI (not real BundID integration):
  - verification animation,
  - local key generation,
  - device registration in Convex.

### Device cryptography
- Local key storage: IndexedDB (`secure-call-keys` / `keyPairs`).
- Device ID persisted in localStorage (`secure-call-device-id`).
- Identity signature algorithm: ECDSA P-256 + SHA-256.
- Private keys are generated with `extractable: false`.

### Calling
- User can call another registered user.
- Signaling (`offer`, `answer`, ICE) is exchanged via Convex tables.
- Incoming call modal supports accept/reject.
- Call controls: mute, camera on/off, end call, logout.

### Identity verification in-call
- Handshake runs over a dedicated `RTCDataChannel` (`handshake`).
- Mutual challenge-response signatures are verified using public keys from the `devices` table.
- Re-verification heartbeat runs every 30 seconds.
- UI states: `idle`, `waiting`, `responding`, `verifying`, `verified`, `warning`, `failed`.

### Audio packet protection (optional)
- Uses `RTCRtpScriptTransform` + worker (`public/audio-worker.js`).
- During handshake both sides perform ECDH (P-256) and derive an HMAC key.
- Outgoing audio frames include HMAC + monotonic counter.
- Incoming frames are validated; invalid/replayed frames are dropped.
- Security dashboard can simulate attacks by pausing sender-side signing.

## Tech stack

- Next.js 16 (App Router)
- React 19
- TypeScript (strict)
- Tailwind CSS v4
- Convex (schema, queries, mutations)
- `@convex-dev/auth` (password provider)
- WebRTC (media + ICE + data channel)
- Web Crypto API (ECDSA, ECDH, HMAC)

## Project structure

```text
secure-call/
├── app/
│   ├── api/route.ts                 # simple GET test route
│   ├── dashboard/page.tsx           # simple post-auth dashboard page
│   ├── generateToken/route.ts       # GET route returning random UUID
│   ├── utils/
│   │   ├── audio-signing.ts         # audio signing manager (main thread)
│   │   ├── crypto.ts                # key management + sign/verify + ECDH/HMAC
│   │   ├── handshake.ts             # challenge-response + heartbeat state machine
│   │   └── webrtc.ts                # RTCPeerConnection + signaling helpers
│   ├── videoCall/page.tsx           # main call UI + security dashboard
│   ├── ConvexClientProvider.tsx
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx                     # auth + simulated BundID flow
├── convex/
│   ├── _generated/*
│   ├── auth.config.ts
│   ├── auth.ts
│   ├── calls.ts
│   ├── devices.ts
│   ├── devtest.ts                   # dev-only security test mutations
│   ├── http.ts
│   ├── schema.ts
│   └── users.ts
├── public/
│   └── audio-worker.js              # worker for RTCRtpScriptTransform
├── next.config.ts
├── package.json
└── README.md
```

## Convex data model

Defined in `convex/schema.ts`.

### `users`
- `name?: string`
- `email?: string`

### `devices`
- `userId: Id<"users">`
- `deviceId: string`
- `publicKey: string` (JWK string)
- `deviceName?: string`
- `createdAt: number`

Indexes:
- `by_user` on `[userId]`
- `by_user_device` on `[userId, deviceId]`

### `calls`
- `callerId: Id<"users">`
- `calleeId: Id<"users">`
- `offer?: string`
- `answer?: string`
- `status: string` (`pending`, `accepted`, `connected`, `ended`, `rejected` in current app flow)
- `createdAt: number`

Index:
- `by_callee` on `[calleeId]`

### `iceCandidates`
- `callId: Id<"calls">`
- `senderId: Id<"users">`
- `candidate: string`
- `createdAt: number`

Index:
- `by_call` on `[callId]`

## Environment variables

Create `.env.local`:

```env
NEXT_PUBLIC_CONVEX_URL=https://<your-convex-deployment>.convex.cloud
CONVEX_SITE_URL=http://localhost:3000
```

`CONVEX_SITE_URL` is used in `convex/auth.config.ts`.

## Local development

### Prerequisites
- Node.js 18+
- npm
- Convex account

### Setup
1. Install dependencies:
   ```bash
   npm install
   ```
2. Start Convex in one terminal:
   ```bash
   npx convex dev
   ```
3. Start Next.js in another terminal:
   ```bash
   npm run dev
   ```
4. Open http://localhost:3000

For HTTPS local development:

```bash
npm run dev-https
```

## Scripts

- `npm run dev` — Next.js dev with Turbopack
- `npm run dev-https` — Next.js dev with experimental HTTPS
- `npm run build` — production build
- `npm run start` — production server
- `npm run lint` — linting

## Security notes (current state)

### Strong points
- Device private keys are non-exportable.
- Peer identity is actively verified with challenge-response signatures.
- Heartbeat re-verification reduces long-session trust drift.
- Optional per-frame audio integrity checks detect tampering/replay.

### Limitations
- Signaling payloads (`offer`, `answer`, `iceCandidates`) are stored as plain strings in Convex.
- `convex/devtest.ts` includes intentional tamper helpers for testing.
- BundID is only simulated in the UI.
- Audio signing requires browser support for `RTCRtpScriptTransform`.

## Development test utilities

`convex/devtest.ts` includes:
- `tamperPublicKey`
- `deleteDevice`

These functions are for local security testing workflows.

## Local Deployment
You can also deploy with convex locally, just use the documentation: https://github.com/get-convex/convex-backend/blob/main/self-hosted/README.md

## License

ISC (see LICENSE).
